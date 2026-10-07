// Testy native automatycznego wyboru polaryzacji magistrali (bus_polarity.*).
#include <unity.h>

#include <bus_polarity.hpp>
#include "../../src/bus_polarity.cpp"
#include <fuel_meter.hpp>
#include "../../src/fuel_meter.cpp"

void setUp() {}
void tearDown() {}

void test_flips_when_bytes_without_frames()
{
  BusPolarity polarity(false);
  TEST_ASSERT_FALSE(polarity.update(0));
  polarity.onBytes(500);
  TEST_ASSERT_FALSE(polarity.update(7999));
  TEST_ASSERT_TRUE(polarity.update(8000));
  TEST_ASSERT_TRUE(polarity.inverted());
  TEST_ASSERT_EQUAL_UINT32(1, polarity.switches());
}

void test_silence_keeps_polarity()
{
  BusPolarity polarity(true);
  polarity.update(0);
  polarity.onBytes(10);
  TEST_ASSERT_FALSE(polarity.update(9000));
  TEST_ASSERT_TRUE(polarity.inverted());
}

void test_frame_confirms_and_holds_longer()
{
  BusPolarity polarity(false);
  polarity.update(0);
  polarity.onFrame(1000);
  TEST_ASSERT_TRUE(polarity.confirmed());
  polarity.onBytes(5000);
  // potwierdzona: krótka seria złych bajtów (zakłócenia) nie zmienia polaryzacji
  TEST_ASSERT_FALSE(polarity.update(60000));
  TEST_ASSERT_TRUE(polarity.update(1000 + BusPolarity::CONFIRMED_SWITCH_AFTER_MS));
  TEST_ASSERT_TRUE(polarity.inverted());
  TEST_ASSERT_FALSE(polarity.confirmed());
}

void test_frames_keep_resetting_window()
{
  BusPolarity polarity(false);
  polarity.update(0);
  for (uint32_t t = 1000; t < 60000; t += 1000) {
    polarity.onBytes(300);
    polarity.onFrame(t);
    TEST_ASSERT_FALSE(polarity.update(t));
  }
  TEST_ASSERT_FALSE(polarity.inverted());
}

// Licznik pelletu jak FuelMeter w PyPlumIO: kg/h × czas od poprzedniego SensorData, przerwa ≥ 5 min pomijana.
void test_fuel_meter_integrates_like_pyplumio()
{
  FuelMeter meter;
  meter.begin(1000.0);  // stan z NVS: 1 kg
  EcomaxFloat rate;
  rate.present = true;
  rate.value = 3.6f;  // 3,6 kg/h = 1 g/s
  meter.onSensorData(rate, 10000);  // pierwszy: tylko czas odniesienia
  TEST_ASSERT_DOUBLE_WITHIN(0.001, 1000.0, meter.grams());
  meter.onSensorData(rate, 12500);  // 2,5 s
  TEST_ASSERT_DOUBLE_WITHIN(0.01, 1002.5, meter.grams());
  // przerwa 5 min: odcinek pominięty, potem liczy dalej
  meter.onSensorData(rate, 12500 + FuelMeter::MAX_GAP_MS);
  TEST_ASSERT_DOUBLE_WITHIN(0.01, 1002.5, meter.grams());
  meter.onSensorData(rate, 12500 + FuelMeter::MAX_GAP_MS + 1000);
  TEST_ASSERT_DOUBLE_WITHIN(0.01, 1003.5, meter.grams());
  // bez zużycia w ramce i przy 0 kg/h nic nie przybywa
  EcomaxFloat none;
  meter.onSensorData(none, 400000);
  rate.value = 0;
  meter.onSensorData(rate, 401000);
  TEST_ASSERT_DOUBLE_WITHIN(0.01, 1003.5, meter.grams());
  TEST_ASSERT_DOUBLE_WITHIN(0.00001, 1.0035, meter.kilograms());
}

int main()
{
  UNITY_BEGIN();
  RUN_TEST(test_flips_when_bytes_without_frames);
  RUN_TEST(test_silence_keeps_polarity);
  RUN_TEST(test_frame_confirms_and_holds_longer);
  RUN_TEST(test_frames_keep_resetting_window);
  RUN_TEST(test_fuel_meter_integrates_like_pyplumio);
  return UNITY_END();
}
