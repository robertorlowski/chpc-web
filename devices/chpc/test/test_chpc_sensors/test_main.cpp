// Scenariusz: wszystkie 12 czujników podłączonych; DS18B20 po włączeniu zasilania zwraca 85 °C,
// zanim skończy pierwszy pomiar. Ani przy starcie, ani przy restarcie pojedynczego czujnika w czasie
// pracy ta wartość nie może trafić do sterowania (fałszywe 0 °C lub 85 °C przełączałoby przekaźniki).
#include <unity.h>
#include <chpc_sim.h>

using namespace chpc;

void setUp() {}
void tearDown() {}

// Każdy czujnik ma inną temperaturę (wykrycie pomyłki indeksów), wszystkie w bezpiecznym zakresie:
// > T_FROST_OFF, Tsump > progu grzałki, Tbc < 70, Tho < 60, Ttarget 30 = bez potrzeby grzania.
static const double TEMPS[T_SENSORS] = {6.0, 4.0, 30.0, 20.0, 8.0, 7.0, 28.0, 31.0, 40.0, 29.0, 3.5, 45.0};

static void allSensorsWorld() {
  sim::sensors.clear();
  for (byte n = 0; n < T_SENSORS; n++) addSensor(sensor_names[n], (uint8_t)(0xB0 + n), TEMPS[n]);
  sim::flow_adc = 0;
}

static bool anyRelay() { return compressor() || hotPump() || coldPump() || sumpHeater(); }

static void expectAllReadingsReal(const char *when) {
  for (byte n = 0; n < T_SENSORS; n++) {
    char msg[64];
    snprintf(msg, sizeof msg, "%s: %s", when, sensor_names[n]);
    TEST_ASSERT_TRUE_MESSAGE(sensors[n].e, msg);
    TEST_ASSERT_EQUAL_DOUBLE_MESSAGE(TEMPS[n], sensors[n].T, msg);
  }
}

void testDiscoveryFindsAllTwelveSensors() {
  allSensorsWorld();
  useDefaultPower();
  boot();
  TEST_ASSERT_EQUAL_HEX16(0x0FFF, used_sensors);
  for (byte n = 0; n < T_SENSORS; n++)
    TEST_ASSERT_EQUAL_MEMORY_MESSAGE(sensor(sensor_names[n])->addr, sensors[n].addr, 8, sensor_names[n]);
}

void testPowerOnGivesRealReadingsOfAllSensorsAndNoRelayClicks() {
  resetGlobalsLikeReboot();
  sim::powerOnSensors();
  sim::lcdLog.clear();
  setup();
  expectAllReadingsReal("po setup()");
  TEST_ASSERT_FALSE(anyRelay());

  bool clicked = false;
  const uint64_t end = sim::now_us + 5000ULL * 1000;
  while (sim::now_us < end) {
    loop();
    sim::now_us += LOOP_US;
    clicked = clicked || anyRelay();
  }
  TEST_ASSERT_FALSE_MESSAGE(clicked, "przekaźnik zadziałał po włączeniu zasilania");
  expectAllReadingsReal("po 5 s");
  TEST_ASSERT_EQUAL_INT(ERR_OK, errorcode);
  TEST_ASSERT_TRUE_MESSAGE(sim::lcdLog.find("ERR") == std::string::npos, sim::lcdLog.c_str());
}

void testFirstJsonCarriesRealTemperatures() {
  std::string json = query();
  TEST_ASSERT_EQUAL_DOUBLE(TEMPS[BIT_Tae], jsonNumber(json, "Tae"));
  TEST_ASSERT_EQUAL_DOUBLE(TEMPS[BIT_Tbe], jsonNumber(json, "Tbe"));
  TEST_ASSERT_EQUAL_DOUBLE(TEMPS[BIT_Ttarget], jsonNumber(json, "Ttarget"));
  TEST_ASSERT_EQUAL_DOUBLE(TEMPS[BIT_Tsump], jsonNumber(json, "Tsump"));
  TEST_ASSERT_EQUAL_DOUBLE(TEMPS[BIT_Tho], jsonNumber(json, "Tho"));
  TEST_ASSERT_EQUAL_DOUBLE(0, jsonNumber(json, "ERR"));
}

// Restart jednego czujnika (zakłócenie zasilania linii) przy pracującej sprężarce: przez chwilę
// zwraca 85 °C. Dla Tbc (max 70) czy Tho (max 60) oznaczałoby to fałszywe zatrzymanie.
void testSingleSensorResetWhileRunningIsIgnored() {
  runMs(POWERON_PAUSE, 1000);
  setTemp("Ttarget", 24.0);  // poniżej T min 25: grzanie
  TEST_ASSERT_TRUE_MESSAGE(waitUntil([] { return compressor(); }, 30000) >= 0, "sprężarka nie ruszyła");
  runMs(5000);
  const double seq = jsonNumber(query(), "ERRn");

  for (byte n = 0; n < T_SENSORS; n++) {
    SimSensor *s = sensor(sensor_names[n]);
    const double before = sensors[n].T;
    const bool hot = hotPump(), cold = coldPump(), sump = sumpHeater();
    sim::powerOnSensor(*s);
    bool saw85 = false, relayChanged = false;
    const uint64_t end = sim::now_us + 3000ULL * 1000;
    while (sim::now_us < end) {
      loop();
      sim::now_us += LOOP_US;
      saw85 = saw85 || sensors[n].T == 85.0 || (n == BIT_Ttarget && sensors[n].T > 40.0);
      relayChanged = relayChanged || !compressor() || hotPump() != hot || coldPump() != cold || sumpHeater() != sump;
    }
    TEST_ASSERT_FALSE_MESSAGE(saw85, sensor_names[n]);
    TEST_ASSERT_FALSE_MESSAGE(relayChanged, sensor_names[n]);
    TEST_ASSERT_TRUE_MESSAGE(s->ready_us < sim::now_us, sensor_names[n]);  // czujnik zdążył zmierzyć
    TEST_ASSERT_EQUAL_DOUBLE_MESSAGE(n == BIT_Ttarget ? 24.0 : before, sensors[n].T, sensor_names[n]);
    TEST_ASSERT_EQUAL_DOUBLE_MESSAGE(seq, jsonNumber(query(), "ERRn"), sensor_names[n]);
  }
}

// Wszystkie czujniki naraz (np. chwilowy zanik 5 V na linii OneWire) w czasie pracy.
void testAllSensorsResetWhileRunningIsIgnored() {
  const double seq = jsonNumber(query(), "ERRn");
  sim::powerOnSensors();
  bool stopped = false;
  const uint64_t end = sim::now_us + 3000ULL * 1000;
  while (sim::now_us < end) {
    loop();
    sim::now_us += LOOP_US;
    stopped = stopped || !compressor();
  }
  TEST_ASSERT_FALSE_MESSAGE(stopped, "sprężarka zatrzymana przez 85 °C z czujników");
  for (byte n = 0; n < T_SENSORS; n++)
    TEST_ASSERT_EQUAL_DOUBLE_MESSAGE(n == BIT_Ttarget ? 24.0 : TEMPS[n], sensors[n].T, sensor_names[n]);
  TEST_ASSERT_EQUAL_DOUBLE(seq, jsonNumber(query(), "ERRn"));
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(testDiscoveryFindsAllTwelveSensors);
  RUN_TEST(testPowerOnGivesRealReadingsOfAllSensorsAndNoRelayClicks);
  RUN_TEST(testFirstJsonCarriesRealTemperatures);
  RUN_TEST(testSingleSensorResetWhileRunningIsIgnored);
  RUN_TEST(testAllSensorsResetWhileRunningIsIgnored);
  return UNITY_END();
}
