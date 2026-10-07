// Dziennik alarmów kotła: opis w alerts_log.hpp.
#include <alerts_log.hpp>

#include <econet.hpp>

namespace {
uint32_t u32le(const uint8_t *p)
{
  return static_cast<uint32_t>(p[0]) | static_cast<uint32_t>(p[1]) << 8 | static_cast<uint32_t>(p[2]) << 16 |
    static_cast<uint32_t>(p[3]) << 24;
}
}

void AlertsLogReader::start()
{
  reading_ = true;
  next_ = 0;
  awaiting_ = false;
  attempts_ = 0;
}

size_t AlertsLogReader::nextRequest(uint32_t nowMs, uint8_t *out, size_t outSize)
{
  if (!reading_ || awaiting_) return 0;
  const uint8_t data[2] = {next_, PAGE};
  const size_t length = buildEconetFrame(ECOMAX_ADDRESS_ECOMAX, ECOMAX_FRAME_ALERTS, data, sizeof(data), out, outSize);
  if (length == 0) return 0;
  awaiting_ = true;
  sentMs_ = nowMs;
  attempts_++;
  return length;
}

void AlertsLogReader::cancelRequest()
{
  if (!awaiting_) return;
  awaiting_ = false;
  if (attempts_ > 0) attempts_--;
}

bool AlertsLogReader::onResponse(const EcomaxFrame &frame, uint32_t)
{
  if (frame.type != ECOMAX_FRAME_ALERTS_RESPONSE || frame.dataLength < 3) return false;
  const uint8_t total = frame.data[0];
  const uint8_t first = frame.data[1];
  const uint8_t count = frame.data[2];
  if (3 + static_cast<size_t>(count) * 9 > frame.dataLength) return false;
  bool changed = total != total_ || !received_;
  received_ = true;
  total_ = total;
  for (uint8_t i = 0; i < count; i++) {
    const size_t index = static_cast<size_t>(first) + i;
    if (index >= MAX_ENTRIES) break;
    const uint8_t *p = frame.data + 3 + static_cast<size_t>(i) * 9;
    AlertEntry entry;
    entry.code = p[0];
    entry.from = u32le(p + 1);
    entry.to = u32le(p + 5);
    if (!present_[index] || entries_[index].code != entry.code || entries_[index].from != entry.from ||
      entries_[index].to != entry.to) {
      changed = true;
    }
    entries_[index] = entry;
    present_[index] = true;
  }
  if (changed) revision_++;
  // nasza bieżąca strona (albo cudza, która ją obejmuje): następna albo koniec
  if (reading_ && first <= next_ && next_ < first + count) {
    awaiting_ = false;
    attempts_ = 0;
    const size_t after = static_cast<size_t>(first) + count;
    if (after >= total || after >= MAX_ENTRIES || count == 0) reading_ = false;
    else next_ = static_cast<uint8_t>(after);
  }
  if (reading_ && total == 0) reading_ = false;
  return true;
}

void AlertsLogReader::update(uint32_t nowMs)
{
  if (!reading_ || !awaiting_ || nowMs - sentMs_ < TIMEOUT_MS) return;
  awaiting_ = false;
  if (attempts_ >= ATTEMPTS) {
    reading_ = false;
    failed_++;
  }
}

bool AlertsLogReader::complete() const
{
  if (!received_) return false;
  const size_t n = entries();
  for (size_t i = 0; i < n; i++)
    if (!present_[i]) return false;
  return true;
}
