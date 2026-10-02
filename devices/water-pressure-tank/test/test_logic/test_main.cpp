// Testy native (pio test -e native) logiki hydroforu niezależnej od sprzętu:
// kompresor (także włączenie ręczne i jego czas), oferta OTA, czas z /install, ustawienia,
// JSON wysyłki i kolejka NVS na atrapie. Pliki .cpp z src są
// dołączane bezpośrednio, bo środowisko native nie buduje src.
#include <unity.h>

#include <cstring>
#include <map>
#include <string>
#include <vector>

#include <compressor.hpp>
#include <ota.hpp>
#include <run_report.hpp>
#include <settings.hpp>
#include "../../src/compressor.cpp"
#include "../../src/ota.cpp"
#include "../../src/run_report.cpp"
#include "../../src/settings.cpp"

namespace {

// Atrapa NVS: bloby w pamięci.
class MemoryStore : public BlobStore {
public:
  std::map<std::string, std::vector<uint8_t>> blobs;

  size_t read(const char *key, void *data, size_t size) override
  {
    auto found = blobs.find(key);
    if (found == blobs.end() || found->second.size() != size) return 0;
    memcpy(data, found->second.data(), size);
    return size;
  }

  bool write(const char *key, const void *data, size_t size) override
  {
    const uint8_t *bytes = static_cast<const uint8_t *>(data);
    blobs[key] = std::vector<uint8_t>(bytes, bytes + size);
    return true;
  }
};

Settings defaultSettings()
{
  Settings settings;
  parseSettingsText(R"({"compressor_seconds":30})", settings);
  return settings;
}

}  // namespace

// --- kompresor ---

void test_compressor_runs_once_for_the_set_time()
{
  Compressor compressor;
  compressor.start(1000, 30);
  TEST_ASSERT_TRUE(compressor.running());
  TEST_ASSERT_FALSE(compressor.update(30999));
  TEST_ASSERT_TRUE(compressor.running());
  TEST_ASSERT_EQUAL_UINT32(1, compressor.remainingMs(30999));
  TEST_ASSERT_TRUE(compressor.update(31000));
  TEST_ASSERT_FALSE(compressor.running());
  // po wyłączeniu nie włącza się sam ponownie
  TEST_ASSERT_FALSE(compressor.update(60000));
  TEST_ASSERT_FALSE(compressor.running());
  TEST_ASSERT_EQUAL_INT32(1, compressor.firstStartS());
  TEST_ASSERT_EQUAL_INT32(31, compressor.lastEndS());
}

void test_compressor_restart_counts_from_now_and_keeps_first_start()
{
  Compressor compressor;
  compressor.start(1000, 30);
  compressor.update(31000);
  compressor.restart(40000);
  TEST_ASSERT_TRUE(compressor.running());
  TEST_ASSERT_EQUAL_INT32(-1, compressor.lastEndS());
  TEST_ASSERT_TRUE(compressor.update(70000));
  TEST_ASSERT_EQUAL_UINT16(1, compressor.restarts());
  TEST_ASSERT_EQUAL_INT32(1, compressor.firstStartS());
  TEST_ASSERT_EQUAL_INT32(70, compressor.lastEndS());
}

void test_new_compressor_time_applies_from_the_next_run()
{
  Settings settings = defaultSettings();
  Compressor compressor;
  compressor.start(1000, settings.compressorSeconds);
  // ustawienia z chmury przychodzą w trakcie pracy
  TEST_ASSERT_TRUE(parseSettingsText(R"({"compressor_seconds":45})", settings));
  TEST_ASSERT_EQUAL_UINT16(45, settings.compressorSeconds);
  TEST_ASSERT_TRUE(compressor.update(31000));
  TEST_ASSERT_EQUAL_UINT16(30, compressor.seconds());
}

void test_local_compressor_time_applies_from_the_next_start_including_restart()
{
  Compressor compressor;
  compressor.start(1000, 30);
  compressor.setSeconds(10);
  // bieżąca praca kończy się po starym czasie
  TEST_ASSERT_FALSE(compressor.update(30000));
  TEST_ASSERT_TRUE(compressor.update(31000));
  compressor.restart(40000);
  TEST_ASSERT_EQUAL_UINT16(10, compressor.seconds());
  TEST_ASSERT_FALSE(compressor.update(49000));
  TEST_ASSERT_TRUE(compressor.update(50000));
}

void test_manual_compressor_runs_until_stopped()
{
  Compressor compressor;
  compressor.start(1000, 30);
  compressor.update(31000);
  compressor.startManual(40000, 1800);
  TEST_ASSERT_TRUE(compressor.manual());
  TEST_ASSERT_EQUAL_INT32(-1, compressor.lastEndS());
  // dłużej niż zwykły czas kompresora
  TEST_ASSERT_FALSE(compressor.update(400000));
  TEST_ASSERT_TRUE(compressor.stop(500000));
  TEST_ASSERT_FALSE(compressor.running());
  TEST_ASSERT_FALSE(compressor.manual());
  TEST_ASSERT_EQUAL_INT32(500, compressor.lastEndS());
  TEST_ASSERT_EQUAL_INT32(1, compressor.firstStartS());
  TEST_ASSERT_EQUAL_UINT16(1, compressor.restarts());
  // wyłączony już nie „wyłącza się” drugi raz
  TEST_ASSERT_FALSE(compressor.stop(510000));
}

void test_manual_compressor_stops_after_the_limit()
{
  Compressor compressor;
  compressor.start(1000, 30);
  compressor.startManual(5000, 1800);
  TEST_ASSERT_FALSE(compressor.update(5000 + 1800 * 1000UL - 1));
  TEST_ASSERT_TRUE(compressor.update(5000 + 1800 * 1000UL));
  TEST_ASSERT_FALSE(compressor.manual());
  // następne ponowne uruchomienie znów na zwykły czas
  compressor.restart(2000000);
  TEST_ASSERT_FALSE(compressor.manual());
  TEST_ASSERT_EQUAL_UINT16(30, compressor.seconds());
}

void test_stop_ends_automatic_run_early()
{
  Compressor compressor;
  compressor.start(1000, 30);
  TEST_ASSERT_TRUE(compressor.stop(11000));
  TEST_ASSERT_EQUAL_INT32(11, compressor.lastEndS());
  TEST_ASSERT_FALSE(compressor.update(31000));
}

// --- ustawienia i woda ---

void test_cloud_settings_keep_unsent_local_compressor_time()
{
  Settings settings = defaultSettings();
  settings.compressorSeconds = 50;
  // dawne pola (progi, zbiorniki) w odpowiedzi chmury są pomijane
  const char *cloud = R"({"compressor_seconds":30,"pressure_low":1.5,"pressure_high":3.5,"tanks":[]})";
  JsonDocument json;
  deserializeJson(json, cloud);

  TEST_ASSERT_TRUE(applyCloudSettings(json.as<JsonVariantConst>(), settings, true));
  TEST_ASSERT_EQUAL_UINT16(50, settings.compressorSeconds);

  TEST_ASSERT_TRUE(applyCloudSettings(json.as<JsonVariantConst>(), settings, false));
  TEST_ASSERT_EQUAL_UINT16(30, settings.compressorSeconds);
}

void test_compressor_time_from_the_install_form()
{
  uint16_t seconds = 7;
  TEST_ASSERT_TRUE(parseCompressorSecondsText("45", seconds));
  TEST_ASSERT_EQUAL_UINT16(45, seconds);
  TEST_ASSERT_TRUE(parseCompressorSecondsText("3600", seconds));
  TEST_ASSERT_EQUAL_UINT16(3600, seconds);
  const char *bad[] = {"", "0", "3601", "12.5", "-5", "30s", " 30", "99999"};
  for (const char *text : bad) TEST_ASSERT_FALSE_MESSAGE(parseCompressorSecondsText(text, seconds), text);
  TEST_ASSERT_EQUAL_UINT16(3600, seconds);
  TEST_ASSERT_EQUAL_STRING(R"({"compressor_seconds":45})", buildCompressorSecondsBody(45).c_str());
}

void test_invalid_settings_are_rejected_and_old_ones_kept()
{
  Settings settings = defaultSettings();
  TEST_ASSERT_FALSE(parseSettingsText(R"({"compressor_seconds":0})", settings));
  TEST_ASSERT_FALSE(parseSettingsText("nie json", settings));
  TEST_ASSERT_EQUAL_UINT16(30, settings.compressorSeconds);
}

void test_settings_round_trip_through_nvs_text()
{
  Settings settings = defaultSettings();
  settings.compressorSeconds = 75;
  TEST_ASSERT_EQUAL_STRING(R"({"compressor_seconds":75})", serializeSettings(settings).c_str());
  Settings restored;
  TEST_ASSERT_TRUE(parseSettingsText(serializeSettings(settings), restored));
  TEST_ASSERT_EQUAL_UINT16(75, restored.compressorSeconds);
  // dawny zapis NVS ze zbiornikami nadal daje czas kompresora
  TEST_ASSERT_TRUE(parseSettingsText(R"({"compressor_seconds":40,"pressure_low":2,"tanks":[{"kind":"air"}]})", restored));
  TEST_ASSERT_EQUAL_UINT16(40, restored.compressorSeconds);
}

// --- raport i kolejka ---

void test_report_json_leaves_out_unknown_compressor_end()
{
  RunRecord run;
  run.runId = 12;
  run.pumpRunS = 5;
  run.compressorStartS = 1;
  TEST_ASSERT_EQUAL_STRING(R"({"runId":12,"pumpRunS":5,"compressorStartS":1,"restarts":0})",
    buildRunReport(run, false).c_str());

  run.compressorEndS = 31;
  TEST_ASSERT_EQUAL_STRING(
    R"({"runId":12,"pumpRunS":5,"compressorStartS":1,"compressorEndS":31,"restarts":0,"queued":true})",
    buildRunReport(run, true).c_str());
}

void test_undelivered_previous_run_goes_to_the_queue_once()
{
  MemoryStore store;
  RunRecord previous;
  previous.runId = 7;
  previous.pumpRunS = 95;
  store.write(KEY_CURRENT_RUN, &previous, sizeof(previous));

  RunQueue queue;
  TEST_ASSERT_TRUE(queuePreviousRun(store, queue));
  TEST_ASSERT_EQUAL_size_t(1, queue.size());
  TEST_ASSERT_EQUAL_UINT32(95, queue.front().pumpRunS);
  // kolejny start bez nowego uruchomienia nie dodaje go drugi raz
  TEST_ASSERT_FALSE(queuePreviousRun(store, queue));
}

void test_delivered_run_is_not_queued()
{
  MemoryStore store;
  RunRecord previous;
  previous.runId = 8;
  previous.delivered = true;
  store.write(KEY_CURRENT_RUN, &previous, sizeof(previous));
  RunQueue queue;
  TEST_ASSERT_FALSE(queuePreviousRun(store, queue));
  TEST_ASSERT_TRUE(queue.empty());
}

void test_queue_survives_restart_and_drops_the_oldest_when_full()
{
  MemoryStore store;
  RunQueue queue;
  for (uint32_t runId = 1; runId <= RunQueue::CAPACITY + 2; runId++) {
    RunRecord run;
    run.runId = runId;
    queue.push(run);
  }
  TEST_ASSERT_EQUAL_size_t(RunQueue::CAPACITY, queue.size());
  TEST_ASSERT_EQUAL_UINT32(3, queue.front().runId);
  TEST_ASSERT_TRUE(queue.save(store));

  RunQueue restored;
  restored.load(store);
  TEST_ASSERT_EQUAL_size_t(RunQueue::CAPACITY, restored.size());
  TEST_ASSERT_EQUAL_UINT32(3, restored.front().runId);
  restored.pop();
  TEST_ASSERT_EQUAL_UINT32(4, restored.front().runId);
}

void test_compressor_with_zero_seconds_never_runs()
{
  Compressor compressor;
  compressor.start(1000, 0);
  TEST_ASSERT_FALSE(compressor.running());
  TEST_ASSERT_EQUAL_UINT32(0, compressor.remainingMs(1000));
  TEST_ASSERT_EQUAL_INT32(1, compressor.lastEndS());
}

void test_restart_while_running_extends_the_run()
{
  Compressor compressor;
  compressor.start(1000, 30);
  compressor.restart(20000);
  TEST_ASSERT_FALSE(compressor.update(31000));
  TEST_ASSERT_EQUAL_UINT32(20000, compressor.remainingMs(30000));
  TEST_ASSERT_TRUE(compressor.update(50000));
  TEST_ASSERT_EQUAL_INT32(50, compressor.lastEndS());
}

void test_manual_compressor_time_is_counted_for_the_report()
{
  Compressor compressor;
  compressor.start(1000, 30);
  TEST_ASSERT_TRUE(compressor.update(31000));
  TEST_ASSERT_EQUAL_UINT32(0, compressor.manualSeconds(40000));
  compressor.startManual(40000, 1800);
  // bieżąca praca ręczna liczy się na bieżąco
  TEST_ASSERT_EQUAL_UINT32(60, compressor.manualSeconds(100000));
  compressor.stop(160000);
  TEST_ASSERT_EQUAL_UINT32(120, compressor.manualSeconds(500000));
  // praca automatyczna („Uruchom na 30 s”) nie jest ręczna
  compressor.restart(200000);
  compressor.update(230000);
  TEST_ASSERT_EQUAL_UINT32(120, compressor.manualSeconds(300000));
  // drugie włączenie ręczne kończy się limitem, a „Uruchom” w trakcie zamyka pracę ręczną
  compressor.startManual(300000, 10);
  compressor.update(310000);
  compressor.startManual(400000, 1800);
  compressor.restart(405000);
  TEST_ASSERT_EQUAL_UINT32(135, compressor.manualSeconds(500000));
}

void test_report_carries_manual_compressor_time()
{
  RunRecord run;
  run.runId = 4;
  run.pumpRunS = 600;
  run.manualCompressorS = 300;
  TEST_ASSERT_EQUAL_STRING(R"({"runId":4,"pumpRunS":600,"restarts":0,"manualCompressorS":300})",
    buildRunReport(run, false).c_str());
}

void test_report_counts_restarts()
{
  RunRecord run;
  run.runId = 3;
  run.pumpRunS = 80;
  run.restarts = 2;
  TEST_ASSERT_EQUAL_STRING(R"({"runId":3,"pumpRunS":80,"restarts":2})", buildRunReport(run, false).c_str());
}

void test_damaged_queue_blob_gives_an_empty_queue()
{
  MemoryStore store;
  const uint8_t garbage[5] = {1, 2, 3, 4, 5};
  store.write(KEY_RUN_QUEUE, garbage, sizeof(garbage));
  RunQueue queue;
  queue.load(store);
  TEST_ASSERT_TRUE(queue.empty());
}

void test_first_start_has_no_previous_run()
{
  MemoryStore store;
  RunQueue queue;
  TEST_ASSERT_FALSE(queuePreviousRun(store, queue));
  TEST_ASSERT_TRUE(queue.empty());
}

const char *SHA = "0123456789abcdef0123456789ABCDEF0123456789abcdef0123456789abcdef";

OtaOffer parseOffer(const char *json, bool &ok)
{
  JsonDocument settings;
  deserializeJson(settings, json);
  OtaOffer offer;
  ok = parseOtaOffer(settings, offer);
  return offer;
}

void test_ota_offer_is_parsed_and_sha_lowercased()
{
  bool ok = false;
  const std::string json = std::string("{\"firmware\":{\"version\":\"1.0.1\",\"url\":\"https://github.com/x/firmware.bin\",\"sha256\":\"") + SHA + "\"}}";
  OtaOffer offer = parseOffer(json.c_str(), ok);
  TEST_ASSERT_TRUE(ok);
  TEST_ASSERT_EQUAL_STRING("1.0.1", offer.version.c_str());
  TEST_ASSERT_EQUAL_STRING("0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef", offer.sha256.c_str());
}

void test_incomplete_or_unsafe_ota_offer_is_ignored()
{
  bool ok = true;
  parseOffer("{}", ok);
  TEST_ASSERT_FALSE(ok);
  parseOffer("{\"firmware\":{\"version\":\"1\",\"url\":\"http://x/f.bin\",\"sha256\":\"00\"}}", ok);
  TEST_ASSERT_FALSE(ok);
  const std::string plain = std::string("{\"firmware\":{\"version\":\"1\",\"url\":\"http://x/f.bin\",\"sha256\":\"") + SHA + "\"}}";
  parseOffer(plain.c_str(), ok);
  TEST_ASSERT_FALSE(ok);
  const std::string noSha = "{\"firmware\":{\"version\":\"1\",\"url\":\"https://x/f.bin\"}}";
  parseOffer(noSha.c_str(), ok);
  TEST_ASSERT_FALSE(ok);
}

void test_update_only_for_a_different_version_not_tried_before()
{
  OtaOffer offer;
  offer.version = "1.0.1";
  TEST_ASSERT_TRUE(shouldUpdate(offer, "1.0.0", ""));
  TEST_ASSERT_FALSE(shouldUpdate(offer, "1.0.1", ""));
  // po restarcie obraz nadal ma starą wersję: bez drugiej próby (pętla)
  TEST_ASSERT_FALSE(shouldUpdate(offer, "1.0.0", "1.0.1"));
  // starsza wersja z chmury też jest przyjmowana (powrót do poprzedniego wydania)
  offer.version = "0.9.0";
  TEST_ASSERT_TRUE(shouldUpdate(offer, "1.0.0", "1.0.1"));
}

int main()
{
  UNITY_BEGIN();
  RUN_TEST(test_compressor_runs_once_for_the_set_time);
  RUN_TEST(test_compressor_restart_counts_from_now_and_keeps_first_start);
  RUN_TEST(test_manual_compressor_runs_until_stopped);
  RUN_TEST(test_manual_compressor_stops_after_the_limit);
  RUN_TEST(test_stop_ends_automatic_run_early);
  RUN_TEST(test_new_compressor_time_applies_from_the_next_run);
  RUN_TEST(test_invalid_settings_are_rejected_and_old_ones_kept);
  RUN_TEST(test_settings_round_trip_through_nvs_text);
  RUN_TEST(test_report_json_leaves_out_unknown_compressor_end);
  RUN_TEST(test_undelivered_previous_run_goes_to_the_queue_once);
  RUN_TEST(test_delivered_run_is_not_queued);
  RUN_TEST(test_queue_survives_restart_and_drops_the_oldest_when_full);
  RUN_TEST(test_compressor_with_zero_seconds_never_runs);
  RUN_TEST(test_restart_while_running_extends_the_run);
  RUN_TEST(test_manual_compressor_time_is_counted_for_the_report);
  RUN_TEST(test_report_carries_manual_compressor_time);
  RUN_TEST(test_report_counts_restarts);
  RUN_TEST(test_damaged_queue_blob_gives_an_empty_queue);
  RUN_TEST(test_first_start_has_no_previous_run);
  RUN_TEST(test_local_compressor_time_applies_from_the_next_start_including_restart);
  RUN_TEST(test_cloud_settings_keep_unsent_local_compressor_time);
  RUN_TEST(test_compressor_time_from_the_install_form);
  RUN_TEST(test_ota_offer_is_parsed_and_sha_lowercased);
  RUN_TEST(test_incomplete_or_unsafe_ota_offer_is_ignored);
  RUN_TEST(test_update_only_for_a_different_version_not_tried_before);
  return UNITY_END();
}
