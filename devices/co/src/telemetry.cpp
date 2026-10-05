// Budowa dokumentu telemetrii pompy (POST /api/hp/add). Klucze są kontraktem
// z chpc-web; liczniki diagnostyczne serwer odbiera, ale nie zapisuje w bazie.
// Od 1.2.0: work_mode MANUAL / AUTO / OFF, temp_min / temp_max zamiast par co_* i cwu_*,
// bez co_pomp i cwu_pomp (przekaźniki usunięte), COP na bieżąco w trakcie pracy.
#include <telemetry.hpp>

#include <cmath>

#include <json_converters.hpp>

Telemetry::Telemetry()
{
  data["HP"].to<JsonObject>();
}

// PV is not part of it: PvTelemetry goes to pv/add on its own schedule.
void Telemetry::updateSnapshot(const DateTime &time,
  ControllerMode controllerMode, const DeviceSettings &settings)
{
  data["time"] = time;
  updateControllerState(controllerMode, settings);
}

void Telemetry::updateSerialDiagnostics(uint32_t queueOverflow,
  uint32_t readTimeout, uint32_t receiveOverflow, uint32_t pvCrcError,
  uint32_t hpJsonError, uint32_t pvFrameError)
{
  data["serial_queue_overflow"] = queueOverflow;
  data["serial_read_timeout"] = readTimeout;
  data["serial_receive_overflow"] = receiveOverflow;
  data["pv_crc_error"] = pvCrcError;
  data["hp_json_error"] = hpJsonError;
  data["pv_frame_error"] = pvFrameError;
}

void Telemetry::updateCloudDiagnostics(int httpStatus, uint32_t requestError,
  uint32_t webSocketDisconnect, uint32_t responseParseError)
{
  data["cloud_http_status"] = httpStatus;
  data["cloud_request_error"] = requestError;
  data["websocket_disconnect"] = webSocketDisconnect;
  data["cloud_response_parse_error"] = responseParseError;
}

void Telemetry::updateOperationDiagnostics(
  uint32_t operationValidationError, uint32_t preferenceValidationError)
{
  data["operation_validation_error"] = operationValidationError;
  data["preference_validation_error"] = preferenceValidationError;
}

// Pola COP z wyniku; bez wyniku (np. pracowała pompa CO kotła) są usuwane.
void Telemetry::writeCop(const CopEstimate &estimate)
{
  if (!estimate.valid) {
    data.remove("cop");
    data.remove("cop_min");
    data.remove("cop_max");
    return;
  }
  data["cop_min"] = std::round(estimate.minimum * 100.0) / 100.0;
  data["cop_max"] = std::round(estimate.maximum * 100.0) / 100.0;
  data["cop"] = std::round(estimate.estimated * 100.0) / 100.0;
}

void Telemetry::updateHeatPump(const HeatPumpDataUpdate &update)
{
  data["HP"] = update.hp;

  switch (update.copState) {
    case CopDataState::STARTED:
      data["t_min"] = update.currentMiddleTemperature;
      data["t_max"] = update.currentMiddleTemperature;
      data.remove("cop");
      data.remove("cop_min");
      data.remove("cop_max");
      data.remove("cop_bottom_start");
      break;

    // w trakcie pracy: t_min = najniższa temperatura środka w cyklu, COP bieżący
    case CopDataState::ACTIVE:
      data["t_min"] = update.copEstimate.startMiddleTemperature;
      data["t_max"] = update.currentMiddleTemperature;
      writeCop(update.copEstimate);
      break;

    case CopDataState::COMPLETED: {
      const CopEstimate &estimate = update.copEstimate;
      data["t_min"] = estimate.startMiddleTemperature;
      data["t_max"] = estimate.endMiddleTemperature;
      data["cop_bottom_start"] = estimate.startBottomTemperature;
      writeCop(estimate);
      break;
    }

    case CopDataState::UNCHANGED:
      break;
  }
}

void Telemetry::updateControllerState(
  ControllerMode controllerMode, const DeviceSettings &settings)
{
  data["controller_mode"] = controllerMode;
  data["work_mode"] = settings.workMode;
  data["temp_min"] = settings.tempMin;
  data["temp_max"] = settings.tempMax;
}

bool Telemetry::heatPumpRunning() const
{
  return data["HP"]["HPS"].as<int>() > 0;
}

const JsonDocument &Telemetry::document() const
{
  return data;
}
