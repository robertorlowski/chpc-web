// Scenariusz: zawór EEV w postoju i przy starcie po długim postoju (2026-10-05).
// Postój: pozycja oczekiwania, po EEV_REST_CLOSE_MILLIS zero; przed startem otwarcie do pozycji
// oczekiwania; łagodny start: przy mokrej parze (Tae < Tbe) zawór schodzi poniżej EEV min do 40
// (EEV_SOFTSTART_MIN) przez EEV_SOFTSTART_MILLIS, potem wraca do EEV min.
#include <unity.h>
#include <chpc_sim.h>

using namespace chpc;

void setUp() {}
void tearDown() {}

static const int kWait = 45;                                  // min(45, EEV min 49 - 4)
static const int kSoftFloor = EEV_SOFTSTART_MIN;            // 40 (EEV min 49 jest wyżej)

void testWaitingPositionRightAfterBoot() {
  startAfterPowerOnPause();  // Ttarget 30 = T max: bez grzania
  TEST_ASSERT_TRUE(waitUntil([] { return EEV_cur_pos == kWait && EEV_apulses == 0; }, 60000) >= 0);
}

void testValveClosesAfterRestDelay() {
  // od włączenia (millis_last_heatpump_off = 0) minęło ok. 2 min: jeszcze pozycja oczekiwania
  TEST_ASSERT_EQUAL_INT(kWait, EEV_cur_pos);
  long closed = waitUntil([] { return EEV_cur_pos == 0 && EEV_apulses == 0; }, EEV_REST_CLOSE_MILLIS, 1000);
  TEST_ASSERT_TRUE_MESSAGE(closed >= 0, "zawór nie domknął się w postoju");
  TEST_ASSERT_TRUE(millis() > EEV_REST_CLOSE_MILLIS);
  runMs(30000, 1000);
  TEST_ASSERT_EQUAL_INT(0, EEV_cur_pos);
}

void testValveOpensBeforeStartAndCompressorWaits() {
  setTemp("Ttarget", 24.0);
  long started = waitUntil([] { return compressor(); }, 20000);
  TEST_ASSERT_TRUE(started >= 0);
  TEST_ASSERT_TRUE_MESSAGE(started >= 1000, "sprężarka ruszyła przy zamkniętym zaworze");
  TEST_ASSERT_TRUE(EEV_cur_pos >= kWait);
}

void testWetStartClosesBelowMinimumButNotBelowFloor() {
  // mokra para: Tae 1 K poniżej Tbe; dawniej fabs() dawało +1 K = nastawa, zawór stał
  setTemp("Tbe", 3.0);
  setTemp("Tae", 2.0);
  int lowest = EEV_cur_pos;
  for (int k = 0; k < 35; k++) {  // w czasie łagodnego startu (1 min od startu)
    runMs(1000);
    if (EEV_cur_pos < lowest) lowest = EEV_cur_pos;
  }
  TEST_ASSERT_TRUE(compressor());
  TEST_ASSERT_EQUAL_INT(kSoftFloor, EEV_floor);
  TEST_ASSERT_EQUAL_INT_MESSAGE(kSoftFloor, lowest, "zawór nie zszedł do granicy łagodnego startu (albo poniżej niej)");
  std::string json = query();
  TEST_ASSERT_EQUAL_DOUBLE(-1.0, jsonNumber(json, "EEV_dt"));
}

void testAfterSoftStartValveBackToMinimum() {
  runMs(EEV_SOFTSTART_MILLIS, 1000);  // koniec łagodnego startu (min. praca 3 min, Ttarget 24: dalej grzeje)
  TEST_ASSERT_TRUE(compressor());
  TEST_ASSERT_TRUE(waitUntil([] { return EEV_cur_pos >= xEEV_MINWORKPOS; }, 5000) >= 0);
  for (int k = 0; k < 30; k++) {
    runMs(1000);
    TEST_ASSERT_TRUE(EEV_cur_pos >= xEEV_MINWORKPOS);
  }
}

void testDrySuperheatOpensValve() {
  setTemp("Tbe", 2.0);
  setTemp("Tae", 8.0);  // przegrzanie 6 K > nastawa + histereza + 4: szybkie otwieranie
  int before = EEV_cur_pos;
  runMs(20000, 1000);
  TEST_ASSERT_TRUE(EEV_cur_pos > before);
  TEST_ASSERT_TRUE(EEV_cur_pos <= EEV_MAXPULSES_OPEN);
}

void testAfterStopWaitingPositionThenClosed() {
  setTemp("Tae", 5.0);
  setTemp("Ttarget", 31.0);
  TEST_ASSERT_TRUE(waitUntil([] { return !compressor(); }, MINCYCLE_POWERON, 1000) >= 0);  // min. czas pracy 3 min
  TEST_ASSERT_TRUE(waitUntil([] { return EEV_cur_pos == kWait && EEV_apulses == 0; }, 60000) >= 0);
  runMs(EEV_REST_CLOSE_MILLIS - 120000, 1000);
  TEST_ASSERT_EQUAL_INT_MESSAGE(kWait, EEV_cur_pos, "zawór domknięty przed wyrównaniem ciśnień");
  TEST_ASSERT_TRUE(waitUntil([] { return EEV_cur_pos == 0 && EEV_apulses == 0; }, 180000, 1000) >= 0);
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(testWaitingPositionRightAfterBoot);
  RUN_TEST(testValveClosesAfterRestDelay);
  RUN_TEST(testValveOpensBeforeStartAndCompressorWaits);
  RUN_TEST(testWetStartClosesBelowMinimumButNotBelowFloor);
  RUN_TEST(testAfterSoftStartValveBackToMinimum);
  RUN_TEST(testDrySuperheatOpensValve);
  RUN_TEST(testAfterStopWaitingPositionThenClosed);
  return UNITY_END();
}
