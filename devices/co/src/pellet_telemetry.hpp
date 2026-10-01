#pragma once

#include <ArduinoJson.h>
#include <ecomax_frame.hpp>

// Zamienia odczyt SensorData na JSON dla POST /api/pellet-boiler-pelux200/add.
// Tylko pola faktycznie odczytane; `time` dopisuje wołający.
void fillPelletJson(JsonDocument &document, const EcomaxSensorData &data);
