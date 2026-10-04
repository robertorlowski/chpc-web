// Testy oferty OTA (ota.hpp): odczyt pola firmware z odpowiedzi hp/add, odrzucenie niepełnej
// oferty i jedna próba na zlecenie „Aktualizuj” (klucz wersja#zlecenie w NVS).
// Uruchamianie: pio test -e native (plik .cpp włączany bezpośrednio).
#ifdef ARDUINO
#include <Arduino.h>
#endif
#include <unity.h>

#include <ota.hpp>
#include "../../src/ota.cpp"

namespace {
JsonDocument response(const char *json)
{
  JsonDocument document;
  deserializeJson(document, json);
  return document;
}
}

void setUp() {}
void tearDown() {}

void test_reads_offer_next_to_operation()
{
  JsonDocument document = response(
    "{\"operation\":{},\"t_out\":5,\"firmware\":{\"version\":\"1.1.0\","
    "\"url\":\"https://chpc-web.onrender.com/api/firmware/heat_pump/1.1.0.bin\","
    "\"sha256\":\"0123456789ABCDEF0123456789abcdef0123456789abcdef0123456789abcdef\",\"request\":\"1759600000000\"}}");
  OtaOffer offer;
  TEST_ASSERT_TRUE(parseOtaOffer(document.as<JsonVariantConst>(), offer));
  TEST_ASSERT_EQUAL_STRING("1.1.0", offer.version.c_str());
  // suma zamieniona na małe litery (tak liczy ją sterownik)
  TEST_ASSERT_EQUAL_STRING("0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef", offer.sha256.c_str());
  TEST_ASSERT_EQUAL_STRING("1.1.0#1759600000000", otaKey(offer).c_str());
}

void test_no_or_incomplete_offer()
{
  OtaOffer offer;
  TEST_ASSERT_FALSE(parseOtaOffer(response("{\"operation\":{}}").as<JsonVariantConst>(), offer));
  // http zamiast https
  TEST_ASSERT_FALSE(parseOtaOffer(response(
    "{\"firmware\":{\"version\":\"1.1.0\",\"url\":\"http://x/a.bin\",\"sha256\":\"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef\"}}")
    .as<JsonVariantConst>(), offer));
  // suma za krótka
  TEST_ASSERT_FALSE(parseOtaOffer(response(
    "{\"firmware\":{\"version\":\"1.1.0\",\"url\":\"https://x/a.bin\",\"sha256\":\"abc\"}}").as<JsonVariantConst>(), offer));
}

void test_one_attempt_per_request()
{
  OtaOffer offer{"1.1.0", "https://x/a.bin", "", "100"};
  TEST_ASSERT_TRUE(shouldUpdate(offer, "1.0.0", ""));
  // to samo zlecenie już próbowane
  TEST_ASSERT_FALSE(shouldUpdate(offer, "1.0.0", "1.1.0#100"));
  // ponowne „Aktualizuj” = nowe zlecenie
  offer.request = "200";
  TEST_ASSERT_TRUE(shouldUpdate(offer, "1.0.0", "1.1.0#100"));
  // sterownik ma już tę wersję
  TEST_ASSERT_FALSE(shouldUpdate(offer, "1.1.0", ""));
}

int main()
{
  UNITY_BEGIN();
  RUN_TEST(test_reads_offer_next_to_operation);
  RUN_TEST(test_no_or_incomplete_offer);
  RUN_TEST(test_one_attempt_per_request);
  return UNITY_END();
}
