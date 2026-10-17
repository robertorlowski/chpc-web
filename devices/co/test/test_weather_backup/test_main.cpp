// Testy zapasowej pogody co (od 1.3.1, wspólne devices/common/weather/src/weather.hpp): chmura podaje w odpowiedzi
// hp/add tylko miejsca bez świeżej pogody od włącznika; pusta lista usuwa miejsca (włącznik znów działa), a odczyty
// idą w następnym hp/add jako tablica weather obok telemetrii.
// Uruchamianie: pio test -e native.
#ifdef ARDUINO
#include <Arduino.h>
#endif
#include <unity.h>

#include <weather.hpp>

namespace {
JsonDocument response(const char *json)
{
  JsonDocument document;
  deserializeJson(document, json);
  return document;
}

WeatherReading sample()
{
  WeatherReading reading;
  reading.temperature = 4.5;
  reading.code = 1;
  reading.cloudCover = 13;
  reading.valid = true;
  return reading;
}
}

void setUp() {}
void tearDown() {}

void test_takes_places_from_hp_add_reply()
{
  WeatherPlaces places;
  JsonDocument reply = response("{\"operation\":{},\"t_out\":5,\"weather_queries\":[{\"id\":\"a1\",\"lat\":49.37,\"lon\":20.0}]}");
  TEST_ASSERT_TRUE(places.update(reply.as<JsonVariantConst>()));
  TEST_ASSERT_EQUAL(1, places.size());
  TEST_ASSERT_EQUAL(0, places.dueIndex(1000));
}

void test_empty_list_clears_places()
{
  WeatherPlaces places;
  places.update(response("{\"weather_queries\":[{\"id\":\"a1\",\"lat\":49.37,\"lon\":20.0}]}").as<JsonVariantConst>());
  places.onFetched(0, true, sample(), 1000);
  places.update(response("{\"operation\":{},\"weather_queries\":[]}").as<JsonVariantConst>());
  TEST_ASSERT_EQUAL(0, places.size());
  TEST_ASSERT_EQUAL(-1, places.dueIndex(100000));
  JsonDocument body = response("{\"HP\":{},\"weather\":[1]}");
  places.write(body, 2000);
  TEST_ASSERT_TRUE(body["weather"].isNull());
}

void test_reply_without_list_keeps_places()
{
  WeatherPlaces places;
  places.update(response("{\"weather_queries\":[{\"id\":\"a1\",\"lat\":49.37,\"lon\":20.0}]}").as<JsonVariantConst>());
  // starsza chmura bez weather_queries w hp/add: lista bez zmian
  TEST_ASSERT_FALSE(places.update(response("{\"operation\":{},\"t_out\":5}").as<JsonVariantConst>()));
  TEST_ASSERT_EQUAL(1, places.size());
}

void test_writes_readings_next_to_telemetry()
{
  WeatherPlaces places;
  places.update(response("{\"weather_queries\":[{\"id\":\"a1\",\"lat\":49.37,\"lon\":20.0}]}").as<JsonVariantConst>());
  places.onFetched(0, true, sample(), 1000);
  JsonDocument body = response("{\"HP\":{\"Ttarget\":40}}");
  places.write(body, 31000);
  TEST_ASSERT_EQUAL(40, body["HP"]["Ttarget"].as<int>());
  TEST_ASSERT_EQUAL_STRING("a1", body["weather"][0]["id"].as<const char *>());
  TEST_ASSERT_EQUAL(30, body["weather"][0]["age_s"].as<int>());
}

int main()
{
  UNITY_BEGIN();
  RUN_TEST(test_takes_places_from_hp_add_reply);
  RUN_TEST(test_empty_list_clears_places);
  RUN_TEST(test_reply_without_list_keeps_places);
  RUN_TEST(test_writes_readings_next_to_telemetry);
  return UNITY_END();
}
