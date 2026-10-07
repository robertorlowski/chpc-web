// Testy native połączenia przez ecoNET300 (econet300.*, od 1.9.0) na nagraniu odpowiedzi modułu z regulatorem
// ecoMAX 860P2-N (docs/econet300-api/odpowiedzi, integracja Home Assistant, MIT): odczyt regParams.curr jak
// z magistrali, stan mode, nastawy z rmCurrentDataParamsEdits jako odpowiedź 0xB1, wynik zapisu, maskowanie haseł.
#include <unity.h>

#include <cstdio>
#include <string>

#include <econet300.hpp>
#include <pellet_telemetry.hpp>
#include "../../src/econet300.cpp"
#include "../../src/ecomax_frame.cpp"
#include "../../src/pellet_telemetry.cpp"

void setUp() {}
void tearDown() {}

namespace {
std::string readFile(const char *path)
{
  FILE *file = fopen(path, "rb");
  TEST_ASSERT_NOT_NULL_MESSAGE(file, path);
  std::string text;
  char buffer[1024];
  size_t length;
  while ((length = fread(buffer, 1, sizeof(buffer), file)) > 0) text.append(buffer, length);
  fclose(file);
  return text;
}

const char *const DIR = "docs/econet300-api/odpowiedzi/ecoMAX860P2-N/";

std::string fixture(const char *name) { return readFile((std::string(DIR) + name).c_str()); }
}

void test_reading_from_reg_params()
{
  JsonDocument document;
  TEST_ASSERT_FALSE(deserializeJson(document, fixture("regParams.json")));
  EcomaxSensorData data;
  TEST_ASSERT_TRUE(econetToSensorData(document["curr"], data));
  TEST_ASSERT_TRUE(data.valid);
  TEST_ASSERT_EQUAL_UINT8(3, data.state);  // mode 3 = praca
  TEST_ASSERT_TRUE(data.temperatures[0].present);
  TEST_ASSERT_FLOAT_WITHIN(0.01f, 62.60f, data.temperatures[0].value);  // tempCO
  TEST_ASSERT_FLOAT_WITHIN(0.01f, 40.06f, data.temperatures[2].value);  // tempCWU
  TEST_ASSERT_FLOAT_WITHIN(0.01f, 3.00f, data.temperatures[3].value);   // zewnętrzna
  TEST_ASSERT_FALSE(data.temperatures[4].present);                      // tempBack: null
  TEST_ASSERT_EQUAL_UINT8(63, data.heatingTarget.value);
  TEST_ASSERT_EQUAL_UINT8(45, data.waterHeaterTarget.value);
  TEST_ASSERT_EQUAL_UINT8(66, data.fuelLevel.value);
  TEST_ASSERT_EQUAL_UINT8(25, data.boilerLoad.value);
  TEST_ASSERT_FLOAT_WITHIN(0.001f, 1.0948f, data.fuelConsumption.value);  // kg/h
  TEST_ASSERT_FLOAT_WITHIN(0.001f, 5.3052f, data.boilerPower.value);
  // pompa CO pracuje, pompa CWU skonfigurowana, ale stoi; wentylator pracuje
  TEST_ASSERT_TRUE(data.outputs & ECOMAX_OUT_HEATING_PUMP);
  TEST_ASSERT_FALSE(data.outputs & ECOMAX_OUT_WATER_HEATER_PUMP);
  TEST_ASSERT_TRUE(data.outputs & ECOMAX_OUT_FAN);
  TEST_ASSERT_FALSE(data.outputs & ECOMAX_OUT_FEEDER);
  // mieszacz 1 z pompą, pozostałe bez temperatury (null) = niepodłączone
  TEST_ASSERT_TRUE(data.mixers[0].present);
  TEST_ASSERT_FLOAT_WITHIN(0.01f, 49.12f, data.mixers[0].temperature);
  TEST_ASSERT_EQUAL_UINT8(49, data.mixers[0].target);
  TEST_ASSERT_EQUAL_UINT8(ECOMAX_MIXER_PUMP, data.mixers[0].status);
  TEST_ASSERT_FALSE(data.mixers[1].present);

  // ten sam JSON wysyłki co z magistrali
  JsonDocument json;
  fillPelletJson(json, data);
  TEST_ASSERT_EQUAL_UINT8(3, json["state"].as<uint8_t>());
  TEST_ASSERT_EQUAL_UINT8(63, json["heating_target"].as<uint8_t>());
  TEST_ASSERT_TRUE(json["heating_pump"].as<bool>());
  TEST_ASSERT_FALSE(json["mixer2_temp"].is<float>());
}

void test_state_mapping()
{
  TEST_ASSERT_EQUAL_UINT8(0, econetState(0));
  TEST_ASSERT_EQUAL_UINT8(1, econetState(12));  // stabilizacja
  TEST_ASSERT_EQUAL_UINT8(5, econetState(5));
  TEST_ASSERT_EQUAL_UINT8(7, econetState(7));
  TEST_ASSERT_EQUAL_UINT8(11, econetState(6));  // czyszczenie → inny
  TEST_ASSERT_EQUAL_UINT8(11, econetState(22));
  JsonDocument document;
  document["temp"] = 1;
  EcomaxSensorData data;
  TEST_ASSERT_FALSE(econetToSensorData(document.as<JsonVariantConst>(), data));  // bez mode
}

void test_settings_hex_from_edits()
{
  JsonDocument document;
  TEST_ASSERT_FALSE(deserializeJson(document, fixture("rmCurrentDataParamsEdits.json")));
  char hex[3 * 2 + 3 * 120 * 2 + 1];
  TEST_ASSERT_EQUAL_UINT8(2, econetSettingsHex(document["data"], hex, sizeof(hex)));
  TEST_ASSERT_EQUAL_UINT32(726, strlen(hex));
  TEST_ASSERT_EQUAL_STRING_LEN("000078", hex, 6);  // [0, pierwszy 0, liczba 120]
  // nr 98: 63 (55–80), nr 119: 45 (20–70); nr 97 nieużywany
  TEST_ASSERT_EQUAL_STRING_LEN("3f3750", hex + 6 + 98 * 6, 6);
  TEST_ASSERT_EQUAL_STRING_LEN("2d1446", hex + 6 + 119 * 6, 6);
  TEST_ASSERT_EQUAL_STRING_LEN("ffffff", hex + 6 + 97 * 6, 6);
  TEST_ASSERT_EQUAL_STRING("1280", econetEditKey(98));
  TEST_ASSERT_EQUAL_STRING("1281", econetEditKey(119));
  TEST_ASSERT_NULL(econetEditKey(125));
  char small[10];
  TEST_ASSERT_EQUAL_UINT8(0, econetSettingsHex(document["data"], small, sizeof(small)));
}

void test_write_result()
{
  JsonDocument ok, bad;
  deserializeJson(ok, "{\"result\":\"OK\"}");
  deserializeJson(bad, "{\"result\":\"ERROR\"}");
  TEST_ASSERT_TRUE(econetWriteOk(ok.as<JsonVariantConst>()));
  TEST_ASSERT_FALSE(econetWriteOk(bad.as<JsonVariantConst>()));
}

std::string masked(const std::string &input)
{
  JsonSecretMasker masker;
  std::string output;
  char out[8];
  for (char c : input) output.append(out, masker.feed(c, out));
  return output;
}

void test_secret_masking()
{
  TEST_ASSERT_EQUAL_STRING("{\"servicePassword\": \"MASKED\", \"ssid\": \"dom\"}",
    masked("{\"servicePassword\": \"0000\", \"ssid\": \"dom\"}").c_str());
  TEST_ASSERT_EQUAL_STRING("{\"key\":\"MASKED\",\"n\":1,\"wifiPassword\":\"MASKED\"}",
    masked("{\"key\":\"07042806\",\"n\":1,\"wifiPassword\":\"a\\\"b\"}").c_str());
  // liczba albo obiekt przy kluczu z hasłem i napis-wartość o treści „password” zostają
  TEST_ASSERT_EQUAL_STRING("{\"keyNo\":5,\"etPasswords\":{},\"name\":\"password\"}",
    masked("{\"keyNo\":5,\"etPasswords\":{},\"name\":\"password\"}").c_str());
  // cały plik sysParams: po masce nie ma zamaskowanych już w źródle wartości ani nowych
  const std::string sys = masked(fixture("sysParams.json"));
  JsonDocument document;
  TEST_ASSERT_FALSE(deserializeJson(document, sys));
  TEST_ASSERT_EQUAL_STRING("MASKED", document["servicePassword"] | "");
}

int main(int, char **)
{
  UNITY_BEGIN();
  RUN_TEST(test_reading_from_reg_params);
  RUN_TEST(test_state_mapping);
  RUN_TEST(test_settings_hex_from_edits);
  RUN_TEST(test_write_result);
  RUN_TEST(test_secret_masking);
  return UNITY_END();
}
