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
  TEST_ASSERT_TRUE(sim::lcdLog.find("OK! Remove Tbc") != std::string::npos);
}

void testSecondBootReadsSensorsFromEeprom() {
  resetGlobalsLikeReboot();
  sim::tx.clear();
  sim::lcdLog.clear();
  setup();

  TEST_ASSERT_TRUE(sim::lcdLog.find("Insert") == std::string::npos);
  TEST_ASSERT_TRUE(sim::lcdLog.find("Err, s.") == std::string::npos);
  TEST_ASSERT_EQUAL_MEMORY(sensor("Tae")->addr, Tae.addr, 8);
  TEST_ASSERT_TRUE(Tbc.e);
}

// Kalibracja EEV w czasie POWERON_PAUSE: pełne otwarcie, zamknięcie do zera, pozycja oczekiwania.
// Kroki muszą mieć odstęp, w jakim silnik nadąża (pętla bez delay() robi przebieg co ~100 µs),
// a cała sekwencja ma wypełnić przerwę startową, kończąc się przed jej końcem.
void testEevCalibrationIsPacedDuringPowerOnPause() {
  int last = EEV_cur_pos, top = EEV_cur_pos;
  bool closed = false;
  uint64_t lastStepUs = 0, minGapUs = UINT64_MAX;
  const uint64_t end = sim::now_us + (uint64_t)POWERON_PAUSE * 1000;
  while (sim::now_us < end && !(closed && EEV_cur_pos == 45 && EEV_apulses == 0)) {
    loop();
    sim::now_us += LOOP_US;
    if (EEV_cur_pos != last) {
      if (lastStepUs != 0 && sim::now_us - lastStepUs < minGapUs) minGapUs = sim::now_us - lastStepUs;
      lastStepUs = sim::now_us;
      last = EEV_cur_pos;
      if (last > top) top = last;
      if (top >= EEV_MAXPULSES && last == 0) closed = true;
    }
  }
  TEST_ASSERT_EQUAL_INT(EEV_MAXPULSES, top);
  TEST_ASSERT_TRUE_MESSAGE(closed, "zawór nie został zamknięty do zera");
  TEST_ASSERT_EQUAL_INT(45, EEV_cur_pos);
  TEST_ASSERT_TRUE_MESSAGE(minGapUs >= EEV_PULSE_CALIB_MILLIS * 1000ULL, "kroki EEV szybsze niż EEV_PULSE_CALIB_MILLIS");
  TEST_ASSERT_TRUE_MESSAGE(millis() > POWERON_PAUSE * 2 / 3, "kalibracja nie wypełnia przerwy startowej");
  TEST_ASSERT_TRUE_MESSAGE(millis() < POWERON_PAUSE, "kalibracja dłuższa niż przerwa startowa");
  TEST_ASSERT_FALSE(_1st_start_sleeped);
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

// Włączenie zasilania: DS18B20 najpierw zwracają 85 °C. Żaden przekaźnik nie może wtedy nawet
// na chwilę zadziałać (Tsump 20 °C > progu grzałki 10 °C, reszta wyłączona w czasie przerwy startowej).
void testNoRelayClicksAfterPowerOn() {
  resetGlobalsLikeReboot();
  sim::powerOnSensors();
  setTemp("Ttarget", 30.0);
  setup();
  bool clicked = compressor() || hotPump() || coldPump() || sumpHeater();
  const uint64_t end = sim::now_us + 5000ULL * 1000;
  while (sim::now_us < end && !clicked) {
    loop();
    sim::now_us += LOOP_US;
    clicked = compressor() || hotPump() || coldPump() || sumpHeater();
  }
  TEST_ASSERT_FALSE_MESSAGE(sumpHeater(), "grzałka karteru załączona po starcie");
  TEST_ASSERT_FALSE_MESSAGE(clicked, "przekaźnik zadziałał na chwilę po starcie");
  TEST_ASSERT_EQUAL_DOUBLE(20.0, Tsump.T);
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(testDiscoveryStoresSensorsInEeprom);
  RUN_TEST(testSecondBootReadsSensorsFromEeprom);
  RUN_TEST(testRs485AnswersDuringPowerOnPause);
  RUN_TEST(testEevCalibrationIsPacedDuringPowerOnPause);
  RUN_TEST(testNoRelayClicksAfterPowerOn);
  return UNITY_END();
}
