#pragma once

#include <ArduinoJson.h>
#include <ecomax_frame.hpp>

// Ile mieszaczy trafia do JSON (kontrakt z serwerem: mixer1_*, mixer2_*).
constexpr uint8_t PELLET_JSON_MIXERS = 2;

// Zamienia odczyt SensorData na JSON dla POST /api/pellet-boiler-pelux200/add.
// Tylko pola faktycznie odczytane; `time` dopisuje wołający.
void fillPelletJson(JsonDocument &document, const EcomaxSensorData &data);
