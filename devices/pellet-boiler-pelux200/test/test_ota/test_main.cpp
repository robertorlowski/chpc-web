// Testy native oferty aktualizacji z chmury (ota.*, od 1.5.0): oferta z odpowiedzi
// GET commands/next tylko przy zleceniu „Aktualizuj”, jedna próba na zlecenie.
#include <unity.h>

#include <ota.hpp>
#include "../../src/ota.cpp"

void setUp() {}
void tearDown() {}

void test_offer_from_command_response()
{
  JsonDocument document;
  deserializeJson(document, "{\"firmware\":{\"version\":\"1.5.1\",\"url\":\"https://x/api/firmware/pellet-boiler-pelux200/1.5.1.bin\","
    "\"sha256\":\"ABCDEF0123456789abcdef0123456789abcdef0123456789abcdef0123456789\",\"request\":\"1759500000000\"}}");
  OtaOffer offer;
  TEST_ASSERT_TRUE(parseOtaOffer(document.as<JsonVariantConst>(), offer));
  TEST_ASSERT_EQUAL_STRING("abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789", offer.sha256.c_str());
  TEST_ASSERT_EQUAL_STRING("1.5.1#1759500000000", otaKey(offer).c_str());
}

void test_no_offer_without_request_or_with_bad_fields()
{
  OtaOffer offer;
  JsonDocument document;
  // zwykłe zlecenie parametru albo pusta odpowiedź: oferty nie ma
  deserializeJson(document, "{\"id\":\"a\",\"kind\":\"ecomax\",\"index\":119,\"value\":50}");
  TEST_ASSERT_FALSE(parseOtaOffer(document.as<JsonVariantConst>(), offer));
  deserializeJson(document, "{}");
  TEST_ASSERT_FALSE(parseOtaOffer(document.as<JsonVariantConst>(), offer));
  // adres bez https albo zła suma
  deserializeJson(document, "{\"firmware\":{\"version\":\"1.5.1\",\"url\":\"http://x/fw.bin\","
    "\"sha256\":\"abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789\"}}");
  TEST_ASSERT_FALSE(parseOtaOffer(document.as<JsonVariantConst>(), offer));
  deserializeJson(document, "{\"firmware\":{\"version\":\"1.5.1\",\"url\":\"https://x/fw.bin\",\"sha256\":\"zz\"}}");
  TEST_ASSERT_FALSE(parseOtaOffer(document.as<JsonVariantConst>(), offer));
}

void test_one_attempt_per_request()
{
  OtaOffer offer{"1.5.1", "https://x/fw.bin", "", "1759500000000"};
  TEST_ASSERT_TRUE(shouldUpdate(offer, "1.5.0", ""));
  TEST_ASSERT_FALSE(shouldUpdate(offer, "1.5.1", ""));
  TEST_ASSERT_FALSE(shouldUpdate(offer, "1.5.0", "1.5.1#1759500000000"));
  // ponowne „Aktualizuj” w aplikacji = nowe zlecenie = kolejna próba
  offer.request = "1759500600000";
  TEST_ASSERT_TRUE(shouldUpdate(offer, "1.5.0", "1.5.1#1759500000000"));
}

int main()
{
  UNITY_BEGIN();
  RUN_TEST(test_offer_from_command_response);
  RUN_TEST(test_no_offer_without_request_or_with_bad_fields);
  RUN_TEST(test_one_attempt_per_request);
  return UNITY_END();
}
