#pragma once

#include <ArduinoJson.h>
#include <RTClib.h>

#include <domain_types.hpp>
#include <heat_pump_data_processor.hpp>

// Dokument telemetrii pompy wysyłany na POST /api/hp/add (CLAUDE.md,
// punkt 5, „Treść telemetrii”) i pokazywany na /telemetry.json. Pola: HP
// (JSON z CHPC bez zmian), time, ustawienia, controller_mode, COP i liczniki
// diagnostyczne. Nowe pole wymaga zmian w schemacie i typach chpc-web.
class Telemetry {
public:
  Telemetry();

  // Czas, przekaźniki i ustawienia; wołane przy każdym cyklu odczytu.
  void updateSnapshot(const DateTime &time, bool coPump, bool cwuPump,
    ControllerMode controllerMode, const DeviceSettings &settings);
  void updateSerialDiagnostics(uint32_t queueOverflow, uint32_t readTimeout,
    uint32_t receiveOverflow, uint32_t pvCrcError, uint32_t hpJsonError,
    uint32_t pvFrameError);
  void updateCloudDiagnostics(int httpStatus, uint32_t requestError,
    uint32_t webSocketDisconnect, uint32_t responseParseError);
  void updateOperationDiagnostics(uint32_t operationValidationError,
    uint32_t preferenceValidationError);
  // Nowy odczyt CHPC i pola COP (t_min/t_max w trakcie cyklu, cop* po końcu).
  void updateHeatPump(const HeatPumpDataUpdate &update);
  // Jak updateSnapshot, ale bez czasu; wołane od razu po zmianie trybu.
  void updateControllerState(bool coPump, bool cwuPump,
    ControllerMode controllerMode, const DeviceSettings &settings);

  bool heatPumpRunning() const;
  const JsonDocument &document() const;

private:
  JsonDocument data;
};
