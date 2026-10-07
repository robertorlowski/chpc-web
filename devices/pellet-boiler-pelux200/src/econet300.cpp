// Implementacja econet300.hpp.
#include <econet300.hpp>

#include <cmath>
#include <cstdio>
#include <cstring>

uint8_t econetState(int mode)
{
  // tabela stanów ecoNET: docs/econet300-api/opis-api/API_V1_DOCUMENTATION.md („Complete Operation Mode Mapping”)
  switch (mode) {
    case 0: return 0;    // wyłączony
    case 1: return 6;    // zatrzymany → czuwanie (regulator włączony, nie pali; przypisanie niesprawdzone)
    case 2: return 2;    // rozpalanie
    case 3: return 3;    // praca
    case 4: return 4;    // nadzór
    case 5: return 5;    // postój
    case 7: return 7;    // wygaszanie
    case 8: return 8;    // alarm
    case 9: return 9;    // ręczny
    case 10: return 10;  // rozszczelnienie
    case 12: return 1;   // stabilizacja
    default: return 11;  // czyszczenie (6) i stany 11, 13–26: inny
  }
}

namespace {
void readFloat(JsonVariantConst value, EcomaxTemperature &out)
{
  out.present = value.is<float>() && std::isfinite(value.as<float>());
  out.value = out.present ? value.as<float>() : 0.0f;
}

void readFloat(JsonVariantConst value, EcomaxFloat &out)
{
  out.present = value.is<float>() && std::isfinite(value.as<float>());
  out.value = out.present ? value.as<float>() : 0.0f;
}

void readU8(JsonVariantConst value, EcomaxU8 &out)
{
  out.present = value.is<int>() && value.as<int>() >= 0 && value.as<int>() <= 255;
  out.value = out.present ? static_cast<uint8_t>(value.as<int>()) : 0;
}

uint32_t flagIf(JsonVariantConst value, uint32_t mask) { return value.as<bool>() ? mask : 0; }
}

bool econetToSensorData(JsonVariantConst curr, EcomaxSensorData &out)
{
  out = EcomaxSensorData();
  if (!curr.is<JsonObjectConst>() || !curr["mode"].is<int>()) return false;
  out.valid = true;
  out.state = econetState(curr["mode"].as<int>());
  // kolejność temperatur jak z magistrali: kocioł, podajnik, CWU, zewnętrzna, powrót, spaliny, optyczny,
  // bufor góra, bufor dół
  static const char *const TEMPERATURES[ECOMAX_TEMPERATURE_COUNT] = {
    "tempCO", "tempFeeder", "tempCWU", "tempExternalSensor", "tempBack", "tempFlueGas", "tempOpticalSensor",
    "tempUpperBuffer", "tempLowerBuffer"};
  for (uint8_t i = 0; i < ECOMAX_TEMPERATURE_COUNT; i++) readFloat(curr[TEMPERATURES[i]], out.temperatures[i]);
  readU8(curr["tempCOSet"], out.heatingTarget);
  readU8(curr["tempCWUSet"], out.waterHeaterTarget);
  readU8(curr["statusCO"], out.heatingStatus);
  readU8(curr["statusCWU"], out.waterHeaterStatus);
  readU8(curr["fuelLevel"], out.fuelLevel);
  readFloat(curr["fanPower"], out.fanPower);
  readU8(curr["boilerPower"], out.boilerLoad);          // ecoNET: moc w %
  readFloat(curr["boilerPowerKW"], out.boilerPower);    // moc w kW
  readFloat(curr["fuelStream"], out.fuelConsumption);   // kg/h, licznik pelletu
  readU8(curr["thermostat"], out.thermostatByte);
  // „…Works” = wyjście pracuje (bez „Works”: wyjście skonfigurowane)
  out.outputs = flagIf(curr["fanWorks"], ECOMAX_OUT_FAN) | flagIf(curr["feederWorks"], ECOMAX_OUT_FEEDER)
    | flagIf(curr["pumpCOWorks"], ECOMAX_OUT_HEATING_PUMP) | flagIf(curr["pumpCWUWorks"], ECOMAX_OUT_WATER_HEATER_PUMP)
    | flagIf(curr["pumpCirculationWorks"], ECOMAX_OUT_CIRCULATION_PUMP) | flagIf(curr["lighterWorks"], ECOMAX_OUT_LIGHTER)
    | flagIf(curr["alarmOutputWorks"], ECOMAX_OUT_ALARM);
  for (uint8_t i = 0; i < ECOMAX_MIXER_MAX; i++) {
    char key[20];
    snprintf(key, sizeof(key), "mixerTemp%u", i + 1);
    EcomaxFloat temperature;
    readFloat(curr[key], temperature);
    if (!temperature.present) continue;
    EcomaxMixer &mixer = out.mixers[i];
    mixer.present = true;
    mixer.temperature = temperature.value;
    snprintf(key, sizeof(key), "mixerSetTemp%u", i + 1);
    mixer.target = curr[key].is<int>() ? static_cast<uint8_t>(curr[key].as<int>()) : 0;
    snprintf(key, sizeof(key), "mixerPumpWorks%u", i + 1);
    mixer.status = curr[key].as<bool>() ? ECOMAX_MIXER_PUMP : 0;
  }
  return true;
}

const char *econetEditKey(uint8_t ecomaxIndex)
{
  if (ecomaxIndex == 98) return "1280";
  if (ecomaxIndex == 119) return "1281";
  return nullptr;
}

uint8_t econetSettingsHex(JsonVariantConst edits, char *hex, size_t hexSize)
{
  constexpr uint8_t COUNT = 120;
  constexpr size_t BYTES = 3 + 3 * COUNT;
  if (hexSize < BYTES * 2 + 1) return 0;
  uint8_t data[BYTES];
  memset(data, 0xFF, sizeof(data));
  data[0] = 0;
  data[1] = 0;
  data[2] = COUNT;
  uint8_t found = 0;
  static const uint8_t INDEXES[] = {98, 119};
  for (uint8_t index : INDEXES) {
    JsonVariantConst entry = edits[econetEditKey(index)];
    if (!entry["value"].is<int>() || !entry["min"].is<int>() || !entry["max"].is<int>()) continue;
    uint8_t *triple = data + 3 + 3 * index;
    triple[0] = static_cast<uint8_t>(entry["value"].as<int>());
    triple[1] = static_cast<uint8_t>(entry["min"].as<int>());
    triple[2] = static_cast<uint8_t>(entry["max"].as<int>());
    found++;
  }
  for (size_t i = 0; i < BYTES; i++) snprintf(hex + 2 * i, 3, "%02x", data[i]);
  hex[BYTES * 2] = '\0';
  return found;
}

bool econetWriteOk(JsonVariantConst reply)
{
  const char *result = reply["result"] | "";
  return strcmp(result, "OK") == 0;
}

bool JsonSecretMasker::secretKey(const char *key)
{
  static const char *const PARTS[] = {"password", "Password", "pass", "Pass", "key", "Key"};
  for (const char *part : PARTS) {
    if (strstr(key, part)) return true;
  }
  return false;
}

size_t JsonSecretMasker::feed(char c, char *out)
{
  switch (state_) {
    case State::NORMAL:
      out[0] = c;
      if (c == '"') {
        state_ = State::STRING;
        keyLength_ = 0;
        keyOverflow_ = false;
      } else if (c == ':' && lastStringSecret_) {
        state_ = State::AFTER_COLON;
      } else if (c != ' ' && c != '\t' && c != '\r' && c != '\n') {
        lastStringSecret_ = false;
      }
      return 1;
    case State::STRING:
      out[0] = c;
      if (c == '\\') {
        state_ = State::STRING_ESCAPE;
      } else if (c == '"') {
        key_[keyLength_] = '\0';
        lastStringSecret_ = !keyOverflow_ && secretKey(key_);
        state_ = State::NORMAL;
      } else if (keyLength_ + 1 < sizeof(key_)) {
        key_[keyLength_++] = c;
      } else {
        keyOverflow_ = true;
      }
      return 1;
    case State::STRING_ESCAPE:
      out[0] = c;
      state_ = State::STRING;
      return 1;
    case State::AFTER_COLON:
      if (c == ' ' || c == '\t' || c == '\r' || c == '\n') {
        out[0] = c;
        return 1;
      }
      lastStringSecret_ = false;
      if (c == '"') {
        // wartość napisowa klucza z hasłem: "MASKED" zamiast treści
        memcpy(out, "\"MASKED", 7);
        state_ = State::MASKING;
        return 7;
      }
      out[0] = c;
      state_ = State::NORMAL;
      return 1;
    case State::MASKING:
      if (c == '\\') {
        state_ = State::MASKING_ESCAPE;
        return 0;
      }
      if (c == '"') {
        out[0] = '"';
        state_ = State::NORMAL;
        return 1;
      }
      return 0;
    case State::MASKING_ESCAPE:
      state_ = State::MASKING;
      return 0;
    case State::AFTER_KEY:
      break;
  }
  out[0] = c;
  return 1;
}
