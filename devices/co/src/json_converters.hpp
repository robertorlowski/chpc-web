#pragma once

#include <ArduinoJson.h>
#include <RTClib.h>

#include <domain_types.hpp>

// Konwertery ArduinoJson dla typów domenowych: pola PV i panels[] dla
// POST /api/pv/add, `time` w formacie "YYYY.MM.DD HH:MM:SS" (czas polski),
// work_mode (MANUAL/AUTO/OFF, od 1.2.0) i controller_mode (OFF/CLOUD/MANUAL). Zmiana nazwy pola tutaj
// to zmiana kontraktu z chpc-web (schemat Mongo i typy klienta).

namespace ArduinoJson {
template <>
struct Converter<PV> {
  static bool toJson(const PV &source, JsonVariant destination)
  {
    destination["total_power"] = source.total_power;
    destination["total_prod"] = source.total_prod;
    destination["total_prod_today"] = source.total_prod_today;
    destination["temperature"] = source.temperature;
    destination["pv_power"] = source.pv_power;

    JsonArray panels = destination["panels"].to<JsonArray>();
    for (uint8_t index = 0; index < source.panel_count; index++) {
      const PvPanel &reading = source.panels[index];
      JsonObject panel = panels.add<JsonObject>();
      if (panel.isNull()) return false;
      // A char array would be linked by pointer into this transient struct,
      // so the serial goes through a const char* to force ArduinoJson to copy.
      const char *serial = reading.inverter_serial;
      panel["serial"] = serial;
      panel["port"] = reading.port;
      panel["power"] = reading.power;
      panel["prod_today"] = reading.prod_today;
      panel["prod_total"] = reading.prod_total;
      panel["temperature"] = reading.temperature;
      panel["pv_voltage"] = reading.pv_voltage;
      panel["pv_current"] = reading.pv_current;
      panel["grid_voltage"] = reading.grid_voltage;
      panel["grid_frequency"] = reading.grid_frequency;
      panel["status"] = reading.status;
      panel["alarm_code"] = reading.alarm_code;
      panel["alarm_count"] = reading.alarm_count;
      panel["link"] = reading.link;
    }
    return true;
  }

  static PV fromJson(JsonVariantConst source)
  {
    PV value;
    value.total_power = source["total_power"];
    value.total_prod = source["total_prod"];
    value.total_prod_today = source["total_prod_today"];
    value.temperature = source["temperature"];
    return value;
  }

  static bool checkJson(JsonVariantConst source)
  {
    return source["total_power"].is<int64_t>()
      && source["total_prod"].is<uint64_t>()
      && source["total_prod_today"].is<uint64_t>();
  }
};

template <>
struct Converter<DateTime> {
  static bool toJson(const DateTime currentTime, JsonVariant destination)
  {
    // "2026.09.23 22:41:07" needs 20 bytes, but the compiler cannot see that
    // year() is bounded, so the buffer covers its worst case of 25.
    char formattedTime[26];
    snprintf(formattedTime, sizeof(formattedTime), "%04u.%02u.%02u %02u:%02u:%02u",
      currentTime.year(), currentTime.month(), currentTime.day(),
      currentTime.hour(), currentTime.minute(), currentTime.second());
    return destination.set(formattedTime);
  }

  static bool checkJson(JsonVariantConst)
  {
    return true;
  }
};

template <>
struct Converter<WORK_MODE> {
  static bool toJson(const WORK_MODE workMode, JsonVariant destination)
  {
    switch (workMode) {
      case MANUAL: return destination.set("MANUAL");
      case AUTO: return destination.set("AUTO");
      case OFF: return destination.set("OFF");
    }
    return destination.set("");
  }

  static bool checkJson(JsonVariantConst)
  {
    return true;
  }
};

template <>
struct Converter<ControllerMode> {
  static bool toJson(const ControllerMode mode, JsonVariant destination)
  {
    switch (mode) {
      case ControllerMode::OFF: return destination.set("OFF");
      case ControllerMode::CLOUD: return destination.set("CLOUD");
      case ControllerMode::MANUAL: return destination.set("MANUAL");
    }
    return destination.set("");
  }

  static bool checkJson(JsonVariantConst)
  {
    return true;
  }
};

template <>
struct Converter<DeviceSettings> {
  static bool toJson(const DeviceSettings &source, JsonVariant destination)
  {
    destination["work_mode"] = source.workMode;
    destination["temp_min"] = source.tempMin;
    destination["temp_max"] = source.tempMax;
    destination["pv_force"] = source.pvForce;
    destination["pv_dtu"] = source.pvDtu;
    destination["tank_liters"] = source.tankLiters;
    destination["cop_pause"] = source.copPause;
    return true;
  }

  static bool checkJson(JsonVariantConst source)
  {
    return source.is<JsonObjectConst>();
  }
};
}
