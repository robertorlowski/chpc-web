#pragma once

#include <ArduinoJson.h>
#include <operation_types.hpp>

// Jedyne miejsce zamiany JSON `operation` na ServerOperationState. Wartości
// przychodzą jako napisy ("1", "45"); poza zakresem są pomijane i liczone
// w invalidValues (telemetria operation_validation_error).
struct OperationParseResult {
  ServerOperationState state;
  uint16_t invalidValues = 0;
};

OperationParseResult parseServerOperation(JsonObjectConst document);
