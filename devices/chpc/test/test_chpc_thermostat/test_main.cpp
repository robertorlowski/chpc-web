// Scenariusz: pełny cykl pracy sprężarki (termostat), pompy obiegowe, EEV, energia cyklu.
#include <unity.h>
#include <chpc_sim.h>

using namespace chpc;

void setUp() {}
void tearDown() {}

void testNoStartAboveMinimumTemperature() {
  startAfterPowerOnPause();
  // T max 30, delta 5 -> T min 25; Ttarget 30 nie wymaga grzania
  runMs(5000);
  TEST_ASSERT_FALSE(compressor());
  std::string json = query();
  TEST_ASSERT_EQUAL_DOUBLE(30.0, jsonNumber(json, "Tmax"));
  TEST_ASSERT_EQUAL_DOUBLE(25.0, jsonNumber(json, "Tmin"));
}

void testWaitingPositionOfEevWhileIdle() {
  // po kalibracji zawór czeka w pozycji min(45, EEV min - 4) = 45
  TEST_ASSERT_TRUE(waitUntil([] { return EEV_cur_pos == 45 && EEV_apulses == 0; }, 60000) >= 0);
}

void testCompressorStartsBelowMinimumAndPumpsFollow() {
  setTemp("Ttarget", 24.0);
  long started = waitUntil([] { return compressor(); }, 3000);
  TEST_ASSERT_TRUE_MESSAGE(started >= 0, "sprężarka nie ruszyła poniżej T min");
  TEST_ASSERT_TRUE(waitUntil([] { return hotPump() && coldPump(); }, 4000) >= 0);
  runMs(2000);
  std::string json = query();
  TEST_ASSERT_EQUAL_DOUBLE(1, jsonNumber(json, "HPS"));
  TEST_ASSERT_EQUAL_DOUBLE(1, jsonNumber(json, "HCS"));
  TEST_ASSERT_EQUAL_DOUBLE(1, jsonNumber(json, "CCS"));
  TEST_ASSERT_DOUBLE_WITHIN(60.0, 1200.0, jsonNumber(json, "Watts"));
}

void testEevStaysWithinLimitsWhileRunning() {
  for (int k = 0; k < 60; k++) {
    runMs(1000);
    TEST_ASSERT_TRUE(EEV_cur_pos >= EEV_MINWORKPOS);
    TEST_ASSERT_TRUE(EEV_cur_pos <= EEV_MAXPULSES_OPEN);
  }
}

void testCompressorKeepsMinimumRunTime() {
  setTemp("Ttarget", 31.0);  // powyżej T max, ale od startu minęło ~1 min
  runMs(60000);
  TEST_ASSERT_TRUE_MESSAGE(compressor(), "sprężarka zatrzymana przed MINCYCLE_POWERON");
  long stopped = waitUntil([] { return !compressor(); }, 120000);
  TEST_ASSERT_TRUE(stopped >= 0);
}

void testEnergyAndRunTimeOfTheCycle() {
  std::string json = query();
  // ok. 3 min pracy przy 1200 W = ok. 60 Wh
  TEST_ASSERT_DOUBLE_WITHIN(12.0, 60.0, jsonNumber(json, "lt_pow"));
  TEST_ASSERT_DOUBLE_WITHIN(15.0, 180.0, jsonNumber(json, "lt_hp_on"));
  TEST_ASSERT_EQUAL_DOUBLE(0, jsonNumber(json, "HPS"));
}

void testPumpsStopWithDelayAfterCompressor() {
  // zimna po 10 s (Tbe, Tae > 0), gorąca po 60 s
  TEST_ASSERT_TRUE(coldPump() || hotPump());
  runMs(12000);
  TEST_ASSERT_FALSE(coldPump());
  TEST_ASSERT_TRUE(hotPump());
  runMs(50000);
  TEST_ASSERT_FALSE(hotPump());
}

void testRestartBlockedForMinimumOffTime() {
  setTemp("Ttarget", 24.0);
  runMs(10 * 60 * 1000UL, 2000);
  TEST_ASSERT_FALSE_MESSAGE(compressor(), "sprężarka ruszyła przed MINCYCLE_POWEROFF (20 min)");
  long started = waitUntil([] { return compressor(); }, 11 * 60 * 1000UL, 2000);
  TEST_ASSERT_TRUE(started >= 0);
}

void testSumpHeaterBelowThreshold() {
  setTemp("Tsump", 8.0);
  TEST_ASSERT_TRUE(waitUntil([] { return sumpHeater(); }, 3000) >= 0);
  setTemp("Tsump", 12.0);
  TEST_ASSERT_TRUE(waitUntil([] { return !sumpHeater(); }, 3000) >= 0);
}

void testLcdRotatesScreens() {
  bool seenCo = false, seenEev = false, seenPower = false;
  for (int k = 0; k < 20; k++) {
    runMs(1000);
    seenCo |= sim::lcd[0].find("CO:") != std::string::npos;
    seenEev |= sim::lcd[0].find("Be:") != std::string::npos;
    seenPower |= sim::lcd[1].find("W:") != std::string::npos;
  }
  TEST_ASSERT_TRUE(seenCo);
  TEST_ASSERT_TRUE(seenEev);
  TEST_ASSERT_TRUE(seenPower);
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(testNoStartAboveMinimumTemperature);
  RUN_TEST(testWaitingPositionOfEevWhileIdle);
  RUN_TEST(testCompressorStartsBelowMinimumAndPumpsFollow);
  RUN_TEST(testEevStaysWithinLimitsWhileRunning);
  RUN_TEST(testCompressorKeepsMinimumRunTime);
  RUN_TEST(testEnergyAndRunTimeOfTheCycle);
  RUN_TEST(testPumpsStopWithDelayAfterCompressor);
  RUN_TEST(testRestartBlockedForMinimumOffTime);
  RUN_TEST(testSumpHeaterBelowThreshold);
  RUN_TEST(testLcdRotatesScreens);
  return UNITY_END();
}
