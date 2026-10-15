#pragma once

#include <stdint.h>
#include <stdio.h>
#include <string.h>

#include <string>

#include <ArduinoJson.h>

// Pogoda z Open-Meteo pobierana przez włącznik z domowego łącza (od 1.1.3, 2026-10-15; włącznik, bo nie każdy
// dom będzie miał sterownik co) i wysyłana do chmury w zgłoszeniu stanu switch/state (pole weather). Chmura na
// Render pobierać jej nie może: Open-Meteo liczy limit zapytań na adres IP, a Render dzieli adres z wieloma
// usługami (w lipcu 2026 pobieranie z serwera nie działało). Współrzędne podaje chmura w odpowiedzi na zgłoszenie
// stanu (weather_query {lat, lon}), więc położenie jest w jednym miejscu; bez nich włącznik nic nie pobiera.
// Pobieranie co WEATHER_INTERVAL_MS (96 zapytań na dobę), po błędzie ponowienie po WEATHER_RETRY_MS.
// Temperatura z prognozy służy chmurze tylko wtedy, gdy nie ma świeżego odczytu czujnika zewnętrznego kotła.

constexpr unsigned long WEATHER_INTERVAL_MS = 15UL * 60UL * 1000UL;
constexpr unsigned long WEATHER_RETRY_MS = 5UL * 60UL * 1000UL;
// starszej pogody telemetria nie niesie (chmura i tak uznałaby ją za nieaktualną)
constexpr unsigned long WEATHER_MAX_AGE_MS = 45UL * 60UL * 1000UL;

struct WeatherLocation {
  double lat = 0;
  double lon = 0;
  bool valid = false;
  bool operator==(const WeatherLocation &other) const
  {
    return valid == other.valid && lat == other.lat && lon == other.lon;
  }
};

// Bieżące warunki: temperatura [°C], kod pogody WMO (0 bezchmurnie … 99 burza z gradem), zachmurzenie [%], opad, deszcz [mm],
// śnieg [cm] z ostatniego kwadransa, wiatr [km/h], dzień (między wschodem a zachodem słońca).
struct WeatherReading {
  double temperature = 0;
  int code = 0;
  int cloudCover = 0;
  double precipitation = 0;
  double rain = 0;
  double snowfall = 0;
  double windSpeed = 0;
  bool isDay = true;
  bool valid = false;
};

// weather_query z odpowiedzi chmury; brak albo współrzędne spoza zakresu = false (out bez zmian).
inline bool parseWeatherLocation(JsonVariantConst response, WeatherLocation &out)
{
  JsonObjectConst query = response["weather_query"].as<JsonObjectConst>();
  if (query.isNull() || !query["lat"].is<double>() || !query["lon"].is<double>()) return false;
  const double lat = query["lat"].as<double>();
  const double lon = query["lon"].as<double>();
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return false;
  out.lat = lat;
  out.lon = lon;
  out.valid = true;
  return true;
}

inline std::string openMeteoUrl(const WeatherLocation &location)
{
  char url[320];
  snprintf(url, sizeof(url),
    "https://api.open-meteo.com/v1/forecast?latitude=%.4f&longitude=%.4f"
    "&current=temperature_2m,weather_code,cloud_cover,precipitation,rain,snowfall,wind_speed_10m,is_day"
    "&timezone=Europe%%2FWarsaw",
    location.lat, location.lon);
  return url;
}

// Odpowiedź Open-Meteo {"current": {...}}; brak któregoś pola = false.
inline bool parseOpenMeteoCurrent(const char *json, size_t length, WeatherReading &out)
{
  JsonDocument document;
  if (deserializeJson(document, json, length)) return false;
  JsonObjectConst current = document["current"].as<JsonObjectConst>();
  if (current.isNull()) return false;
  const char *keys[] = {"temperature_2m", "weather_code", "cloud_cover", "precipitation", "rain", "snowfall", "wind_speed_10m", "is_day"};
  for (const char *key : keys) {
    if (!current[key].is<double>()) return false;
  }
  WeatherReading reading;
  reading.temperature = current["temperature_2m"].as<double>();
  reading.code = current["weather_code"].as<int>();
  reading.cloudCover = current["cloud_cover"].as<int>();
  reading.precipitation = current["precipitation"].as<double>();
  reading.rain = current["rain"].as<double>();
  reading.snowfall = current["snowfall"].as<double>();
  reading.windSpeed = current["wind_speed_10m"].as<double>();
  reading.isDay = current["is_day"].as<int>() != 0;
  reading.valid = true;
  out = reading;
  return true;
}

// Pole weather w zgłoszeniu stanu: warunki i wiek pomiaru w sekundach (chmura liczy z niego czas).
// Bez ważnego albo przy zbyt starym odczycie pole jest usuwane.
inline void writeWeather(JsonDocument &document, const WeatherReading &reading, unsigned long ageMs)
{
  if (!reading.valid || ageMs > WEATHER_MAX_AGE_MS) {
    document.remove("weather");
    return;
  }
  JsonObject weather = document["weather"].to<JsonObject>();
  weather["temp"] = reading.temperature;
  weather["code"] = reading.code;
  weather["cloud"] = reading.cloudCover;
  weather["precip"] = reading.precipitation;
  weather["rain"] = reading.rain;
  weather["snow"] = reading.snowfall;
  weather["wind"] = reading.windSpeed;
  weather["day"] = reading.isDay ? 1 : 0;
  weather["age_s"] = ageMs / 1000UL;
}

// Kiedy pobierać: pierwszy raz zaraz po poznaniu położenia, potem co WEATHER_INTERVAL_MS, po błędzie
// co WEATHER_RETRY_MS; zmiana położenia = pobranie od razu.
class WeatherSchedule {
public:
  void onLocation(bool changed) { if (changed) attempted = false; }
  bool due(bool locationValid, unsigned long now) const
  {
    if (!locationValid) return false;
    if (!attempted) return true;
    return now - lastAttemptAt >= (lastOk ? WEATHER_INTERVAL_MS : WEATHER_RETRY_MS);
  }
  void onAttempt(bool ok, unsigned long now)
  {
    attempted = true;
    lastAttemptAt = now;
    lastOk = ok;
  }

private:
  bool attempted = false;
  bool lastOk = false;
  unsigned long lastAttemptAt = 0;
};
