#pragma once

#include <ArduinoJson.h>
#include <RTClib.h>

#include <domain_types.hpp>

// PV reading sent to POST pv/add, separately from the heat pump telemetry:
// the installation summary plus every microinverter port.
// Ten sam dokument udostępnia strona /pv.json, a odpowiedź na zapytanie
// 0x01 do `co` na magistrali dokleja go jako "PV".
class PvTelemetry {
public:
  void update(const DateTime &time, const PV &pv);

  // False do pierwszego pełnego odczytu (dokument bez `time`).
  bool hasReading() const;
  const JsonDocument &document() const;

private:
  JsonDocument data;
};
