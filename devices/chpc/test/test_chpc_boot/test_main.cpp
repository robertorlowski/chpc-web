// Scenariusz: pierwszy start (wykrywanie czujników), odczyt EEPROM, przerwa startowa, RS-485.
#include <unity.h>
#include <chpc_sim.h>

using namespace chpc;

void setUp() {}
void tearDown() {}

void testDiscoveryStoresSensorsInEeprom() {
  defaultWorld();
  useDefaultPower();
  boot();

  TEST_ASSERT_EQUAL_HEX8(MAGIC, EEPROM.read(0));
  TEST_ASSERT_TRUE(Tae.e);
  TEST_ASSERT_TRUE(Tbe.e);
  TEST_ASSERT_TRUE(Ttarget.e);
  TEST_ASSERT_TRUE(Tsump.e);
  TEST_ASSERT_TRUE(Tbc.e);
  TEST_ASSERT_FALSE(Tci.e);
  TEST_ASSERT_FALSE(Tco.e);
  TEST_ASSERT_EQUAL_MEMORY(sensor("Tbc")->addr, Tbc.addr, 8);
  TEST_ASSERT_TRUE(sim::tx.find("OK! Remove Tbc") != std::string::npos);
}

void testSecondBootReadsSensorsFromEeprom() {
  resetGlobalsLikeReboot();
  sim::tx.clear();
  setup();

  TEST_ASSERT_TRUE(sim::tx.find("Insert") == std::string::npos);
  TEST_ASSERT_TRUE(sim::tx.find("Err, s.") == std::string::npos);
  TEST_ASSERT_EQUAL_MEMORY(sensor("Tae")->addr, Tae.addr, 8);
  TEST_ASSERT_TRUE(Tbc.e);
}

void testRs485AnswersDuringPowerOnPause() {
  setTemp("Ttarget", 20.0);  // poniżej T min: sprężarka chciałaby ruszyć
  runMs(5000);
  uint64_t latency = 0;
  std::string json = query(3000, &latency);
  TEST_ASSERT_TRUE_MESSAGE(json.size() > 0, "brak odpowiedzi JSON w czasie POWERON_PAUSE");
  TEST_ASSERT_EQUAL_DOUBLE(2.0, jsonNumber(json, "Tbe"));
  TEST_ASSERT_EQUAL_DOUBLE(0, jsonNumber(json, "HPS"));
  TEST_ASSERT_FALSE(compressor());
  TEST_ASSERT_TRUE_MESSAGE(latency < 700000, "odpowiedź dłuższa niż 0,7 s");
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(testDiscoveryStoresSensorsInEeprom);
  RUN_TEST(testSecondBootReadsSensorsFromEeprom);
  RUN_TEST(testRs485AnswersDuringPowerOnPause);
  return UNITY_END();
}
