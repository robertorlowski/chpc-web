// Scenariusz buildu diagnostycznego (DEBUG_LOG, env native_debug): sterownik sam wysyła linie JSON
// ze zdarzeniami i stanem. Sprawdza, że każda linia jest poprawnym obiektem, że są wszystkie rodzaje
// zdarzeń i że odpowiedź na zapytanie co (0x01) nadal jest wysyłana.
#include <unity.h>
#include <chpc_sim.h>

#include <sstream>
#include <vector>

using namespace chpc;

void setUp() {}
void tearDown() {}

static std::string all;  // cały log od startu

static void collect() {
  all += sim::tx;
  sim::tx.clear();
}

static std::vector<std::string> lines(const std::string &ev) {
  std::vector<std::string> out;
  std::istringstream in(all);
  std::string l;
  while (std::getline(in, l)) {
    if (!l.empty() && l.back() == '\r') l.pop_back();
    if (l.find("{\"t\":") == 0 && l.find("\"ev\":\"" + ev + "\"") != std::string::npos) out.push_back(l);
  }
  return out;
}

static std::string lastWith(const std::string &ev, const std::string &part) {
  std::vector<std::string> v = lines(ev);
  for (auto it = v.rbegin(); it != v.rend(); ++it)
    if (it->find(part) != std::string::npos) return *it;
  return "";
}

static void press(uint8_t pin) {
  sim::inputs[pin] = 1;
  runMs(100);
  sim::inputs[pin] = 0;
  runMs(900);
  collect();
}

void testBootAndPowerOnPauseAreLogged() {
  defaultWorld();
  useDefaultPower();
  boot();
  sim::tx.clear();
  resetGlobalsLikeReboot();  // drugi start: bez wykrywania czujników, z adresami z EEPROM
  setup();
  runMs(POWERON_PAUSE + 2000, 1000);
  collect();
  TEST_ASSERT_EQUAL_INT(1, (int)lines("boot").size());
  TEST_ASSERT_TRUE(lines("boot")[0].find("\"EEVmin\":49") != std::string::npos);
  TEST_ASSERT_FALSE(lastWith("lcd", "Wait: ").empty());
  TEST_ASSERT_TRUE_MESSAGE(lines("eev").size() >= 2, "brak początku/końca ruchu EEV (kalibracja)");
  TEST_ASSERT_TRUE(lines("st").size() >= 8);  // co 10 s przez ~92 s
  TEST_ASSERT_FALSE(lastWith("st", "\"Tsump\":20.00").empty());
}

void testEveryLineIsAJsonObject() {
  std::istringstream in(all);
  std::string l;
  int n = 0;
  while (std::getline(in, l)) {
    if (!l.empty() && l.back() == '\r') l.pop_back();
    if (l.empty()) continue;
    n++;
    TEST_ASSERT_TRUE_MESSAGE(l.front() == '{' && l.back() == '}', l.c_str());
    int depth = 0;
    bool inStr = false;
    for (char c : l) {
      if (c == '"') inStr = !inStr;
      if (!inStr && c == '{') depth++;
      if (!inStr && c == '}') depth--;
    }
    TEST_ASSERT_FALSE_MESSAGE(inStr, l.c_str());
    TEST_ASSERT_EQUAL_INT_MESSAGE(0, depth, l.c_str());
  }
  TEST_ASSERT_TRUE(n > 20);
}

void testButtonsAreLoggedWithRawStateAndVoltage() {
  press(A1);  // menu
  std::string down = lastWith("btn", "\"M\":1");
  TEST_ASSERT_FALSE_MESSAGE(down.empty(), "brak zdarzenia naciśnięcia menu");
  TEST_ASSERT_TRUE_MESSAGE(down.find("\"a1\":1023") != std::string::npos, down.c_str());
  TEST_ASSERT_FALSE(lastWith("btn", "\"M\":0").empty());
  TEST_ASSERT_FALSE_MESSAGE(lastWith("lcd", "T max: ").empty(), "menu nie przeszło do T max");
  press(A3);  // ">" na T max: +0,5 °C
  TEST_ASSERT_FALSE(lastWith("btn", "\"R\":1").empty());
  TEST_ASSERT_FALSE(lastWith("lcd", "T max: 30.50").empty());
  press(A2);  // "<" z powrotem
  TEST_ASSERT_FALSE(lastWith("lcd", "T max: 30.00").empty());
}

void testRelaysAndErrorsAreLogged() {
  setTemp("Ttarget", 24.0);
  TEST_ASSERT_TRUE(waitUntil([] { return compressor(); }, 30000) >= 0);
  runMs(3000);
  collect();
  TEST_ASSERT_FALSE(lastWith("rel", "\"hp\":1").empty());
  compressorWatts = 5000.0;  // przeciążenie
  TEST_ASSERT_TRUE(waitUntil([] { return !compressor(); }, 15000) >= 0);
  runMs(3000);
  collect();
  TEST_ASSERT_FALSE(lastWith("rel", "\"hp\":0").empty());
  TEST_ASSERT_FALSE(lastWith("err", "\"code\":2").empty());
  TEST_ASSERT_FALSE(lastWith("lcd", "ERR: Overload").empty());
  compressorWatts = 1200.0;
}

void testCoQueryStillAnswered() {
  std::string json = query();
  TEST_ASSERT_TRUE_MESSAGE(json.size() > 0, "brak odpowiedzi na 0x01 w buildzie diagnostycznym");
  TEST_ASSERT_EQUAL_DOUBLE(2.0, jsonNumber(json, "Tbe"));
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(testBootAndPowerOnPauseAreLogged);
  RUN_TEST(testEveryLineIsAJsonObject);
  RUN_TEST(testButtonsAreLoggedWithRawStateAndVoltage);
  RUN_TEST(testRelaysAndErrorsAreLogged);
  RUN_TEST(testCoQueryStillAnswered);
  return UNITY_END();
}
