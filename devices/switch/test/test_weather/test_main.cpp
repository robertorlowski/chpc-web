// Testy pogody z Open-Meteo (od 1.1.3): położenie z odpowiedzi chmury, adres zapytania, parser odpowiedzi,
// pole weather w telemetrii i harmonogram pobierania. Uruchamianie: pio test -e native.
#ifdef ARDUINO
#include <Arduino.h>
#endif
#include <unity.h>

#include <weather.hpp>

void setUp() {}
void tearDown() {}

static JsonDocument json(const char *text)
{
  JsonDocument document;
  deserializeJson(document, text);
  return document;
}

void testLocationFromCloudResponse()
{
  WeatherLocation location;
  TEST_ASSERT_FALSE(parseWeatherLocation(json("{\"operation\":{}}").as<JsonVariantConst>(), location));
  TEST_ASSERT_FALSE(parseWeatherLocation(json("{\"weather_query\":{\"lat\":120,\"lon\":20}}").as<JsonVariantConst>(), location));
  TEST_ASSERT_FALSE(location.valid);
  TEST_ASSERT_TRUE(parseWeatherLocation(json("{\"weather_query\":{\"lat\":49.374298,\"lon\":20.007237}}").as<JsonVariantConst>(), location));
  TEST_ASSERT_TRUE(location.valid);
  TEST_ASSERT_EQUAL_STRING(
    "https://api.open-meteo.com/v1/forecast?latitude=49.3743&longitude=20.0072"
    "&current=temperature_2m,weather_code,cloud_cover,precipitation,rain,snowfall,wind_speed_10m,is_day&timezone=Europe%2FWarsaw",
    openMeteoUrl(location).c_str());
}

// odpowiedź Open-Meteo z 14.10.2026 23:15 (Biały Dunajec, pochmurno, noc)
void testParseOpenMeteoResponse()
{
  const char *response =
    "{\"latitude\":49.378174,\"current_units\":{\"weather_code\":\"wmo code\"},\"current\":{\"time\":\"2026-10-14T23:15\","
    "\"interval\":900,\"temperature_2m\":6.0,\"weather_code\":3,\"cloud_cover\":100,\"precipitation\":0.00,\"rain\":0.00,\"snowfall\":0.00,"
    "\"wind_speed_10m\":5.8,\"is_day\":0}}";
  WeatherReading reading;
  TEST_ASSERT_TRUE(parseOpenMeteoCurrent(response, strlen(response), reading));
  TEST_ASSERT_EQUAL_INT(3, reading.code);
  TEST_ASSERT_EQUAL_INT(100, reading.cloudCover);
  TEST_ASSERT_EQUAL_INT(58, static_cast<int>(reading.windSpeed * 10 + 0.5));
  TEST_ASSERT_EQUAL_INT(60, static_cast<int>(reading.temperature * 10 + 0.5));
  TEST_ASSERT_FALSE(reading.isDay);
  TEST_ASSERT_TRUE(reading.valid);

  WeatherReading broken;
  const char *missing = "{\"current\":{\"weather_code\":61}}";
  TEST_ASSERT_FALSE(parseOpenMeteoCurrent(missing, strlen(missing), broken));
  TEST_ASSERT_FALSE(parseOpenMeteoCurrent("{nie json", 9, broken));
  TEST_ASSERT_FALSE(broken.valid);
}

void testTelemetryField()
{
  JsonDocument document;
  WeatherReading reading;
  reading.temperature = 6.5;
  reading.code = 61;
  reading.cloudCover = 90;
  reading.precipitation = 1.2;
  reading.rain = 1.2;
  reading.windSpeed = 12.5;
  reading.isDay = true;
  reading.valid = true;
  writeWeather(document, reading, 120500);
  std::string text;
  serializeJson(document, text);
  TEST_ASSERT_EQUAL_STRING(
    "{\"weather\":{\"temp\":6.5,\"code\":61,\"cloud\":90,\"precip\":1.2,\"rain\":1.2,\"snow\":0,\"wind\":12.5,\"day\":1,\"age_s\":120}}",
    text.c_str());
  // za stara pogoda znika z telemetrii
  writeWeather(document, reading, WEATHER_MAX_AGE_MS + 1);
  TEST_ASSERT_TRUE(document["weather"].isNull());
}

void testSchedule()
{
  WeatherSchedule schedule;
  TEST_ASSERT_FALSE(schedule.due(false, 0));  // bez położenia nic
  TEST_ASSERT_TRUE(schedule.due(true, 1000));
  schedule.onAttempt(false, 1000);
  TEST_ASSERT_FALSE(schedule.due(true, 1000 + WEATHER_RETRY_MS - 1));
  TEST_ASSERT_TRUE(schedule.due(true, 1000 + WEATHER_RETRY_MS));
  schedule.onAttempt(true, 400000);
  TEST_ASSERT_FALSE(schedule.due(true, 400000 + WEATHER_RETRY_MS));
  TEST_ASSERT_TRUE(schedule.due(true, 400000 + WEATHER_INTERVAL_MS));
  // nowe położenie: pobranie od razu
  schedule.onLocation(true);
  TEST_ASSERT_TRUE(schedule.due(true, 400001));
}

int runAllTests()
{
  UNITY_BEGIN();
  RUN_TEST(testLocationFromCloudResponse);
  RUN_TEST(testParseOpenMeteoResponse);
  RUN_TEST(testTelemetryField);
  RUN_TEST(testSchedule);
  return UNITY_END();
}

#ifdef ARDUINO
void setup()
{
  delay(2000);
  runAllTests();
}

void loop()
{
}
#else
int main()
{
  return runAllTests();
}
#endif
