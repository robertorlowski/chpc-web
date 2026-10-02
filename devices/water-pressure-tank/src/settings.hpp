// Ustawienia hydroforu (odpowiedź na POST /api/devices/register, pole
// settings) i ich zapis w NVS (klucz settings, JSON). Wodę liczy serwer z czasu
// pracy pompy i odczytów wodomierza, więc sterownik zna tylko czas kompresora.
// Bez zależności od Arduino (testowane w test_logic).
#pragma once

#include <ArduinoJson.h>
#include <cstdint>
#include <string>

#include <firmware.hpp>

// Ustawienia z chmury w pamięci sterownika. Format JSON jak w chmurze:
// {compressor_seconds}; nieznane pola (np. dawne zbiorniki) są pomijane.
struct Settings {
  uint16_t compressorSeconds = DEFAULT_COMPRESSOR_SECONDS;
};

// Zwraca false dla danych bez sensu (brak obiektu, zły czas kompresora);
// wtedy out zostaje bez zmian.
bool parseSettings(JsonVariantConst json, Settings &out);
bool parseSettingsText(const std::string &text, Settings &out);
std::string serializeSettings(const Settings &settings);

// Ustawienia z chmury przy zgłoszeniu. Czas kompresora zmieniony na stronie
// sterownika i jeszcze niewysłany (keepLocalCompressorSeconds) zostaje, żeby
// starsza wartość z chmury go nie nadpisała.
bool applyCloudSettings(JsonVariantConst json, Settings &settings, bool keepLocalCompressorSeconds);

// Czas wpisany na stronie /install: same cyfry, pełne sekundy 1–MAX_COMPRESSOR_SECONDS.
bool parseCompressorSecondsText(const std::string &text, uint16_t &out);
// Treść PUT /api/water-pressure-tank/settings.
std::string buildCompressorSecondsBody(uint16_t seconds);
