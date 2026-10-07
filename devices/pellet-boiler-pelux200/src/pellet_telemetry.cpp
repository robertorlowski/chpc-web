// JSON odczytu pieca Pellux 200 (kontrakt: CLAUDE.md, rodzaj
// pellet-boiler-pelux200). Pomijane są pola bez wartości.
#include <pellet_telemetry.hpp>

#include <cstdio>

namespace {
const char *const TEMPERATURE_KEYS[ECOMAX_TEMPERATURE_COUNT] = {
  "heating_temp", "feeder_temp", "water_heater_temp", "outside_temp",
  "return_temp", "exhaust_temp", "optical_temp", "upper_buffer_temp",
  "lower_buffer_temp"};

void setU8(JsonDocument &document, const char *key, const EcomaxU8 &field)
{
  if (field.present) document[key] = field.value;
}

void setFloat(JsonDocument &document, const char *key, const EcomaxFloat &field)
{
  if (field.present) document[key] = field.value;
}
}

void fillPelletJson(JsonDocument &document, const EcomaxSensorData &data)
{
  document.clear();
  if (!data.valid) return;

  document["state"] = data.state;
  for (uint8_t i = 0; i < ECOMAX_TEMPERATURE_COUNT; i++)
    if (data.temperatures[i].present)
      document[TEMPERATURE_KEYS[i]] = data.temperatures[i].value;

  setU8(document, "heating_target", data.heatingTarget);
  setU8(document, "water_heater_target", data.waterHeaterTarget);
  setU8(document, "heating_status", data.heatingStatus);
  setU8(document, "water_heater_status", data.waterHeaterStatus);
  setU8(document, "fuel_level", data.fuelLevel);
  setFloat(document, "fan_power", data.fanPower);
  setU8(document, "boiler_load", data.boilerLoad);
  setFloat(document, "boiler_power", data.boilerPower);
  setFloat(document, "fuel_consumption", data.fuelConsumption);

  document["fan"] = (data.outputs & ECOMAX_OUT_FAN) != 0;
  document["feeder"] = (data.outputs & ECOMAX_OUT_FEEDER) != 0;
  document["heating_pump"] = (data.outputs & ECOMAX_OUT_HEATING_PUMP) != 0;
  document["water_heater_pump"] =
    (data.outputs & ECOMAX_OUT_WATER_HEATER_PUMP) != 0;
  document["circulation_pump"] =
    (data.outputs & ECOMAX_OUT_CIRCULATION_PUMP) != 0;
  document["lighter"] = (data.outputs & ECOMAX_OUT_LIGHTER) != 0;
  document["alarm"] = (data.outputs & ECOMAX_OUT_ALARM) != 0;
  setU8(document, "alerts_active", data.pendingAlerts);

  // Mieszacze 1 i 2 (więcej instalacja nie ma): mixer1_temp, mixer1_target, mixer1_pump,
  // mixer1_opening, mixer1_closing; niepodłączony mieszacz jest pomijany.
  for (uint8_t i = 0; i < PELLET_JSON_MIXERS; i++) {
    const EcomaxMixer &mixer = data.mixers[i];
    if (!mixer.present) continue;
    char key[24];
    snprintf(key, sizeof(key), "mixer%u_temp", i + 1);
    document[key] = mixer.temperature;
    snprintf(key, sizeof(key), "mixer%u_target", i + 1);
    document[key] = mixer.target;
    snprintf(key, sizeof(key), "mixer%u_pump", i + 1);
    document[key] = (mixer.status & ECOMAX_MIXER_PUMP) != 0;
    snprintf(key, sizeof(key), "mixer%u_opening", i + 1);
    document[key] = (mixer.status & ECOMAX_MIXER_OPENING) != 0;
    snprintf(key, sizeof(key), "mixer%u_closing", i + 1);
    document[key] = (mixer.status & ECOMAX_MIXER_CLOSING) != 0;
  }
}
