#pragma once

#include <stdint.h>
#include <stdio.h>
#include <string.h>

#include <string>
#include <vector>

#include <ArduinoJson.h>

// Pogoda z Open-Meteo pobierana przez włącznik z domowego łącza (od 1.1.3, 2026-10-15; włącznik, bo nie każdy
// dom będzie miał sterownik co) i wysyłana do chmury w zgłoszeniu stanu switch/state (pole weather). Chmura na
// Render pobierać jej nie może: Open-Meteo liczy limit zapytań na adres IP, a Render dzieli adres z wieloma
// usługami (w lipcu 2026 pobieranie z serwera nie działało). Współrzędne podaje chmura w odpowiedzi na zgłoszenie
// stanu (weather_query {lat, lon}), więc położenie jest w jednym miejscu; bez nich włącznik nic nie pobiera.
// Pobieranie co WEATHER_INTERVAL_MS (96 zapytań na dobę na miejsce), po błędzie ponowienie po WEATHER_RETRY_MS.
// Temperatura z prognozy służy chmurze tylko wtedy, gdy nie ma świeżego odczytu czujnika zewnętrznego kotła.
//
// Od 1.2.0 (2026-10-16) wiele miejsc: chmura podaje weather_queries [{id, lat, lon}, ...] (kafelki pogody na liście
// sterowników, najwyżej WEATHER_MAX_PLACES), włącznik pobiera każde osobno (jedno zapytanie naraz, odstęp
// WEATHER_SPACING_MS) i odsyła tablicę weather: [{id, temp, ..., age_s}, ...]. Starsza chmura podaje samo
// weather_query {lat, lon}: wtedy jedno miejsce bez id i pole weather jako obiekt, jak w 1.1.3.
//
// Od 2026-10-17 plik jest wspólny (devices/common/weather, lib_extra_dirs = ../common): sterownik co (od 1.3.1)
// pobiera pogodę zapasowo, jak przekaźnik poczty. Chmura podaje mu w odpowiedzi na hp/add tylko miejsca, dla
// których włącznik nie dostarczył świeżej pogody (pusta lista = nic do pobrania), a co odsyła tablicę weather
// w następnym hp/add. Pusta lista weather_queries usuwa wszystkie miejsca.

constexpr unsigned long WEATHER_INTERVAL_MS = 15UL * 60UL * 1000UL;
constexpr unsigned long WEATHER_RETRY_MS = 5UL * 60UL * 1000UL;
// starszej pogody telemetria nie niesie (chmura i tak uznałaby ją za nieaktualną)
constexpr unsigned long WEATHER_MAX_AGE_MS = 45UL * 60UL * 1000UL;
constexpr size_t WEATHER_MAX_PLACES = 8;
// między pobraniami dwóch miejsc: każde blokuje pętlę na kilka sekund, a między nimi pętla ma dojść do głosu
constexpr unsigned long WEATHER_SPACING_MS = 5000UL;

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

// Model DWD ICON (icon_seamless, ok. 2 km nad Europą Środkową) zamiast automatycznego wyboru Open-Meteo (od włącznika
// 1.3.3, 2026-10-18): model domyślny liczył cienkie wysokie chmury jako pełne zachmurzenie i przy słońcu (PV jak
// w słoneczne dni) podawał „pochmurno” (98 %, niskich 0 %), ICON — „małe zachmurzenie” (42 %). Format odpowiedzi ten sam.
inline std::string openMeteoUrl(const WeatherLocation &location)
{
  char url[340];
  snprintf(url, sizeof(url),
    "https://api.open-meteo.com/v1/forecast?latitude=%.4f&longitude=%.4f"
    "&current=temperature_2m,weather_code,cloud_cover,precipitation,rain,snowfall,wind_speed_10m,is_day"
    "&timezone=Europe%%2FWarsaw&models=icon_seamless",
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

// Jedno miejsce z chmury: id kafelka pogody (puste przy starszej chmurze z weather_query), położenie, ostatni
// poprawny odczyt z czasem pobrania i harmonogram pobierania.
struct WeatherPlace {
  std::string id;
  WeatherLocation location;
  WeatherReading reading;
  unsigned long readAt = 0;
  WeatherSchedule schedule;
};

// Lista miejsc do pogody i ich odczyty.
class WeatherPlaces {
public:
  const std::vector<WeatherPlace> &all() const { return places; }
  size_t size() const { return places.size(); }
  WeatherPlace &at(size_t index) { return places[index]; }

  // Odpowiedź chmury na zgłoszenie stanu: weather_queries [{id, lat, lon}] (od chmury 2026-10-16) albo samo
  // weather_query {lat, lon} (dom, bez id). Miejsce o tym samym id zachowuje odczyt; zmiana położenia = pobranie
  // od razu; miejsca, których nie ma w odpowiedzi, znikają. Zwraca false, gdy odpowiedź nie niesie miejsc
  // (lista bez zmian).
  bool update(JsonVariantConst response)
  {
    std::vector<std::pair<std::string, WeatherLocation>> wanted;
    JsonArrayConst queries = response["weather_queries"].as<JsonArrayConst>();
    if (!queries.isNull()) {
      for (JsonVariantConst item : queries) {
        if (wanted.size() >= WEATHER_MAX_PLACES) break;
        WeatherLocation location;
        const char *id = item["id"].as<const char *>();
        if (!id || !*id || !parseLocation(item, location)) continue;
        wanted.push_back({id, location});
      }
    } else {
      WeatherLocation location;
      if (!parseWeatherLocation(response, location)) return false;
      wanted.push_back({"", location});
    }
    std::vector<WeatherPlace> next;
    for (const auto &entry : wanted) {
      WeatherPlace place;
      place.id = entry.first;
      place.location = entry.second;
      for (const WeatherPlace &old : places) {
        if (old.id != entry.first) continue;
        place = old;
        place.location = entry.second;
        place.schedule.onLocation(!(old.location == entry.second));
        break;
      }
      next.push_back(place);
    }
    places = next;
    return true;
  }

  // Indeks miejsca do pobrania teraz albo -1: pierwsze, któremu minął czas, nie wcześniej niż WEATHER_SPACING_MS
  // po poprzednim pobraniu.
  int dueIndex(unsigned long now) const
  {
    if (fetchedOnce && now - lastFetchAt < WEATHER_SPACING_MS) return -1;
    for (size_t index = 0; index < places.size(); index++) {
      if (places[index].schedule.due(places[index].location.valid, now)) return static_cast<int>(index);
    }
    return -1;
  }

  // Wynik pobrania miejsca: udany odczyt zastępuje poprzedni, nieudany zostawia go (do WEATHER_MAX_AGE_MS).
  void onFetched(size_t index, bool ok, const WeatherReading &reading, unsigned long now)
  {
    if (index >= places.size()) return;
    WeatherPlace &place = places[index];
    if (ok) {
      place.reading = reading;
      place.readAt = now;
    }
    place.schedule.onAttempt(ok, now);
    fetchedOnce = true;
    lastFetchAt = now;
  }

  // Pole weather w zgłoszeniu stanu: tablica [{id, ...}] przy miejscach z id, obiekt (jak 1.1.3) przy jednym
  // miejscu bez id; odczyty nieważne albo starsze niż WEATHER_MAX_AGE_MS są pomijane; bez żadnego pole znika.
  void write(JsonDocument &document, unsigned long now) const
  {
    document.remove("weather");
    if (places.empty()) return;
    if (places.size() == 1 && places[0].id.empty()) {
      writeWeather(document, places[0].reading, now - places[0].readAt);
      return;
    }
    JsonArray list = document["weather"].to<JsonArray>();
    for (const WeatherPlace &place : places) {
      if (!place.reading.valid || now - place.readAt > WEATHER_MAX_AGE_MS) continue;
      JsonObject item = list.add<JsonObject>();
      item["id"] = place.id;
      writeReading(item, place.reading, now - place.readAt);
    }
    if (list.size() == 0) document.remove("weather");
  }

private:
  static bool parseLocation(JsonVariantConst item, WeatherLocation &out)
  {
    if (!item["lat"].is<double>() || !item["lon"].is<double>()) return false;
    const double lat = item["lat"].as<double>();
    const double lon = item["lon"].as<double>();
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return false;
    out.lat = lat;
    out.lon = lon;
    out.valid = true;
    return true;
  }

  static void writeReading(JsonObject item, const WeatherReading &reading, unsigned long ageMs)
  {
    item["temp"] = reading.temperature;
    item["code"] = reading.code;
    item["cloud"] = reading.cloudCover;
    item["precip"] = reading.precipitation;
    item["rain"] = reading.rain;
    item["snow"] = reading.snowfall;
    item["wind"] = reading.windSpeed;
    item["day"] = reading.isDay ? 1 : 0;
    item["age_s"] = ageMs / 1000UL;
  }

  std::vector<WeatherPlace> places;
  bool fetchedOnce = false;
  unsigned long lastFetchAt = 0;
};
