// Scenariusz: zabezpieczenia sprężarki i zgłaszanie błędów (ERR, ERRn, ERRc, komunikaty LCD).
#include <unity.h>
#include <chpc_sim.h>

using namespace chpc;

void setUp() {}
void tearDown() {}

static double lastSeq = 0;

// Wymusza start: Ttarget poniżej T min i czekanie na sprężarkę (także przez 20 min postoju).
static void startCompressor() {
  setTemp("Ttarget", 24.0);
  long waited = waitUntil([] { return compressor(); }, 25 * 60 * 1000UL, 2000);
  TEST_ASSERT_TRUE_MESSAGE(waited >= 0, "sprężarka nie ruszyła");
  runMs(3000);  // pełne okno pomiaru mocy
  setTemp("Ttarget", 27.0);  // między T min a T max: bez zatrzymania przez termostat
}

// Sprawdza nowe zdarzenie błędu w JSON i komunikat na RS-485/LCD.
static void expectNewError(int code, const char *lcdText) {
  std::string out = sim::tx;
  std::string json = query();
  TEST_ASSERT_EQUAL_DOUBLE(code, jsonNumber(json, "ERR"));
  TEST_ASSERT_TRUE_MESSAGE(jsonNumber(json, "ERRn") > lastSeq, "ERRn nie wzrósł");
  lastSeq = jsonNumber(json, "ERRn");
  if (lcdText) TEST_ASSERT_TRUE_MESSAGE(out.find(lcdText) != std::string::npos, lcdText);
}

void testHotSideOverheatStopsCompressor() {
  defaultWorld();
  addSensor("Tho", 0xA5, 35.0);
  useDefaultPower();
  boot();
  runMs(POWERON_PAUSE + 2000, 1000);
  TEST_ASSERT_TRUE(Tho.e);

  startCompressor();
  sim::tx.clear();
  setTemp("Tho", 65.0);
  TEST_ASSERT_TRUE(waitUntil([] { return !compressor(); }, 3000) >= 0);
  expectNewError(ERRC_TEMP_THO, "ERR: Temp. Tho");
  TEST_ASSERT_EQUAL_DOUBLE(0, jsonNumber(query(), "ERRc"));  // zabezpieczenie temperaturowe nie liczy się do blokady
  setTemp("Tho", 35.0);
}

void testDischargeOverheatStopsCompressor() {
  startCompressor();
  sim::tx.clear();
  setTemp("Tbc", 75.0);
  TEST_ASSERT_TRUE(waitUntil([] { return !compressor(); }, 3000) >= 0);
  expectNewError(ERRC_TEMP_TBC, "ERR: Temp. Tbc");
  setTemp("Tbc", 40.0);
}

void testSuctionFreezeStopsCompressor() {
  startCompressor();
  sim::tx.clear();
  setTemp("Tae", -3.0);
  TEST_ASSERT_TRUE(waitUntil([] { return !compressor(); }, 3000) >= 0);
  expectNewError(ERRC_TEMP_TAE, "ERR: Temp. Tae");
  setTemp("Tae", 5.0);
}

void testOverloadStopsAndCountsError() {
  startCompressor();
  sim::tx.clear();
  compressorWatts = 5000.0;
  // przez POWERON_HIGHTIME (9 s) po starcie moc rozruchowa jest tolerowana
  TEST_ASSERT_TRUE(waitUntil([] { return !compressor(); }, 12000) >= 0);
  expectNewError(ERRC_OVERLOAD, "ERR: Overload");
  TEST_ASSERT_EQUAL_DOUBLE(1, jsonNumber(query(), "ERRc"));
  compressorWatts = 1200.0;
}

void testCompressorWithoutPowerIsDetected() {
  compressorWatts = 300.0;  // poniżej limit / 3,5 = 914 W: sprężarka nie pracuje
  setTemp("Ttarget", 24.0);
  TEST_ASSERT_TRUE(waitUntil([] { return compressor(); }, 25 * 60 * 1000UL, 2000) >= 0);
  sim::tx.clear();
  long stopped = waitUntil([] { return !compressor(); }, 70000);
  TEST_ASSERT_TRUE(stopped >= 55000);  // po MINCYKLE_CHECK (60 s)
  expectNewError(ERRC_WATTAGE_MIN, "ERR: Wattage Min");
  TEST_ASSERT_EQUAL_DOUBLE(2, jsonNumber(query(), "ERRc"));
  compressorWatts = 1200.0;
}

void testLowSumpTemperatureAfterStart() {
  startCompressor();
  sim::tx.clear();
  setTemp("Tsump", 2.0);
  long stopped = waitUntil([] { return !compressor(); }, 70000);
  TEST_ASSERT_TRUE(stopped >= 0);
  expectNewError(ERRC_TEMP_LOW, "ERR: Temp. Low");
  setTemp("Tsump", 20.0);
}

void testNoFlowIgnoredAtDefaultPowerLimit() {
  sim::flow_adc = 1023;  // brak przepływu
  startCompressor();
  runMs(60000);
  TEST_ASSERT_TRUE_MESSAGE(compressor(), "przy limicie 3200 W ochrona przepływu nie powinna działać");
  setTemp("Ttarget", 31.0);
  TEST_ASSERT_TRUE(waitUntil([] { return !compressor(); }, 5 * 60 * 1000UL) >= 0);
  setTemp("Ttarget", 27.0);
}

void testNoFlowStopsAbovePowerLimitSwitch() {
  sendFrame(0x0E, 38, 0);  // 3800 W > 3200 W: ochrona przepływu włączona
  runMs(600);
  startCompressor();
  sim::tx.clear();
  long stopped = waitUntil([] { return !compressor(); }, 70000);
  TEST_ASSERT_TRUE(stopped >= 40000);  // COLDOFF_HIGHTIME 50 s od startu
  expectNewError(ERRC_NO_FLOW, "ERR: Cold Flow");
  // poprzedni test zakończył się normalnym zatrzymaniem, które zeruje licznik błędów
  TEST_ASSERT_EQUAL_DOUBLE(1, jsonNumber(query(), "ERRc"));
  sim::flow_adc = 0;
}

void testStuckCompressorRelayIsReportedOnce() {
  offWatts = 1500.0;  // pobór mocy mimo wyłączonej sprężarki
  runMs(15000);
  TEST_ASSERT_TRUE(hotPump());
  TEST_ASSERT_TRUE(coldPump());
  expectNewError(ERRC_RELAY, nullptr);
  runMs(10000);
  TEST_ASSERT_EQUAL_DOUBLE(lastSeq, jsonNumber(query(), "ERRn"));  // jedno zdarzenie, nie co cykl
  offWatts = 0.0;
  runMs(5000);
}

void testLostSensorStopsControlAndRecovers() {
  cold_pomp_on = hot_pomp_on = false;  // zdjęcie wymuszeń po "ERR: Relay"
  sim::tx.clear();
  sensor("Tbe")->connected = false;
  TEST_ASSERT_TRUE(waitUntil([] { return errorcode == ERR_T_SENSOR; }, 3000) >= 0);
  uint64_t latency = 0;
  std::string json = query(3000, &latency);
  TEST_ASSERT_TRUE_MESSAGE(latency < 100000, "odpowiedź RS-485 wolniejsza niż 100 ms przy braku czujnika");
  TEST_ASSERT_EQUAL_DOUBLE(-127, jsonNumber(json, "Tbe"));
  TEST_ASSERT_EQUAL_DOUBLE(ERRC_T_SENSOR, jsonNumber(json, "ERR"));
  TEST_ASSERT_TRUE(sim::buzzer_count > 0);
  sensor("Tbe")->connected = true;
  TEST_ASSERT_TRUE_MESSAGE(waitUntil([] { return errorcode == ERR_OK; }, 3000) >= 0, "błąd czujnika nie zniknął po jego powrocie");
  TEST_ASSERT_EQUAL_DOUBLE(2.0, jsonNumber(query(), "Tbe"));
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(testHotSideOverheatStopsCompressor);
  RUN_TEST(testDischargeOverheatStopsCompressor);
  RUN_TEST(testSuctionFreezeStopsCompressor);
  RUN_TEST(testOverloadStopsAndCountsError);
  RUN_TEST(testCompressorWithoutPowerIsDetected);
  RUN_TEST(testLowSumpTemperatureAfterStart);
  RUN_TEST(testNoFlowIgnoredAtDefaultPowerLimit);
  RUN_TEST(testNoFlowStopsAbovePowerLimitSwitch);
  RUN_TEST(testStuckCompressorRelayIsReportedOnce);
  RUN_TEST(testLostSensorStopsControlAndRecovers);
  return UNITY_END();
}
