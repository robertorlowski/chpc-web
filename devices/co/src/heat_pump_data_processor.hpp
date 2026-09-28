#pragma once

#include <ArduinoJson.h>

#include <cop_estimator.hpp>

// Parsuje odpowiedź CHPC na odczyt 0x01 (JSON ze StatsSerial()) i prowadzi
// szacunek COP. Dokument HP trafia bez zmian do telemetrii (pole "HP").

enum class CopDataState : uint8_t {
  UNCHANGED,
  STARTED,
  ACTIVE,
  COMPLETED,
};

struct HeatPumpDataUpdate {
  JsonDocument hp;
  CopDataState copState = CopDataState::UNCHANGED;
  double currentMiddleTemperature = 0.0;
  CopEstimate copEstimate{};
};

class HeatPumpDataProcessor {
public:
  // False, gdy ramka nie jest poprawnym JSON-em (licznik hp_json_error).
  bool processFrame(const uint8_t *data, size_t length,
    HeatPumpDataUpdate &update);

private:
  CopEstimator copEstimator;

  void updateCop(JsonObject hp, HeatPumpDataUpdate &update);
};
