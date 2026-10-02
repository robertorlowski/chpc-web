// Testy native (pio test -e native) logiki włącznika niezależnej od sprzętu: przekaźniki
// (polecenia chmury, odliczanie, zmiany ze strony i ich pierwszeństwo), JSON wymiany z
// chmurą i oferta OTA. Pliki .cpp z src są dołączane bezpośrednio (native nie buduje src).
#include <unity.h>

#include <string>

#include <ota.hpp>
#include <protocol.hpp>
#include <relays.hpp>
#include "../../src/ota.cpp"
#include "../../src/protocol.cpp"
#include "../../src/relays.cpp"

void setUp() {}
void tearDown() {}

void test_cloud_timed_on_turns_off_by_itself()
{
  RelayBank bank(1);
  TEST_ASSERT_TRUE(bank.applyCloud(0, true, 60, RelayMode::Schedule, 1000));
  TEST_ASSERT_TRUE(bank.relay(0).on);
  TEST_ASSERT_EQUAL_UINT32(30000, bank.remainingMs(0, 31000));
  // bez kolejnych poleceń (brak sieci) wyłącza się po 60 s
  TEST_ASSERT_EQUAL_UINT32(0, bank.update(60999));
  TEST_ASSERT_EQUAL_UINT32(1, bank.update(61000));
  TEST_ASSERT_FALSE(bank.relay(0).on);
  TEST_ASSERT_EQUAL_UINT32(61000, bank.relay(0).changedMs);
}

void test_cloud_refresh_extends_timer_without_state_change()
{
  RelayBank bank(1);
  bank.applyCloud(0, true, 10, RelayMode::Schedule, 0);
  // kolejna odpowiedź przesuwa koniec, stan bez zmian i bez nowego changedMs
  TEST_ASSERT_FALSE(bank.applyCloud(0, true, 10, RelayMode::Schedule, 5000));
  TEST_ASSERT_EQUAL_UINT32(0, bank.relay(0).changedMs);
  TEST_ASSERT_EQUAL_UINT32(0, bank.update(12000));
  TEST_ASSERT_TRUE(bank.relay(0).on);
}

void test_cloud_on_without_limit_stays_on()
{
  RelayBank bank(1);
  bank.applyCloud(0, true, 0, RelayMode::On, 0);
  TEST_ASSERT_EQUAL_UINT32(0, bank.update(10UL * 24 * 3600 * 1000));
  TEST_ASSERT_TRUE(bank.relay(0).on);
  TEST_ASSERT_EQUAL_UINT32(0, bank.remainingMs(0, 5000));
}

void test_local_change_wins_until_confirmed()
{
  RelayBank bank(1);
  bank.applyCloud(0, true, 600, RelayMode::Schedule, 0);
  TEST_ASSERT_TRUE(bank.applyLocal(0, RelayMode::Off, 0, true, 1000));
  TEST_ASSERT_FALSE(bank.relay(0).on);
  TEST_ASSERT_TRUE(bank.anyPending());
  // chmura jeszcze nie wie o zmianie: jej polecenie nie włącza przekaźnika
  TEST_ASSERT_FALSE(bank.applyCloud(0, true, 600, RelayMode::Schedule, 2000));
  TEST_ASSERT_FALSE(bank.relay(0).on);
  // potwierdzenie starszej zmiany nie kasuje nowszej
  const uint32_t first = bank.relay(0).pendingSeq;
  bank.applyLocal(0, RelayMode::On, 0, true, 3000);
  bank.confirmPending(0, first);
  TEST_ASSERT_TRUE(bank.anyPending());
  bank.confirmPending(0, bank.relay(0).pendingSeq);
  TEST_ASSERT_FALSE(bank.anyPending());
  TEST_ASSERT_TRUE(bank.applyCloud(0, false, 0, RelayMode::Off, 4000));
}

void test_local_timer_and_minutes_to_send()
{
  RelayBank bank(1);
  TEST_ASSERT_TRUE(bank.applyLocal(0, RelayMode::Timer, 30, false, 0));
  TEST_ASSERT_EQUAL_UINT32(30, bank.pendingMinutes(0, 0));
  // wysyłka po 10 min 30 s: zostało 19,5 min, w górę do 20
  TEST_ASSERT_EQUAL_UINT32(20, bank.pendingMinutes(0, 630000));
  TEST_ASSERT_EQUAL_UINT32(1, bank.update(30UL * 60000));
  TEST_ASSERT_EQUAL_STRING("schedule", relayModeName(bank.relay(0).mode));
  TEST_ASSERT_FALSE(bank.applyLocal(0, RelayMode::Timer, 0, false, 0));
}

void test_local_schedule_turns_off_only_without_cloud()
{
  RelayBank bank(1);
  bank.applyLocal(0, RelayMode::On, 0, true, 0);
  TEST_ASSERT_FALSE(bank.applyLocal(0, RelayMode::Schedule, 0, true, 1000));
  TEST_ASSERT_TRUE(bank.relay(0).on);
  TEST_ASSERT_TRUE(bank.applyLocal(0, RelayMode::Schedule, 0, false, 2000));
  TEST_ASSERT_FALSE(bank.relay(0).on);
}

void test_state_report_json()
{
  RelayBank bank(2);
  bank.applyCloud(1, true, 0, RelayMode::On, 5000);
  const std::string json = buildStateReport(bank, 65000);
  TEST_ASSERT_EQUAL_STRING("{\"uptimeS\":65,\"relays\":[{\"on\":false,\"changedS\":65},{\"on\":true,\"changedS\":60}]}",
    json.c_str());
}

void test_apply_state_response()
{
  RelayBank bank(2);
  uint32_t changed = 0;
  TEST_ASSERT_TRUE(applyStateResponse(
    "{\"relays\":[{\"on\":true,\"offAfterS\":1200,\"mode\":\"schedule\"},{\"on\":false,\"mode\":\"off\"}]}",
    bank, 1000, changed));
  TEST_ASSERT_EQUAL_UINT32(1, changed);
  TEST_ASSERT_EQUAL_UINT32(1200000, bank.remainingMs(0, 1000));
  TEST_ASSERT_EQUAL_STRING("off", relayModeName(bank.relay(1).mode));
  TEST_ASSERT_FALSE(applyStateResponse("{\"message\":\"x\"}", bank, 2000, changed));
  TEST_ASSERT_FALSE(applyStateResponse("nie json", bank, 2000, changed));
}

void test_mode_body_json()
{
  TEST_ASSERT_EQUAL_STRING("{\"relay\":1,\"mode\":\"timer\",\"minutes\":45,\"source\":\"controller\"}",
    buildModeBody(1, RelayMode::Timer, 45).c_str());
  TEST_ASSERT_EQUAL_STRING("{\"relay\":2,\"mode\":\"off\",\"source\":\"controller\"}",
    buildModeBody(2, RelayMode::Off, 45).c_str());
}

void test_default_minutes_from_settings()
{
  JsonDocument document;
  deserializeJson(document, "{\"default_on_minutes\":45}");
  uint16_t minutes = 30;
  TEST_ASSERT_TRUE(parseDefaultMinutes(document.as<JsonVariantConst>(), minutes));
  TEST_ASSERT_EQUAL_UINT16(45, minutes);
  deserializeJson(document, "{\"default_on_minutes\":0}");
  TEST_ASSERT_FALSE(parseDefaultMinutes(document.as<JsonVariantConst>(), minutes));
  TEST_ASSERT_EQUAL_UINT16(45, minutes);
}

void test_ota_offer()
{
  JsonDocument document;
  deserializeJson(document, "{\"firmware\":{\"version\":\"1.0.1\",\"url\":\"https://x/fw.bin\","
    "\"sha256\":\"ABCDEF0123456789abcdef0123456789abcdef0123456789abcdef0123456789\"}}");
  OtaOffer offer;
  TEST_ASSERT_TRUE(parseOtaOffer(document.as<JsonVariantConst>(), offer));
  TEST_ASSERT_EQUAL_STRING("abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789", offer.sha256.c_str());
  TEST_ASSERT_TRUE(shouldUpdate(offer, "1.0.0", ""));
  TEST_ASSERT_FALSE(shouldUpdate(offer, "1.0.1", ""));
  TEST_ASSERT_FALSE(shouldUpdate(offer, "1.0.0", "1.0.1"));
}

int main()
{
  UNITY_BEGIN();
  RUN_TEST(test_cloud_timed_on_turns_off_by_itself);
  RUN_TEST(test_cloud_refresh_extends_timer_without_state_change);
  RUN_TEST(test_cloud_on_without_limit_stays_on);
  RUN_TEST(test_local_change_wins_until_confirmed);
  RUN_TEST(test_local_timer_and_minutes_to_send);
  RUN_TEST(test_local_schedule_turns_off_only_without_cloud);
  RUN_TEST(test_state_report_json);
  RUN_TEST(test_apply_state_response);
  RUN_TEST(test_mode_body_json);
  RUN_TEST(test_default_minutes_from_settings);
  RUN_TEST(test_ota_offer);
  return UNITY_END();
}
