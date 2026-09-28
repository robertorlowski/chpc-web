#pragma once

#include <ArduinoJson.h>
#include <cstddef>
#include <cstdint>
#include <string>

#include <firmware.hpp>

// Ustawienia z chmury (odpowiedź na zgłoszenie) w pamięci sterownika. Format
// JSON jak w chmurze: {compressor_seconds, pressure_low, pressure_high,
// tanks: [{name, kind: "air"|"membrane", volumeLiters, enabled, precharge, k}]}.
constexpr size_t MAX_TANKS = 4;

struct Tank {
  char name[24] = "";
  bool membrane = false;
  float volumeLiters = 0;
  bool enabled = true;
  float precharge = 0;
  float k = 1;
};

struct Settings {
  uint16_t compressorSeconds = DEFAULT_COMPRESSOR_SECONDS;
  float pressureLow = 2;
  float pressureHigh = 4;
  uint8_t tankCount = 0;
  Tank tanks[MAX_TANKS];
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
// Treść PUT /api/water-pressure/settings.
std::string buildCompressorSecondsBody(uint16_t seconds);

// Woda z jednego uruchomienia (prawo Boyle'a), ten sam wzór co estimateWater
// w server/src/services/water-pressure.service.ts. Zmieniać razem.
float tankWaterLiters(const Tank &tank, float pressureLow, float pressureHigh);
float estimatedWaterLiters(const Settings &settings);
