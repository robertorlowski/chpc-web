// Testy native (pio test -e native) logiki hydroforu niezależnej od sprzętu:
// kompresor, czas z /install, ustawienia, szacunek wody (te same przykłady co
// test serwera), JSON wysyłki i kolejka NVS na atrapie. Pliki .cpp z src są
// dołączane bezpośrednio, bo środowisko native nie buduje src.
#include <unity.h>

#include <cstring>
#include <map>
#include <string>
#include <vector>

#include <compressor.hpp>
#include <run_report.hpp>
#include <settings.hpp>
#include "../../src/compressor.cpp"
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

Settings twoTanks()
{
  Settings settings;
  parseSettingsText(
    R"({"compressor_seconds":30,"pressure_low":2,"pressure_high":4,"tanks":[
      {"name":"Ocynkowany","kind":"air","volumeLiters":300,"enabled":true,"k":1},
      {"name":"Przeponowy","kind":"membrane","volumeLiters":300,"enabled":true,"precharge":1.8}]})",
    settings);
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
  Settings settings = twoTanks();
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

// --- ustawienia i woda ---

void test_cloud_settings_keep_unsent_local_compressor_time()
{
  Settings settings = twoTanks();
  settings.compressorSeconds = 50;
  const char *cloud = R"({"compressor_seconds":30,"pressure_low":1.5,"pressure_high":3.5,"tanks":[]})";
  JsonDocument json;
  deserializeJson(json, cloud);

  TEST_ASSERT_TRUE(applyCloudSettings(json.as<JsonVariantConst>(), settings, true));
  TEST_ASSERT_EQUAL_UINT16(50, settings.compressorSeconds);
  // pozostałe ustawienia z chmury są przyjmowane
  TEST_ASSERT_FLOAT_WITHIN(0.01f, 1.5f, settings.pressureLow);
  TEST_ASSERT_EQUAL_UINT8(0, settings.tankCount);

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

void test_estimate_for_both_tank_kinds()
{
  Settings settings = twoTanks();
  TEST_ASSERT_EQUAL_UINT8(2, settings.tankCount);
  TEST_ASSERT_FLOAT_WITHIN(0.5f, 40.2f, tankWaterLiters(settings.tanks[0], 2, 4));
  TEST_ASSERT_FLOAT_WITHIN(0.5f, 111.7f, tankWaterLiters(settings.tanks[1], 2, 4));
  TEST_ASSERT_FLOAT_WITHIN(0.5f, 151.9f, estimatedWaterLiters(settings));
}

void test_disabled_tank_is_not_counted()
{
  Settings settings = twoTanks();
  settings.tanks[1].enabled = false;
  TEST_ASSERT_FLOAT_WITHIN(0.5f, 40.2f, estimatedWaterLiters(settings));
  settings.tanks[0].k = 0.5f;
  TEST_ASSERT_FLOAT_WITHIN(0.5f, 20.1f, estimatedWaterLiters(settings));
}

void test_invalid_settings_are_rejected_and_old_ones_kept()
{
  Settings settings = twoTanks();
  TEST_ASSERT_FALSE(parseSettingsText(R"({"compressor_seconds":0})", settings));
  TEST_ASSERT_FALSE(parseSettingsText("nie json", settings));
  TEST_ASSERT_EQUAL_UINT16(30, settings.compressorSeconds);
  TEST_ASSERT_EQUAL_UINT8(2, settings.tankCount);
}

void test_settings_round_trip_through_nvs_text()
{
  Settings settings = twoTanks();
  Settings restored;
  TEST_ASSERT_TRUE(parseSettingsText(serializeSettings(settings), restored));
  TEST_ASSERT_EQUAL_UINT8(2, restored.tankCount);
  TEST_ASSERT_TRUE(restored.tanks[1].membrane);
  TEST_ASSERT_EQUAL_STRING("Przeponowy", restored.tanks[1].name);
  TEST_ASSERT_FLOAT_WITHIN(0.01f, 1.8f, restored.tanks[1].precharge);
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

void test_membrane_precharge_above_low_threshold()
{
  Tank tank;
  tank.membrane = true;
  tank.volumeLiters = 100;
  tank.precharge = 3;
  // V · (1 − p0_abs / p_g_abs) = 100 · (1 − 4,013 / 5,013)
  TEST_ASSERT_FLOAT_WITHIN(0.2f, 19.9f, tankWaterLiters(tank, 2, 4));
  tank.precharge = 4;
  TEST_ASSERT_EQUAL_FLOAT(0, tankWaterLiters(tank, 2, 4));
}

void test_wrong_pressure_thresholds_give_no_water()
{
  Settings settings = twoTanks();
  settings.pressureLow = 4;
  settings.pressureHigh = 2;
  TEST_ASSERT_EQUAL_FLOAT(0, estimatedWaterLiters(settings));
}

void test_settings_without_tanks_keep_the_old_tanks_and_defaults()
{
  Settings settings = twoTanks();
  TEST_ASSERT_TRUE(parseSettingsText(R"({"compressor_seconds":20})", settings));
  TEST_ASSERT_EQUAL_UINT8(2, settings.tankCount);

  // brak k i precharge: k = 1, p0 = 0
  TEST_ASSERT_TRUE(parseSettingsText(R"({"tanks":[{"kind":"air","volumeLiters":100},{"kind":"membrane","volumeLiters":50}]})", settings));
  TEST_ASSERT_FLOAT_WITHIN(0.001f, 1.0f, settings.tanks[0].k);
  TEST_ASSERT_TRUE(settings.tanks[0].enabled);
  TEST_ASSERT_FLOAT_WITHIN(0.001f, 0.0f, settings.tanks[1].precharge);
}

void test_more_tanks_than_supported_are_cut()
{
  Settings settings;
  TEST_ASSERT_TRUE(parseSettingsText(R"({"tanks":[
    {"kind":"air","volumeLiters":1},{"kind":"air","volumeLiters":2},{"kind":"air","volumeLiters":3},
    {"kind":"air","volumeLiters":4},{"kind":"air","volumeLiters":5}]})", settings));
  TEST_ASSERT_EQUAL_UINT8(MAX_TANKS, settings.tankCount);
  TEST_ASSERT_FLOAT_WITHIN(0.001f, 4.0f, settings.tanks[MAX_TANKS - 1].volumeLiters);
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

int main()
{
  UNITY_BEGIN();
  RUN_TEST(test_compressor_runs_once_for_the_set_time);
  RUN_TEST(test_compressor_restart_counts_from_now_and_keeps_first_start);
  RUN_TEST(test_new_compressor_time_applies_from_the_next_run);
  RUN_TEST(test_estimate_for_both_tank_kinds);
  RUN_TEST(test_disabled_tank_is_not_counted);
  RUN_TEST(test_invalid_settings_are_rejected_and_old_ones_kept);
  RUN_TEST(test_settings_round_trip_through_nvs_text);
  RUN_TEST(test_report_json_leaves_out_unknown_compressor_end);
  RUN_TEST(test_undelivered_previous_run_goes_to_the_queue_once);
  RUN_TEST(test_delivered_run_is_not_queued);
  RUN_TEST(test_queue_survives_restart_and_drops_the_oldest_when_full);
  RUN_TEST(test_compressor_with_zero_seconds_never_runs);
  RUN_TEST(test_restart_while_running_extends_the_run);
  RUN_TEST(test_membrane_precharge_above_low_threshold);
  RUN_TEST(test_wrong_pressure_thresholds_give_no_water);
  RUN_TEST(test_settings_without_tanks_keep_the_old_tanks_and_defaults);
  RUN_TEST(test_more_tanks_than_supported_are_cut);
  RUN_TEST(test_report_counts_restarts);
  RUN_TEST(test_damaged_queue_blob_gives_an_empty_queue);
  RUN_TEST(test_first_start_has_no_previous_run);
  RUN_TEST(test_local_compressor_time_applies_from_the_next_start_including_restart);
  RUN_TEST(test_cloud_settings_keep_unsent_local_compressor_time);
  RUN_TEST(test_compressor_time_from_the_install_form);
  return UNITY_END();
}
