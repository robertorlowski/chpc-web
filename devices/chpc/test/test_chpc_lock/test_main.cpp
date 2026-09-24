// Scenariusz: blokada po 5 błędach, RS-485 w czasie blokady, odblokowanie 0x10, restart 0x11.
#include <unity.h>
#include <chpc_sim.h>

using namespace chpc;

void setUp() {}
void tearDown() {}

static void overloadCycle() {
  compressorWatts = 1200.0;
  setTemp("Ttarget", 24.0);
  TEST_ASSERT_TRUE_MESSAGE(waitUntil([] { return compressor(); }, 25 * 60 * 1000UL, 2000) >= 0, "sprężarka nie ruszyła");
  setTemp("Ttarget", 27.0);
  compressorWatts = 5000.0;
  TEST_ASSERT_TRUE(waitUntil([] { return !compressor(); }, 15000) >= 0);
  runMs(3000);  // pomiar mocy po zatrzymaniu z gęstym próbkowaniem (jak na sprzęcie)
}

void testFiveErrorsLockTheController() {
  startAfterPowerOnPause();
  for (int k = 1; k <= 5; k++) overloadCycle();
  compressorWatts = 1200.0;
  std::string out = sim::tx;
  std::string json = query();
  TEST_ASSERT_EQUAL_DOUBLE(5, jsonNumber(json, "ERRc"));
  TEST_ASSERT_EQUAL_DOUBLE(ERRC_LOCKED, jsonNumber(json, "ERR"));
  TEST_ASSERT_TRUE(sim::lcdLog.find("ERR: Locked x5") != std::string::npos);
  TEST_ASSERT_TRUE_MESSAGE(out.find("ERR:") == std::string::npos, "komunikat błędu wysłany na RS-485 bez zapytania");
}

void testLockedControllerStillAnswersButDoesNotRun() {
  setTemp("Ttarget", 20.0);
  runMs(25 * 60 * 1000UL, 2000);
  TEST_ASSERT_FALSE_MESSAGE(compressor(), "sprężarka ruszyła mimo blokady");
  TEST_ASSERT_FALSE(hotPump());
  uint64_t latency = 0;
  std::string json = query(3000, &latency);
  TEST_ASSERT_TRUE_MESSAGE(json.size() > 0, "brak odpowiedzi RS-485 w czasie blokady");
  TEST_ASSERT_TRUE(latency < 60000);
}

void testTemperaturesAreFrozenWhileLocked() {
  // ustalenie: w czasie blokady cykl kontrolny nie działa, więc JSON podaje ostatni odczyt temperatur
  std::string json = query();
  TEST_ASSERT_EQUAL_DOUBLE(27.0, jsonNumber(json, "Ttarget"));
}

void testUnlockResumesControl() {
  sendFrame(0x10, 1);
  runMs(600);
  std::string json = query();
  TEST_ASSERT_EQUAL_DOUBLE(0, jsonNumber(json, "ERRc"));
  TEST_ASSERT_TRUE_MESSAGE(waitUntil([] { return compressor(); }, 5000) >= 0, "po odblokowaniu sprężarka nie ruszyła");
  TEST_ASSERT_EQUAL_DOUBLE(20.0, jsonNumber(query(), "Ttarget"));
}

void testRestartCommandRestartsController() {
  sendFrame(0x11, 1);
  bool restarted = false;
  try {
    runMs(1000);
  } catch (const SimRestart &) {
    restarted = true;
  }
  TEST_ASSERT_TRUE_MESSAGE(restarted, "0x11 nie wywołało restartu");
  TEST_ASSERT_FALSE(compressor());
  TEST_ASSERT_FALSE(hotPump());
  TEST_ASSERT_FALSE(coldPump());

  // start od nowa: bez wykrywania czujników, z przerwą 90 s
  resetGlobalsLikeReboot();
  sim::rx.clear();
  sim::tx.clear();
  sim::lcdLog.clear();
  setup();
  TEST_ASSERT_TRUE(sim::lcdLog.find("Insert") == std::string::npos);
  runMs(60000, 1000);
  TEST_ASSERT_FALSE_MESSAGE(compressor(), "sprężarka ruszyła w czasie POWERON_PAUSE po restarcie");
  TEST_ASSERT_TRUE(query().size() > 0);
  // T_delta nie była nigdy zapisana: po restarcie musi wrócić do domyślnych 5 °C (T min 25)
  TEST_ASSERT_EQUAL_DOUBLE(25.0, jsonNumber(query(), "Tmin"));
  TEST_ASSERT_TRUE(waitUntil([] { return compressor(); }, 40000) >= 0);
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(testFiveErrorsLockTheController);
  RUN_TEST(testLockedControllerStillAnswersButDoesNotRun);
  RUN_TEST(testTemperaturesAreFrozenWhileLocked);
  RUN_TEST(testUnlockResumesControl);
  RUN_TEST(testRestartCommandRestartsController);
  return UNITY_END();
}
