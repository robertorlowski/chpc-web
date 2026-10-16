// Testy BusDiagnostics (od 1.2.5): pole "diag" z odpowiedzi chmury, liczniki ramek nieoczekiwanych, wiek
// odpowiedzi CHPC i zrzuty tylko na zlecenie. Uruchamianie: pio test -e native.
#ifdef ARDUINO
#include <Arduino.h>
#endif
#include <unity.h>

#include <bus_diagnostics.hpp>

void setUp() {}
void tearDown() {}

static DiagRequest parse(const char *json)
{
  JsonDocument response;
  deserializeJson(response, json);
  return parseDiagRequest(response.as<JsonVariantConst>());
}

void testMissingDiagFieldMeansEverythingOff()
{
  const DiagRequest request = parse("{\"operation\":{},\"t_out\":5}");
  TEST_ASSERT_FALSE(request.active());
}

void testDiagFieldAcceptsNumbersAndStrings()
{
  const DiagRequest request = parse("{\"diag\":{\"hp_raw\":1,\"bus_sniff\":\"1\",\"hp_timeout_s\":\"8\",\"new_flag\":1}}");
  TEST_ASSERT_TRUE(request.hpRaw);
  TEST_ASSERT_TRUE(request.busSniff);
  TEST_ASSERT_EQUAL_UINT8(8, request.hpTimeoutS);
}

void testTimeoutOutsideRangeKeepsDefault()
{
  TEST_ASSERT_EQUAL_UINT8(0, parse("{\"diag\":{\"hp_timeout_s\":2}}").hpTimeoutS);
  TEST_ASSERT_EQUAL_UINT8(0, parse("{\"diag\":{\"hp_timeout_s\":16}}").hpTimeoutS);
  TEST_ASSERT_EQUAL_UINT8(15, parse("{\"diag\":{\"hp_timeout_s\":15}}").hpTimeoutS);
}

void testCountersAreAlwaysReportedWithoutDumps()
{
  BusDiagnostics diagnostics;
  const uint8_t late[] = {'{', '"', 'T', 'b', 'e', '"'};
  const uint8_t other[] = {0x69, 0x03, 0x02};
  diagnostics.onUnexpectedFrame(late, sizeof(late), 1000, 3200, 0);
  diagnostics.onUnexpectedFrame(other, sizeof(other), 2000, 100, 1);
  JsonDocument document;
  diagnostics.writeTo(document, 5000);
  TEST_ASSERT_EQUAL_UINT32(2, document["serial_unexpected_frame"].as<uint32_t>());
  TEST_ASSERT_EQUAL_UINT32(1, document["hp_late_frame"].as<uint32_t>());
  // od startu żadnej poprawnej odpowiedzi CHPC
  TEST_ASSERT_EQUAL_INT(-1, document["hp_last_ok_s"].as<int>());
  TEST_ASSERT_TRUE(document["diag"].isNull());
  TEST_ASSERT_TRUE(document["diag_bus"].isNull());
}

void testLastHpResponseAge()
{
  BusDiagnostics diagnostics;
  diagnostics.onHpResponse(10000);
  JsonDocument document;
  diagnostics.writeTo(document, 75500);
  TEST_ASSERT_EQUAL_INT(65, document["hp_last_ok_s"].as<int>());
}

void testDumpsOnlyWhenRequested()
{
  BusDiagnostics diagnostics;
  const uint8_t broken[] = {'{', '"', 'T', 0xFF};
  diagnostics.onHpInvalid(broken, sizeof(broken), 1000);  // przed zleceniem: bez zrzutu
  DiagRequest request;
  request.hpRaw = true;
  request.busSniff = true;
  request.hpTimeoutS = 8;
  diagnostics.configure(request);
  JsonDocument document;
  diagnostics.writeTo(document, 2000);
  TEST_ASSERT_TRUE(document["diag_hp_raw"].isNull());
  TEST_ASSERT_EQUAL_INT(8, document["diag"]["hp_timeout_s"].as<int>());

  diagnostics.onHpInvalid(broken, sizeof(broken), 3000);
  const uint8_t frame[] = {0x41, 0x01, 0x00, 0x00, 0xFF};
  diagnostics.onUnexpectedFrame(frame, sizeof(frame), 4000, 3100, 0);
  diagnostics.writeTo(document, 9000);
  TEST_ASSERT_EQUAL_STRING("7b2254ff", document["diag_hp_raw"]["hex"].as<const char *>());
  TEST_ASSERT_EQUAL_INT(4, document["diag_hp_raw"]["len"].as<int>());
  TEST_ASSERT_EQUAL_INT(6, document["diag_hp_raw"]["age_s"].as<int>());
  TEST_ASSERT_EQUAL_STRING("41010000ff", document["diag_bus"]["hex"].as<const char *>());
  TEST_ASSERT_EQUAL_INT(3100, document["diag_bus"]["since_write_ms"].as<int>());

  // wyłączenie zlecenia usuwa zrzuty i echo ustawień z telemetrii
  diagnostics.configure(DiagRequest());
  diagnostics.writeTo(document, 10000);
  TEST_ASSERT_TRUE(document["diag"].isNull());
  TEST_ASSERT_TRUE(document["diag_hp_raw"].isNull());
  TEST_ASSERT_TRUE(document["diag_bus"].isNull());
}

void testLongFrameIsCutToDumpSize()
{
  BusDiagnostics diagnostics;
  DiagRequest request;
  request.busSniff = true;
  diagnostics.configure(request);
  uint8_t frame[200];
  for (size_t i = 0; i < sizeof(frame); i++) frame[i] = static_cast<uint8_t>(i);
  diagnostics.onUnexpectedFrame(frame, sizeof(frame), 0, 0, 1);
  JsonDocument document;
  diagnostics.writeTo(document, 0);
  TEST_ASSERT_EQUAL_INT(200, document["diag_bus"]["len"].as<int>());
  TEST_ASSERT_EQUAL_size_t(BusDiagnostics::DUMP_BYTES * 2, strlen(document["diag_bus"]["hex"].as<const char *>()));
}

int runAllTests()
{
  UNITY_BEGIN();
  RUN_TEST(testMissingDiagFieldMeansEverythingOff);
  RUN_TEST(testDiagFieldAcceptsNumbersAndStrings);
  RUN_TEST(testTimeoutOutsideRangeKeepsDefault);
  RUN_TEST(testCountersAreAlwaysReportedWithoutDumps);
  RUN_TEST(testLastHpResponseAge);
  RUN_TEST(testDumpsOnlyWhenRequested);
  RUN_TEST(testLongFrameIsCutToDumpSize);
  return UNITY_END();
}

#ifdef ARDUINO
void setup()
{
  delay(2000);
  runAllTests();
}

void loop()
{
}
#else
int main()
{
  return runAllTests();
}
#endif
