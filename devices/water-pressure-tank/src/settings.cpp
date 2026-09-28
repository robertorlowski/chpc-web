// Implementacja settings.hpp: parsowanie i zapis ustawień, czas kompresora
// z /install, szacunek wody (wzór wspólny z serwerem i klientem).
#include <settings.hpp>

#include <cmath>
#include <cstring>

namespace {
constexpr float ATMOSPHERE_BAR = 1.013f;
}

bool parseSettings(JsonVariantConst json, Settings &out)
{
  if (!json.is<JsonObjectConst>()) return false;

  // Praca na kopii: przy błędzie out zostaje bez zmian. Brak pola w JSON
  // zostawia poprzednią wartość.
  Settings next = out;
  JsonVariantConst seconds = json["compressor_seconds"];
  if (!seconds.isNull()) {
    long value = seconds.as<long>();
    if (value < 1 || value > MAX_COMPRESSOR_SECONDS) return false;
    next.compressorSeconds = static_cast<uint16_t>(value);
  }
  if (json["pressure_low"].is<float>()) next.pressureLow = json["pressure_low"].as<float>();
  if (json["pressure_high"].is<float>()) next.pressureHigh = json["pressure_high"].as<float>();

  JsonArrayConst tanks = json["tanks"].as<JsonArrayConst>();
  if (!tanks.isNull()) {
    // lista zbiorników zastępuje poprzednią w całości; nadmiarowe są pomijane
    next.tankCount = 0;
    for (JsonObjectConst item : tanks) {
      if (next.tankCount >= MAX_TANKS) break;
      Tank tank;
      strncpy(tank.name, item["name"] | "", sizeof(tank.name) - 1);
      tank.membrane = strcmp(item["kind"] | "air", "membrane") == 0;
      tank.volumeLiters = item["volumeLiters"] | 0.0f;
      tank.enabled = item["enabled"] | true;
      tank.precharge = item["precharge"] | 0.0f;
      tank.k = item["k"] | 1.0f;
      next.tanks[next.tankCount++] = tank;
    }
  }
  out = next;
  return true;
}

bool parseSettingsText(const std::string &text, Settings &out)
{
  JsonDocument document;
  if (deserializeJson(document, text)) return false;
  return parseSettings(document.as<JsonVariantConst>(), out);
}

std::string serializeSettings(const Settings &settings)
{
  JsonDocument document;
  document["compressor_seconds"] = settings.compressorSeconds;
  document["pressure_low"] = settings.pressureLow;
  document["pressure_high"] = settings.pressureHigh;
  JsonArray tanks = document["tanks"].to<JsonArray>();
  for (uint8_t index = 0; index < settings.tankCount; index++) {
    const Tank &tank = settings.tanks[index];
    JsonObject item = tanks.add<JsonObject>();
    item["name"] = tank.name;
    item["kind"] = tank.membrane ? "membrane" : "air";
    item["volumeLiters"] = tank.volumeLiters;
    item["enabled"] = tank.enabled;
    // tylko pole właściwe dla rodzaju zbiornika, jak w chmurze
    if (tank.membrane) item["precharge"] = tank.precharge;
    else item["k"] = tank.k;
  }
  std::string text;
  serializeJson(document, text);
  return text;
}

bool applyCloudSettings(JsonVariantConst json, Settings &settings, bool keepLocalCompressorSeconds)
{
  Settings received = settings;
  if (!parseSettings(json, received)) return false;
  if (keepLocalCompressorSeconds) received.compressorSeconds = settings.compressorSeconds;
  settings = received;
  return true;
}

bool parseCompressorSecondsText(const std::string &text, uint16_t &out)
{
  // ręczne parsowanie zamiast strtol: odrzuca ułamki, znaki i spacje
  if (text.empty() || text.size() > 4) return false;
  long value = 0;
  for (char c : text) {
    if (c < '0' || c > '9') return false;
    value = value * 10 + (c - '0');
  }
  if (value < 1 || value > MAX_COMPRESSOR_SECONDS) return false;
  out = static_cast<uint16_t>(value);
  return true;
}

std::string buildCompressorSecondsBody(uint16_t seconds)
{
  JsonDocument document;
  document["compressor_seconds"] = seconds;
  std::string text;
  serializeJson(document, text);
  return text;
}

float tankWaterLiters(const Tank &tank, float pressureLow, float pressureHigh)
{
  if (!tank.enabled || !(tank.volumeLiters > 0)) return 0;
  if (!(pressureHigh > pressureLow) || pressureLow < 0) return 0;

  // Progi presostatu są z manometru, a prawo Boyle'a wymaga ciśnień bezwzględnych.
  const float lowAbs = pressureLow + ATMOSPHERE_BAR;
  const float highAbs = pressureHigh + ATMOSPHERE_BAR;
  if (!tank.membrane) {
    // poduszka: całe V wypełnione powietrzem pod ciśnieniem atmosferycznym
    // (dobijane kompresorem); k koryguje rzeczywistą ilość powietrza
    return tank.k * tank.volumeLiters * ATMOSPHERE_BAR * (1 / lowAbs - 1 / highAbs);
  }
  // przepona: ilość powietrza wyznacza ciśnienie wstępne p0; worek oddaje
  // wodę dopiero poniżej p0, stąd max(p_d, p0)
  const float prechargeAbs = tank.precharge + ATMOSPHERE_BAR;
  if (prechargeAbs >= highAbs) return 0;
  return tank.volumeLiters * prechargeAbs * (1 / std::fmax(lowAbs, prechargeAbs) - 1 / highAbs);
}

float estimatedWaterLiters(const Settings &settings)
{
  float total = 0;
  for (uint8_t index = 0; index < settings.tankCount; index++) {
    total += tankWaterLiters(settings.tanks[index], settings.pressureLow, settings.pressureHigh);
  }
  return total;
}
