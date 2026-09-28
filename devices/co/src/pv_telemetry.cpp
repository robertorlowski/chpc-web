// Dokument odczytu PV dla POST /api/pv/add: konwerter PV z json_converters.hpp
// plus `time` z RTC.
#include <pv_telemetry.hpp>

#include <json_converters.hpp>

void PvTelemetry::update(const DateTime &time, const PV &pv)
{
  data.clear();
  data.set(pv);
  data["time"] = time;
}

bool PvTelemetry::hasReading() const
{
  return !data["time"].isNull();
}

const JsonDocument &PvTelemetry::document() const
{
  return data;
}
