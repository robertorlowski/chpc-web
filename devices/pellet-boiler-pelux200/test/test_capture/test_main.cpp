// Testy native na prawdziwym nagraniu magistrali kotła (test/fixtures/kociol-2026-10-03.txt,
// 5 min po starcie ecoNET, dwa odczyty ustawień). Pozwalają zmieniać parser, dekoder i logikę
// ecoNET bez dostępu do kotła. Uruchamianie: pio test -e native (katalog roboczy = projekt).
#include <unity.h>

#include <cstdio>
#include <cstring>
#include <string>
#include <vector>

#include <boiler_settings.hpp>
#include <econet.hpp>
#include "../../src/boiler_settings.cpp"
#include "../../src/ecomax_frame.cpp"
#include "../../src/econet.cpp"
#include <bus_watch.hpp>
#include "../../src/bus_watch.cpp"
#include <alerts_log.hpp>
#include "../../src/alerts_log.cpp"

namespace {
typedef std::vector<uint8_t> Bytes;

struct Recorded {
  uint32_t ms;
  bool tx;
  Bytes frame;
};

std::vector<Recorded> recording;
// drugie nagranie: sterowanie ręczne z panelu, pompa mieszacza 1 włączona i wyłączona
std::vector<Recorded> manualRecording;
// trzecie nagranie: zmiana zadanej CWU 55 → 50 °C (0x33, potwierdzenie 0xB3, ponowny odczyt)
std::vector<Recorded> setRecording;
// czwarte nagranie: zawory i pompy obu mieszaczy z panelu (mapa sterowania ręcznego)
std::vector<Recorded> mixerRecording;

void loadFile(const char *path, std::vector<Recorded> &out)
{
  if (!out.empty()) return;
  FILE *file = fopen(path, "r");
  TEST_ASSERT_NOT_NULL_MESSAGE(file, path);
  char line[4096];
  while (fgets(line, sizeof(line), file)) {
    if (line[0] == '#') continue;
    unsigned long ms;
    char direction[3];
    char hex[4000];
    if (sscanf(line, "%lu %2s %3999s", &ms, direction, hex) != 3) continue;
    Recorded entry{static_cast<uint32_t>(ms), strcmp(direction, "TX") == 0, {}};
    for (size_t i = 0; hex[i] && hex[i + 1]; i += 2) {
      unsigned value;
      sscanf(hex + i, "%2x", &value);
      entry.frame.push_back(static_cast<uint8_t>(value));
    }
    out.push_back(entry);
  }
  fclose(file);
}

void load()
{
  loadFile("test/fixtures/kociol-2026-10-03.txt", recording);
  loadFile("test/fixtures/kociol-2026-10-03-sterowanie-reczne.txt", manualRecording);
  loadFile("test/fixtures/kociol-2026-10-03-zmiana-cwu.txt", setRecording);
  loadFile("test/fixtures/kociol-2026-10-03-sterowanie-mieszacze.txt", mixerRecording);
}

bool parseRecorded(const Recorded &entry, EcomaxFrameParser &parser, EcomaxFrame &frame)
{
  for (uint8_t byte : entry.frame) parser.feed(byte);
  return parser.next(frame);
}

// Bajty z magistrali w kolejności nagrania (bez naszych TX — HW-519 ich nie słyszy).
Bytes busStream()
{
  Bytes stream;
  for (const Recorded &entry : recording) {
    if (!entry.tx) stream.insert(stream.end(), entry.frame.begin(), entry.frame.end());
  }
  return stream;
}
}

void setUp() { load(); }
void tearDown() {}

void testWholeRecordingParsesWithoutRejects()
{
  const Bytes stream = busStream();
  EcomaxFrameParser parser;
  EcomaxFrame frame;
  size_t frames = 0;
  for (uint8_t byte : stream) {
    parser.feed(byte);
    while (parser.next(frame)) frames++;
  }
  size_t expected = 0;
  for (const Recorded &entry : recording) expected += entry.tx ? 0 : 1;
  TEST_ASSERT_EQUAL_UINT32(expected, frames);
  TEST_ASSERT_EQUAL_UINT32(0, parser.rejectedCount());
}

// SensorData z kotła (zatrzymany, 2026-10-03): stan 0, zadane 67 / 55 °C jak na panelu.
void testSensorDataFromBoiler()
{
  size_t decoded = 0;
  for (const Recorded &entry : recording) {
    if (entry.tx || entry.frame[7] != ECOMAX_FRAME_SENSOR_DATA) continue;
    EcomaxFrameParser parser;
    for (uint8_t byte : entry.frame) parser.feed(byte);
    EcomaxFrame frame;
    TEST_ASSERT_TRUE(parser.next(frame));
    TEST_ASSERT_TRUE(isSensorDataFrame(frame));
    EcomaxSensorData data;
    TEST_ASSERT_TRUE(decodeSensorData(frame.data, frame.dataLength, data));
    TEST_ASSERT_TRUE(data.valid);
    TEST_ASSERT_EQUAL_UINT8(0, data.state);
    TEST_ASSERT_TRUE(data.heatingTarget.present);
    TEST_ASSERT_EQUAL_UINT8(67, data.heatingTarget.value);
    TEST_ASSERT_EQUAL_UINT8(55, data.waterHeaterTarget.value);
    TEST_ASSERT_TRUE(data.temperatures[0].present);  // temperatura kotła
    TEST_ASSERT_FLOAT_WITHIN(10.0f, 23.0f, data.temperatures[0].value);
    // Mieszacze po modułach, lambdzie i termostatach trafiają w te same bajty co mapa z nagrań
    // (punkt 1b kociol-ustawienia.md): mieszacz 1 od bajtu 156, mieszacz 2 od 164.
    TEST_ASSERT_TRUE(data.mixers[0].present);
    TEST_ASSERT_TRUE(data.mixers[1].present);
    TEST_ASSERT_EQUAL_UINT8(frame.data[160], data.mixers[0].target);
    TEST_ASSERT_EQUAL_UINT8(frame.data[162], data.mixers[0].status);
    TEST_ASSERT_EQUAL_UINT8(frame.data[168], data.mixers[1].target);
    TEST_ASSERT_EQUAL_UINT8(40, data.mixers[0].target);
    TEST_ASSERT_EQUAL_UINT8(27, data.mixers[1].target);
    TEST_ASSERT_FLOAT_WITHIN(10.0f, 20.0f, data.mixers[0].temperature);
    decoded++;
  }
  TEST_ASSERT_TRUE(decoded > 100);
}

// Nasze zapytania o ustawienia są bajt w bajt takie jak nagrane, a nagrane odpowiedzi
// regulatora (do 0x00) czytnik przyjmuje w kolejności.
void testSettingsExchangeMatchesRecording()
{
  BoilerSettingsReader reader;
  reader.start();
  uint8_t query[ECONET_MAX_FRAME];
  size_t checked = 0;
  for (const Recorded &entry : recording) {
    if (checked >= BOILER_SETTINGS_COUNT) break;
    if (entry.tx && entry.frame[7] != ECOMAX_FRAME_DEVICE_AVAILABLE && entry.frame[7] != 0xC0) {
      const size_t length = reader.nextRequest(entry.ms, query, sizeof(query));
      TEST_ASSERT_EQUAL_UINT32(entry.frame.size(), length);
      TEST_ASSERT_EQUAL_HEX8_ARRAY(entry.frame.data(), query, length);
      continue;
    }
    if (entry.tx) continue;
    EcomaxFrameParser parser;
    for (uint8_t byte : entry.frame) parser.feed(byte);
    EcomaxFrame frame;
    TEST_ASSERT_TRUE(parser.next(frame));
    if (reader.onResponse(frame, entry.ms)) checked++;
  }
  TEST_ASSERT_EQUAL_UINT32(BOILER_SETTINGS_COUNT, checked);
  TEST_ASSERT_FALSE(reader.busy());
  TEST_ASSERT_EQUAL_UINT32(423, reader.length(0));
  TEST_ASSERT_EQUAL_UINT8(140, reader.data(0)[2]);       // 140 parametrów kotła
  TEST_ASSERT_EQUAL_UINT8(67, reader.data(0)[3 + 98 * 3]);  // nr 98: temperatura zadana kotła
  uint8_t value, min, max;
  TEST_ASSERT_TRUE(ecomaxParameterValues(reader, 119, value, min, max));  // zadana CWU
  TEST_ASSERT_EQUAL_UINT8(55, value);
  TEST_ASSERT_EQUAL_UINT8(20, min);
  TEST_ASSERT_EQUAL_UINT8(70, max);
  TEST_ASSERT_FALSE(ecomaxParameterValues(reader, 3, value, min, max));    // nieużywany (FF)
  TEST_ASSERT_FALSE(ecomaxParameterValues(reader, 117, value, min, max));  // FF 00 FF: nieużywany jak w PyPlumIO
  // mieszacz 1 (indeks 0), nr 0: zadana 40 (40–50), jak w kopii ustawień; mieszacz 2 bez wartości
  TEST_ASSERT_TRUE(mixerParameterValues(reader, 0, 0, value, min, max));
  TEST_ASSERT_EQUAL_UINT8(40, value);
  TEST_ASSERT_EQUAL_UINT8(40, min);
  TEST_ASSERT_EQUAL_UINT8(50, max);
  TEST_ASSERT_FALSE(mixerParameterValues(reader, 1, 0, value, min, max));
  TEST_ASSERT_FALSE(mixerParameterValues(reader, 9, 0, value, min, max));
  TEST_ASSERT_FALSE(ecomaxParameterValues(reader, 200, value, min, max));  // poza odpowiedzią
}

// Na każde nagrane CheckDevice budujemy odpowiedź tego samego typu i adresu co nagrana.
void testCheckDeviceAnswersMatchRecording()
{
  EconetNetworkInfo network;
  const uint8_t ip[4] = {192, 168, 1, 20};
  memcpy(network.ip, ip, 4);
  strcpy(network.ssid, "dom");
  size_t answered = 0;
  for (size_t i = 0; i + 1 < recording.size(); i++) {
    const Recorded &entry = recording[i];
    if (entry.tx || entry.frame[7] != ECOMAX_FRAME_CHECK_DEVICE) continue;
    EcomaxFrameParser parser;
    for (uint8_t byte : entry.frame) parser.feed(byte);
    EcomaxFrame frame;
    TEST_ASSERT_TRUE(parser.next(frame));
    uint8_t out[ECONET_MAX_FRAME];
    const size_t length = buildEconetResponse(frame, network, out, sizeof(out));
    TEST_ASSERT_TRUE(length > 0);
    const Recorded &reply = recording[i + 1];
    TEST_ASSERT_TRUE(reply.tx);
    TEST_ASSERT_EQUAL_UINT32(reply.frame.size(), length);
    TEST_ASSERT_EQUAL_HEX8_ARRAY(reply.frame.data(), out, 8);  // nagłówek i typ 0xB0
    answered++;
  }
  TEST_ASSERT_TRUE(answered > 100);
}

// Fabryczny ecoNET w nagraniu milczy: osłona nie widzi obcych ramek od 0x56.
void testGuardSeesNoForeignEconet()
{
  EconetGuard guard;
  guard.begin(0);
  for (const Recorded &entry : recording) {
    if (entry.tx) continue;
    EcomaxFrameParser parser;
    for (uint8_t byte : entry.frame) parser.feed(byte);
    EcomaxFrame frame;
    TEST_ASSERT_TRUE(parser.next(frame));
    if (frame.sender == ECONET_ADDRESS) guard.onEconetFrame(frame, entry.ms);
  }
  TEST_ASSERT_EQUAL_UINT32(0, guard.foreignFrames());
}

// Sterowanie ręczne z panelu (docs/kociol-ustawienia.md, punkt 1b): SensorData ma stan 9,
// a w części mieszaczy (ramka 196 B, bajt 162) bit 0 = pompa mieszacza 1 — w nagraniu i 1, i 0.
// Normalna praca (cztery nagrania, w tym zapis parametru): ani razu nie ma 30 s ciszy, więc sterownik nie wysłałby
// StartMaster (0x19); w nagraniach nie ma też żadnej ramki 0x18/0x19.
void testNoStartMasterDuringNormalTraffic()
{
  load();
  for (const std::vector<Recorded> *source : {&recording, &manualRecording, &setRecording, &mixerRecording}) {
    BusSilenceWatch watch;
    EcomaxFrameParser parser;
    watch.begin(source->front().ms);
    uint32_t previous = source->front().ms;
    for (const Recorded &entry : *source) {
      if (entry.tx) continue;
      // pliki sklejone z kilku nagrań: czas liczy się od nowa (np. 512 s → 65 s), obserwacja też
      if (entry.ms < previous) watch.begin(entry.ms);
      previous = entry.ms;
      TEST_ASSERT_FALSE(watch.startMasterDue(entry.ms));
      EcomaxFrame frame;
      if (!parseRecorded(entry, parser, frame) || frame.sender == ECONET_ADDRESS) continue;
      watch.onFrame(frame, entry.ms);
    }
    TEST_ASSERT_EQUAL_UINT32(0, watch.eventCount());
  }
}

// Dziennik alarmów z nagrania bez panelu (2026-10-03): eSTER pyta (0x3D), panel odpowiada wszystkim (0xBD) po 10 wpisów.
// Czytnik zapisuje cudze odpowiedzi: 100 wpisów, wpis 83 = kod 19 (STB podajnika) 16.12.2025 20:37–20:39.
void testAlertsLogFromRecording()
{
  std::vector<Recorded> noPanel;
  loadFile("test/fixtures/kociol-2026-10-03-bez-panelu.txt", noPanel);
  AlertsLogReader reader;
  EcomaxFrameParser parser;
  for (const Recorded &entry : noPanel) {
    if (entry.tx) continue;
    for (uint8_t byte : entry.frame) parser.feed(byte);
    EcomaxFrame frame;
    while (parser.next(frame)) reader.onResponse(frame, entry.ms);
  }
  TEST_ASSERT_TRUE(reader.complete());
  TEST_ASSERT_EQUAL_UINT8(100, reader.total());
  TEST_ASSERT_EQUAL_UINT8(19, reader.entry(83).code);
  // 16.12.2025 20:37 w kalendarzu ecoMAX: rok 25 × 372 dni, 11 miesięcy × 31 dni, 15 dni (sekundy od 2000-01-01)
  const uint32_t from = ((25u * 372 + 11 * 31 + 15) * 24 + 20) * 3600 + 37 * 60;
  TEST_ASSERT_UINT32_WITHIN(59, from, reader.entry(83).from);
  TEST_ASSERT_EQUAL_UINT8(0, reader.entry(0).code);
}

void testManualControlRecording()
{
  size_t frames = 0, manual = 0, pumpOn = 0, pumpOff = 0;
  for (const Recorded &entry : manualRecording) {
    if (entry.tx) continue;
    EcomaxFrameParser parser;
    for (uint8_t byte : entry.frame) parser.feed(byte);
    EcomaxFrame frame;
    TEST_ASSERT_TRUE(parser.next(frame));
    frames++;
    if (!isSensorDataFrame(frame)) continue;
    EcomaxSensorData data;
    TEST_ASSERT_TRUE(decodeSensorData(frame.data, frame.dataLength, data));
    if (data.state != 9) continue;
    manual++;
    TEST_ASSERT_EQUAL_UINT32(196, frame.dataLength);
    const bool pump = (data.mixers[0].status & ECOMAX_MIXER_PUMP) != 0;
    TEST_ASSERT_EQUAL(frame.data[162] & 0x01, pump ? 1 : 0);
    if (pump) pumpOn++;
    else pumpOff++;
  }
  TEST_ASSERT_TRUE(frames > 1000);
  TEST_ASSERT_TRUE(manual > 10);
  TEST_ASSERT_TRUE(pumpOn > 0);
  TEST_ASSERT_TRUE(pumpOff > 0);
}

// Zawory mieszaczy z panelu: dekoder widzi otwieranie i zamykanie obu mieszaczy, a nigdy obu
// kierunków naraz.
void testMixerValvesRecording()
{
  size_t opening[2] = {0, 0}, closing[2] = {0, 0};
  for (const Recorded &entry : mixerRecording) {
    if (entry.tx) continue;
    EcomaxFrameParser parser;
    EcomaxFrame frame;
    TEST_ASSERT_TRUE(parseRecorded(entry, parser, frame));
    if (!isSensorDataFrame(frame)) continue;
    EcomaxSensorData data;
    TEST_ASSERT_TRUE(decodeSensorData(frame.data, frame.dataLength, data));
    for (int i = 0; i < 2; i++) {
      const uint8_t status = data.mixers[i].status;
      TEST_ASSERT_FALSE((status & ECOMAX_MIXER_OPENING) && (status & ECOMAX_MIXER_CLOSING));
      if (status & ECOMAX_MIXER_OPENING) opening[i]++;
      if (status & ECOMAX_MIXER_CLOSING) closing[i]++;
    }
  }
  for (int i = 0; i < 2; i++) {
    TEST_ASSERT_TRUE(opening[i] > 10);
    TEST_ASSERT_TRUE(closing[i] > 10);
  }
}

// Zmiana CWU 55 → 50 °C na kotle: nasza ramka 0x33 jak nagrana, regulator potwierdza 0xB3,
// w ponownym odczycie nr 119 = 50, a SensorData podaje zadaną CWU 50.
void testParameterChangeRecording()
{
  BoilerParameterWriter writer;
  writer.start(119, 50);
  uint8_t out[ECONET_MAX_FRAME];
  bool sent = false, confirmed = false, reread = false, sensorAfter = false;
  BoilerSettingsReader reader;
  for (const Recorded &entry : setRecording) {
    if (entry.tx && entry.frame[7] == ECOMAX_FRAME_SET_PARAMETER) {
      const size_t length = writer.nextRequest(entry.ms, out, sizeof(out));
      TEST_ASSERT_EQUAL_UINT32(entry.frame.size(), length);
      TEST_ASSERT_EQUAL_HEX8_ARRAY(entry.frame.data(), out, length);
      sent = true;
      continue;
    }
    if (entry.tx) continue;
    EcomaxFrameParser parser;
    EcomaxFrame frame;
    TEST_ASSERT_TRUE(parseRecorded(entry, parser, frame));
    if (sent && !confirmed && writer.onResponse(frame)) {
      confirmed = true;
      reader.start();
      reader.nextRequest(entry.ms, out, sizeof(out));  // pierwsze zapytanie: parametry kotła
      continue;
    }
    if (confirmed && !reread && reader.onResponse(frame, entry.ms)) {
      uint8_t value, min, max;
      TEST_ASSERT_TRUE(ecomaxParameterValues(reader, 119, value, min, max));
      TEST_ASSERT_EQUAL_UINT8(50, value);
      reread = true;
    }
    if (reread && isSensorDataFrame(frame)) {
      EcomaxSensorData data;
      TEST_ASSERT_TRUE(decodeSensorData(frame.data, frame.dataLength, data));
      TEST_ASSERT_EQUAL_UINT8(50, data.waterHeaterTarget.value);
      sensorAfter = true;
    }
  }
  TEST_ASSERT_TRUE(sent);
  TEST_ASSERT_TRUE(confirmed);
  TEST_ASSERT_TRUE(reread);
  TEST_ASSERT_TRUE(sensorAfter);
}

// Zmiany z panelu po tabeli wersji (1.7.2): przy zwykłej pracy żadnego odczytu, zmiana parametrów z panelu
// (0x38 2 → 3 → 4 w nagraniu sterowania ręcznego) = odczyt ustawień; włączenie regulatora bez panelu i z nim
// (nagranie bez panelu) = odczyty po starcie i zmiana dziennika alarmów (0x3D).
struct VersionTriggers {
  int settings = 0;
  int alerts = 0;
  uint8_t lastType = 0;
  uint16_t lastOld = 0, lastNew = 0;
};

VersionTriggers versionTriggers(const std::vector<Recorded> &entries)
{
  FrameVersionWatch watch;
  VersionTriggers result;
  for (const Recorded &entry : entries) {
    if (entry.tx) continue;
    EcomaxFrameParser parser;
    EcomaxFrame frame;
    if (!parseRecorded(entry, parser, frame) || !isSensorDataFrame(frame)) continue;
    EcomaxSensorData data;
    TEST_ASSERT_TRUE(decodeSensorData(frame.data, frame.dataLength, data));
    TEST_ASSERT_TRUE(data.frameVersionCount > 0);
    const uint8_t refresh = watch.onTable(data.frameVersions, data.frameVersionCount);
    if (refresh & FrameVersionWatch::REFRESH_SETTINGS) result.settings++;
    if (refresh & FrameVersionWatch::REFRESH_ALERTS) result.alerts++;
    if (refresh) {
      result.lastType = watch.changedType();
      result.lastOld = watch.oldVersion();
      result.lastNew = watch.newVersion();
    }
  }
  return result;
}

void testFrameVersionsRecordings()
{
  std::vector<Recorded> noPanel;
  loadFile("test/fixtures/kociol-2026-10-03-bez-panelu.txt", noPanel);

  VersionTriggers normal = versionTriggers(recording);
  TEST_ASSERT_EQUAL_INT(0, normal.settings);
  TEST_ASSERT_EQUAL_INT(0, normal.alerts);
  VersionTriggers mixers = versionTriggers(mixerRecording);
  TEST_ASSERT_EQUAL_INT(0, mixers.settings);
  TEST_ASSERT_EQUAL_INT(0, mixers.alerts);

  VersionTriggers manual = versionTriggers(manualRecording);
  TEST_ASSERT_EQUAL_INT(2, manual.settings);
  TEST_ASSERT_EQUAL_INT(0, manual.alerts);
  TEST_ASSERT_EQUAL_HEX8(0x38, manual.lastType);
  TEST_ASSERT_EQUAL_UINT16(3, manual.lastOld);
  TEST_ASSERT_EQUAL_UINT16(4, manual.lastNew);

  VersionTriggers restarts = versionTriggers(noPanel);
  TEST_ASSERT_EQUAL_INT(10, restarts.settings);
  TEST_ASSERT_EQUAL_INT(3, restarts.alerts);
}

int main(int, char **)
{
  UNITY_BEGIN();
  RUN_TEST(testWholeRecordingParsesWithoutRejects);
  RUN_TEST(testSensorDataFromBoiler);
  RUN_TEST(testSettingsExchangeMatchesRecording);
  RUN_TEST(testCheckDeviceAnswersMatchRecording);
  RUN_TEST(testGuardSeesNoForeignEconet);
  RUN_TEST(testNoStartMasterDuringNormalTraffic);
  RUN_TEST(testAlertsLogFromRecording);
  RUN_TEST(testManualControlRecording);
  RUN_TEST(testMixerValvesRecording);
  RUN_TEST(testParameterChangeRecording);
  RUN_TEST(testFrameVersionsRecordings);
  return UNITY_END();
}
