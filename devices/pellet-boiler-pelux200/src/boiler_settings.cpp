// Implementacja boiler_settings.hpp.
#include <boiler_settings.hpp>

#include <cstring>

#include <econet.hpp>

// Typy i dane zapytań jak w PyPlumIO (frames/requests.py): [liczba = 255, pierwszy = 0].
const BoilerSettingsRequest BOILER_SETTINGS_REQUESTS[BOILER_SETTINGS_COUNT] = {
  {0x31, {255, 0}, 2, "ecomax_parameters"},
  {0x32, {255, 0}, 2, "mixer_parameters"},
  {0x5C, {255, 0}, 2, "thermostat_parameters"},
  {0x36, {0, 0}, 0, "schedules"},
  {0x55, {0, 0}, 0, "regulator_data_schema"},
};

void BoilerSettingsReader::start()
{
  index = 0;
  attempts = 0;
  awaiting = false;
}

void BoilerSettingsReader::advance()
{
  attempts = 0;
  awaiting = false;
  index = index + 1 < BOILER_SETTINGS_COUNT ? index + 1 : -1;
}

size_t BoilerSettingsReader::nextRequest(uint32_t nowMs, uint8_t *out, size_t outSize)
{
  if (index < 0 || awaiting) return 0;
  const BoilerSettingsRequest &request = BOILER_SETTINGS_REQUESTS[index];
  const size_t length = buildEconetFrame(ECOMAX_ADDRESS_ECOMAX, request.type, request.data, request.length, out, outSize);
  if (length == 0) return 0;
  awaiting = true;
  sentMs = nowMs;
  attempts++;
  return length;
}

void BoilerSettingsReader::cancelRequest()
{
  if (!awaiting) return;
  awaiting = false;
  if (attempts > 0) attempts--;
}

bool BoilerSettingsReader::onResponse(const EcomaxFrame &frame, uint32_t nowMs)
{
  // Regulator odsyła odpowiedź na adres rozgłoszeniowy 0x00, nie do 0x56 (kocioł 2026-10-03).
  if (index < 0 || frame.sender != ECOMAX_ADDRESS_ECOMAX) return false;
  if (frame.recipient != ECONET_ADDRESS && frame.recipient != ECOMAX_ADDRESS_BROADCAST) return false;
  if (frame.type != (BOILER_SETTINGS_REQUESTS[index].type | 0x80)) return false;
  const size_t length = frame.dataLength < MAX_DATA ? frame.dataLength : MAX_DATA;
  memcpy(stored[index], frame.data, length);
  storedLength[index] = length;
  present[index] = true;
  receivedAt[index] = nowMs;
  advance();
  return true;
}

namespace {
// Parametr nieużywany: żaden bajt trójki nie jest ani 0xFF, ani 0 (jak is_valid_parameter
// w PyPlumIO i serwer, np. nr 117 tego kotła: FF 00 FF).
bool usedTriple(const uint8_t *triple)
{
  for (int i = 0; i < 3; i++)
    if (triple[i] != 0xFF && triple[i] != 0) return true;
  return false;
}
}

bool ecomaxParameterValues(const BoilerSettingsReader &reader, uint8_t index, uint8_t &value, uint8_t &min,
  uint8_t &max)
{
  if (!reader.has(0)) return false;
  const uint8_t *data = reader.data(0);
  const size_t length = reader.length(0);
  if (length < 3) return false;
  const uint8_t first = data[1];
  const uint8_t count = data[2];
  if (index < first || index >= first + count) return false;
  const size_t at = 3 + 3 * static_cast<size_t>(index - first);
  if (at + 3 > length || !usedTriple(data + at)) return false;
  value = data[at];
  min = data[at + 1];
  max = data[at + 2];
  return true;
}

bool mixerReported(const BoilerSettingsReader &reader, uint8_t mixer)
{
  if (!reader.has(1)) return false;
  const uint8_t *data = reader.data(1);
  const size_t length = reader.length(1);
  if (length < 4 || mixer >= data[3]) return false;
  const uint8_t count = data[2];
  for (uint8_t index = 0; index < count; index++) {
    const size_t at = 4 + 3 * (static_cast<size_t>(mixer) * count + index);
    if (at + 3 <= length && usedTriple(data + at)) return true;
  }
  return false;
}

bool mixerParameterValues(const BoilerSettingsReader &reader, uint8_t mixer, uint8_t index, uint8_t &value,
  uint8_t &min, uint8_t &max)
{
  if (!reader.has(1)) return false;
  const uint8_t *data = reader.data(1);
  const size_t length = reader.length(1);
  if (length < 4) return false;
  const uint8_t first = data[1];
  const uint8_t count = data[2];
  const uint8_t mixers = data[3];
  if (mixer >= mixers || index < first || index >= first + count) return false;
  const size_t at = 4 + 3 * (static_cast<size_t>(mixer) * count + (index - first));
  if (at + 3 > length || !usedTriple(data + at)) return false;
  value = data[at];
  min = data[at + 1];
  max = data[at + 2];
  return true;
}

namespace {
const uint8_t *scheduleEntry(const BoilerSettingsReader &reader, uint8_t schedule)
{
  if (!reader.has(3)) return nullptr;
  const uint8_t *data = reader.data(3);
  const size_t length = reader.length(3);
  if (length < 3) return nullptr;
  const uint8_t count = data[2];
  for (size_t entry = 0; entry < count; entry++) {
    const size_t at = 3 + entry * SCHEDULE_ENTRY_SIZE;
    if (at + SCHEDULE_ENTRY_SIZE > length) return nullptr;
    if (data[at] == schedule) return data + at;
  }
  return nullptr;
}
}

bool scheduleSwitch(const BoilerSettingsReader &reader, uint8_t schedule, uint8_t &enabled)
{
  const uint8_t *entry = scheduleEntry(reader, schedule);
  if (!entry) return false;
  enabled = entry[1];
  return true;
}

size_t buildSetScheduleData(const BoilerSettingsReader &reader, uint8_t schedule, uint8_t enabled, uint8_t *out,
  size_t outSize)
{
  const uint8_t *entry = scheduleEntry(reader, schedule);
  if (!entry || outSize < SET_SCHEDULE_DATA_SIZE) return 0;
  out[0] = 1;
  out[1] = schedule;
  out[2] = enabled;
  out[3] = entry[2];  // wartość parametru (min i max nie idą)
  memcpy(out + 4, entry + 5, SCHEDULE_WEEK_SIZE);
  return SET_SCHEDULE_DATA_SIZE;
}

bool BoilerParameterWriter::startSchedule(uint8_t schedule, uint8_t enabled, const uint8_t *data, size_t length)
{
  if (length != SET_SCHEDULE_DATA_SIZE || !start(schedule, enabled, SCHEDULE)) return false;
  memcpy(scheduleData, data, length);
  scheduleLength = length;
  return true;
}

bool BoilerParameterWriter::start(uint8_t index, uint8_t value, uint8_t mixer)
{
  if (pending) return false;
  pending = true;
  mixerIndex = mixer;
  awaiting = false;
  attempts = 0;
  parameterIndex = index;
  parameterValue = value;
  lastResult = Result::NONE;
  return true;
}

size_t BoilerParameterWriter::nextRequest(uint32_t nowMs, uint8_t *out, size_t outSize)
{
  if (!pending || awaiting) return 0;
  // 0x33 [nr, wartość] dla kotła, 0x34 [mieszacz od 0, nr, wartość] dla mieszacza, 0x3B [0/1]
  // włącz/wyłącz regulator (PyPlumIO)
  const uint8_t boilerData[2] = {parameterIndex, parameterValue};
  const uint8_t mixerData[3] = {mixerIndex, parameterIndex, parameterValue};
  const size_t length = isSchedule()
    ? buildEconetFrame(ECOMAX_ADDRESS_ECOMAX, ECOMAX_FRAME_SET_SCHEDULE, scheduleData, scheduleLength, out, outSize)
    : isControl()
    ? buildEconetFrame(ECOMAX_ADDRESS_ECOMAX, ECOMAX_FRAME_CONTROL, &parameterValue, 1, out, outSize)
    : isMixer()
    ? buildEconetFrame(ECOMAX_ADDRESS_ECOMAX, ECOMAX_FRAME_SET_MIXER_PARAMETER, mixerData, 3, out, outSize)
    : buildEconetFrame(ECOMAX_ADDRESS_ECOMAX, ECOMAX_FRAME_SET_PARAMETER, boilerData, 2, out, outSize);
  if (length == 0) return 0;
  awaiting = true;
  sentMs = nowMs;
  attempts++;
  return length;
}

void BoilerParameterWriter::cancelRequest()
{
  if (!awaiting) return;
  awaiting = false;
  if (attempts > 0) attempts--;
}

bool BoilerParameterWriter::onResponse(const EcomaxFrame &frame)
{
  if (!pending || !awaiting || frame.sender != ECOMAX_ADDRESS_ECOMAX) return false;
  if (frame.recipient != ECONET_ADDRESS && frame.recipient != ECOMAX_ADDRESS_BROADCAST) return false;
  const uint8_t expected = isSchedule() ? ECOMAX_FRAME_SET_SCHEDULE_RESPONSE
    : isControl()                       ? ECOMAX_FRAME_CONTROL_RESPONSE
    : isMixer()                         ? ECOMAX_FRAME_SET_MIXER_PARAMETER_RESPONSE
                                        : ECOMAX_FRAME_SET_PARAMETER_RESPONSE;
  if (frame.type != expected) return false;
  pending = false;
  awaiting = false;
  lastResult = Result::CONFIRMED;
  return true;
}

void BoilerParameterWriter::update(uint32_t nowMs)
{
  if (!pending || !awaiting || nowMs - sentMs < TIMEOUT_MS) return;
  awaiting = false;
  // harmonogram bez ponawiania: regulator może nie odpowiadać na 0x37 (PyPlumIO nie czeka)
  if (isSchedule()) {
    pending = false;
    lastResult = Result::UNCONFIRMED;
    return;
  }
  if (attempts >= ATTEMPTS) {
    pending = false;
    lastResult = Result::FAILED;
  }
}

void BoilerSettingsReader::update(uint32_t nowMs)
{
  if (index < 0 || !awaiting || nowMs - sentMs < TIMEOUT_MS) return;
  awaiting = false;
  if (attempts >= ATTEMPTS) {
    failedCount++;
    advance();
  }
}
