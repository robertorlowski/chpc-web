// Scenariusz: komendy RS-485 z co, zapis w EEPROM, sklejone ramki, obcy ruch na magistrali, kontrakt JSON.
#include <unity.h>
#include <chpc_sim.h>

using namespace chpc;

void setUp() {}
void tearDown() {}

static std::string cmd(uint8_t c, uint8_t d1 = 0, uint8_t d2 = 0) {
  sendFrame(c, d1, d2);
  runMs(600);  // odstęp jak w co (COMMAND_GAP_MS 500)
  return query();
}

void testJsonContainsEveryKeyUsedByCoAndWeb() {
  startAfterPowerOnPause();
  std::string json = query();
  const char *keys[] = {"Tbe", "Tae", "Tco", "Tho", "Ttarget", "Tsump", "EEV_dt", "Tmax", "Tmin", "Watts", "EEV",
                        "EEV_pos", "EEV_pulse", "SHS", "HCS", "CCS", "HPS", "F", "CO", "WWatt", "EEVmax", "EEVmin",
                        "ERR", "ERRn", "ERRc", "lt_pow", "lt_hp_on"};
  for (const char *k : keys) TEST_ASSERT_TRUE_MESSAGE(jsonHas(json, k), k);
  TEST_ASSERT_EQUAL_CHAR('{', json.front());
  TEST_ASSERT_EQUAL_CHAR('}', json.back());
}

void testResponseTimeIsShort() {
  uint64_t latency = 0;
  TEST_ASSERT_TRUE(query(3000, &latency).size() > 0);
  TEST_ASSERT_TRUE_MESSAGE(latency < 60000, "odpowiedź RS-485 dłuższa niż 60 ms");
}

void testSetpointAndDeltaWithHundredths() {
  std::string json = cmd(0x04, 25, 50);
  TEST_ASSERT_EQUAL_DOUBLE(25.5, jsonNumber(json, "Tmax"));
  json = cmd(0x05, 3, 50);
  TEST_ASSERT_EQUAL_DOUBLE(22.0, jsonNumber(json, "Tmin"));
  json = cmd(0x04, 51, 0);  // > T_SETPOINT_MAX: ignorowane
  TEST_ASSERT_EQUAL_DOUBLE(25.5, jsonNumber(json, "Tmax"));
}

void testPowerLimitRange() {
  TEST_ASSERT_EQUAL_DOUBLE(3800, jsonNumber(cmd(0x0E, 38, 0), "WWatt"));
  TEST_ASSERT_EQUAL_DOUBLE(3800, jsonNumber(cmd(0x0E, 9, 0), "WWatt"));    // 900 W <= 1000: ignorowane
  TEST_ASSERT_EQUAL_DOUBLE(3800, jsonNumber(cmd(0x0E, 45, 0), "WWatt"));   // 4500 W > 4000: ignorowane
  TEST_ASSERT_EQUAL_DOUBLE(4000, jsonNumber(cmd(0x0E, 40, 0), "WWatt"));
}

void testEevLimitsMoveEachOther() {
  std::string json = cmd(0x0D, 200);
  TEST_ASSERT_EQUAL_DOUBLE(200, jsonNumber(json, "EEVmax"));  // bajt > 127 bez znaku
  json = cmd(0x0F, 70);
  TEST_ASSERT_EQUAL_DOUBLE(70, jsonNumber(json, "EEVmin"));
  json = cmd(0x0F, 210);  // minimum >= maksimum: maksimum = 211
  TEST_ASSERT_EQUAL_DOUBLE(211, jsonNumber(json, "EEVmax"));
  TEST_ASSERT_EQUAL_DOUBLE(210, jsonNumber(json, "EEVmin"));
  json = cmd(0x0D, 40);  // maksimum <= minimum: minimum = 39
  TEST_ASSERT_EQUAL_DOUBLE(40, jsonNumber(json, "EEVmax"));
  TEST_ASSERT_EQUAL_DOUBLE(39, jsonNumber(json, "EEVmin"));
  json = cmd(0x0F, 20);  // < 25: ignorowane
  TEST_ASSERT_EQUAL_DOUBLE(39, jsonNumber(json, "EEVmin"));
  json = cmd(0x0D, 25);  // <= 25: ignorowane
  TEST_ASSERT_EQUAL_DOUBLE(40, jsonNumber(json, "EEVmax"));
  json = cmd(0x0D, 67);
  json = cmd(0x0F, 49);
  TEST_ASSERT_EQUAL_DOUBLE(67, jsonNumber(json, "EEVmax"));
  TEST_ASSERT_EQUAL_DOUBLE(49, jsonNumber(json, "EEVmin"));
}

void testEevSuperheatSetpoint() {
  TEST_ASSERT_EQUAL_DOUBLE(2.5, jsonNumber(cmd(0x08, 2, 50), "EEV"));
}

void testForcedPumpsAndSumpHeater() {
  cmd(0x09, 1);
  cmd(0x0A, 1);
  std::string json = cmd(0x0B, 1);
  runMs(1500);
  TEST_ASSERT_TRUE(hotPump());
  TEST_ASSERT_TRUE(coldPump());
  TEST_ASSERT_TRUE(sumpHeater());
  TEST_ASSERT_EQUAL_DOUBLE(1, jsonNumber(json, "HCS"));
  cmd(0x09, 0);
  cmd(0x0A, 0);
  cmd(0x0B, 0);
  runMs(1500);
  TEST_ASSERT_FALSE(hotPump());
  TEST_ASSERT_FALSE(coldPump());
}

void testHeatingOffAndForceStart() {
  TEST_ASSERT_EQUAL_DOUBLE(0, jsonNumber(cmd(0x0C, 0), "CO"));
  setTemp("Ttarget", 10.0);
  runMs(3000);
  TEST_ASSERT_FALSE_MESSAGE(compressor(), "sprężarka ruszyła przy CO wyłączonym");
  setTemp("Ttarget", 30.0);
  TEST_ASSERT_EQUAL_DOUBLE(1, jsonNumber(cmd(0x0C, 1), "CO"));
  // T min = 22,0 (bez wymuszenia brak startu przy 22,0); z wymuszeniem próg to T max - 3 = 22,5
  setTemp("Ttarget", 22.0);
  runMs(2000);
  TEST_ASSERT_FALSE(compressor());
  TEST_ASSERT_EQUAL_DOUBLE(1, jsonNumber(cmd(0x03, 1), "F"));
  TEST_ASSERT_TRUE(waitUntil([] { return compressor(); }, 3000) >= 0);
}

void testBackToBackFramesAreAllApplied() {
  sendFrame(0x0D, 100);
  sendFrame(0x0E, 39, 0);
  runMs(600);
  std::string json = query();
  TEST_ASSERT_EQUAL_DOUBLE(100, jsonNumber(json, "EEVmax"));
  TEST_ASSERT_EQUAL_DOUBLE(3900, jsonNumber(json, "WWatt"));
}

void testForeignBusTrafficIsIgnored() {
  // odpowiedź falownika PV (Modbus 0x69) w buforze, potem zapytanie o dane
  const uint8_t pv[] = {0x69, 0x03, 0x04, 0x41, 0x0D, 0x05, 0xFF, 0x12, 0x34};
  for (uint8_t b : pv) sim::rx.push_back(b);
  runMs(600);
  std::string json = query();
  TEST_ASSERT_TRUE(json.size() > 0);
  TEST_ASSERT_EQUAL_DOUBLE(100, jsonNumber(json, "EEVmax"));  // bajty 0x41 0x0D 0x05 0xFF z PV nie zmieniły EEV
}

void testSettingsSurviveReboot() {
  resetGlobalsLikeReboot();
  setup();
  runMs(2000, 1000);
  std::string json = query();
  TEST_ASSERT_EQUAL_DOUBLE(25.5, jsonNumber(json, "Tmax"));
  TEST_ASSERT_EQUAL_DOUBLE(22.0, jsonNumber(json, "Tmin"));
  TEST_ASSERT_EQUAL_DOUBLE(3900, jsonNumber(json, "WWatt"));
  TEST_ASSERT_EQUAL_DOUBLE(100, jsonNumber(json, "EEVmax"));
  TEST_ASSERT_EQUAL_DOUBLE(49, jsonNumber(json, "EEVmin"));
  TEST_ASSERT_EQUAL_DOUBLE(2.5, jsonNumber(json, "EEV"));
  TEST_ASSERT_EQUAL_DOUBLE(1, jsonNumber(json, "CO"));
  TEST_ASSERT_EQUAL_DOUBLE(0, jsonNumber(json, "HCS"));  // wymuszenia pomp nie są trwałe
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(testJsonContainsEveryKeyUsedByCoAndWeb);
  RUN_TEST(testResponseTimeIsShort);
  RUN_TEST(testSetpointAndDeltaWithHundredths);
  RUN_TEST(testPowerLimitRange);
  RUN_TEST(testEevLimitsMoveEachOther);
  RUN_TEST(testEevSuperheatSetpoint);
  RUN_TEST(testForcedPumpsAndSumpHeater);
  RUN_TEST(testHeatingOffAndForceStart);
  RUN_TEST(testBackToBackFramesAreAllApplied);
  RUN_TEST(testForeignBusTrafficIsIgnored);
  RUN_TEST(testSettingsSurviveReboot);
  return UNITY_END();
}
