// Scenariusz: ochrona przed zamarzaniem, obsługa przycisków (menu, EEV min), brak blokowania pętli.
#include <unity.h>
#include <chpc_sim.h>

using namespace chpc;

void setUp() {}
void tearDown() {}

// Zwraca to, co firmware wypisało na LCD w czasie naciśnięcia (ekran główny i tak nadpisuje menu co 5 s).
static std::string press(uint8_t pin, uint32_t holdMs = 100) {
  const size_t from = sim::lcdLog.size();
  sim::inputs[pin] = 1;
  runMs(holdMs);
  sim::inputs[pin] = 0;
  runMs(900);
  return sim::lcdLog.substr(from);
}

void testFrostProtectionRunsHotPumpWhileCompressorIsOff() {
  startAfterPowerOnPause();
  TEST_ASSERT_FALSE(hotPump());
  setTemp("Tbe", -1.0);
  TEST_ASSERT_TRUE(waitUntil([] { return hotPump(); }, 3000) >= 0);
  TEST_ASSERT_EQUAL_DOUBLE(1, jsonNumber(query(), "HCS"));
  setTemp("Tbe", 1.0);  // histereza: poniżej T_FROST_OFF pompa pracuje dalej
  runMs(3000);
  TEST_ASSERT_TRUE(hotPump());
  setTemp("Tbe", 3.0);
  TEST_ASSERT_TRUE(waitUntil([] { return !hotPump(); }, 3000) >= 0);
  setTemp("Tbe", 2.0);
}

void testFrostProtectionIgnoresMissingSensor() {
  sensor("Tsump")->connected = false;  // -127 nie może włączyć pompy
  runMs(3000);
  TEST_ASSERT_FALSE(hotPump());
  sensor("Tsump")->connected = true;
  runMs(3000);
}

// Sekwencja z pompy: na ekranie CO ">" włącza CO, potem "menu" ma przejść do T max.
void testMenuLeavesCoScreenAfterChangingIt() {
  std::string shown = press(A3);
  TEST_ASSERT_TRUE_MESSAGE(shown.find("CO: 1") != std::string::npos, shown.c_str());
  shown = press(A1);
  TEST_ASSERT_TRUE_MESSAGE(shown.find("T max: ") != std::string::npos, shown.c_str());
  for (int k = 0; k < INPUT_TYPES - 1; k++) shown = press(A1);  // pełny obieg menu z powrotem na CO
  TEST_ASSERT_TRUE_MESSAGE(shown.find("CO: 1") != std::string::npos, shown.c_str());
}

// Tekst menu zostaje na LCD, zanim ekran główny (co 5 s) go nadpisze, niezależnie od chwili naciśnięcia.
void testMenuTextStaysOnScreen() {
  for (int k = 0; k < 10; k++) {
    runMs(437);  // różne przesunięcia względem odświeżania ekranu głównego
    press(A1, 50);  // menu: tekst wypisany ~50 ms po naciśnięciu, potem 900 ms czekania
    const std::string shown = sim::lcd[0];
    runMs(3000);
    TEST_ASSERT_EQUAL_STRING_MESSAGE(shown.c_str(), sim::lcd[0].c_str(), "ekran główny nadpisał menu");
  }
  while (input_type % INPUT_TYPES != INPUT_TYPE_CO) press(A1);  // powrót na CO dla kolejnych testów
}

void testMenuReachesEevMinimumAndSavesIt() {
  std::string shown;
  for (int k = 0; k < 9; k++) shown = press(A1);
  TEST_ASSERT_TRUE_MESSAGE(shown.find("EEV min: 49") != std::string::npos, shown.c_str());
  for (int k = 0; k < 4; k++) shown = press(A2);
  TEST_ASSERT_TRUE_MESSAGE(shown.find("EEV min: 45") != std::string::npos, shown.c_str());
  TEST_ASSERT_EQUAL_INT(45, ReadIntEEPROM(eeprom_addr_EEV_MIN));
  TEST_ASSERT_EQUAL_DOUBLE(45, jsonNumber(query(), "EEVmin"));
}

void testHeldButtonRepeatsWithoutBlockingTheLoop() {
  // przytrzymanie "<" przez 3 s: powtórzenie co 750 ms, a RS-485 odpowiada w tym czasie
  sim::inputs[A2] = 1;
  runMs(1500);
  uint64_t latency = 0;
  std::string json = query(3000, &latency);
  runMs(1500);
  sim::inputs[A2] = 0;
  runMs(1000);
  TEST_ASSERT_TRUE_MESSAGE(latency < 60000, "przycisk blokuje odpowiedź RS-485");
  TEST_ASSERT_TRUE(EEV_MINWORKPOS <= 42 && EEV_MINWORKPOS >= 40);
}

void testEevMinimumCannotGoBelowLowerBound() {
  sim::inputs[A2] = 1;
  runMs(20000);
  sim::inputs[A2] = 0;
  runMs(1000);
  TEST_ASSERT_EQUAL_INT(EEV_MINWORKPOS_LOW, EEV_MINWORKPOS);
  TEST_ASSERT_EQUAL_INT(21, EEV_OPEN_AFTER_CLOSE);  // pozycja oczekiwania = minimum - 4
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(testFrostProtectionRunsHotPumpWhileCompressorIsOff);
  RUN_TEST(testFrostProtectionIgnoresMissingSensor);
  RUN_TEST(testMenuLeavesCoScreenAfterChangingIt);
  RUN_TEST(testMenuTextStaysOnScreen);
  RUN_TEST(testMenuReachesEevMinimumAndSavesIt);
  RUN_TEST(testHeldButtonRepeatsWithoutBlockingTheLoop);
  RUN_TEST(testEevMinimumCannotGoBelowLowerBound);
  return UNITY_END();
}
