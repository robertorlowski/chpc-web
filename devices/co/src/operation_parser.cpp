// Parser operacji z chmury. Zakresy: temp_min/temp_max 1–50 (zaokrąglane do
// stopni), working_watt 0–25599, eev_max/min_pulse_open 0–255, eev_setpoint
// 0,1–8, tank_liters 20–2000. Ostateczne limity stosuje dopiero CHPC.
// Zgodność ze starszym serwerem (do 1.1.x): work_mode M / CWU / PV = MANUAL, A = AUTO; bez temp_min /
// temp_max temperatura z pary cwu_* (tryb CWU) albo co_* (pozostałe). co_pomp jest pomijane (przekaźników
// CO/CWU już nie ma).
#include <operation_parser.hpp>

#include <cctype>
#include <cmath>
#include <cstdlib>
#include <cstring>

namespace {
bool textEqualsIgnoreCase(const char *text, const char *expected)
{
  if (text == nullptr) return false;
  while (std::isspace(static_cast<unsigned char>(*text))) text++;

  while (*expected != '\0') {
    if (std::tolower(static_cast<unsigned char>(*text))
      != std::tolower(static_cast<unsigned char>(*expected))) return false;
    text++;
    expected++;
  }

  while (std::isspace(static_cast<unsigned char>(*text))) text++;
  return *text == '\0';
}

bool parseBoolean(JsonVariantConst variant, bool &result)
{
  if (variant.is<bool>()) {
    result = variant.as<bool>();
    return true;
  }

  if (variant.is<int64_t>() || variant.is<uint64_t>() || variant.is<double>()) {
    double number = variant.as<double>();
    if (number != 0.0 && number != 1.0) return false;
    result = number == 1.0;
    return true;
  }

  if (!variant.is<const char *>()) return false;
  const char *text = variant.as<const char *>();
  if (textEqualsIgnoreCase(text, "1") || textEqualsIgnoreCase(text, "true")) {
    result = true;
    return true;
  }
  if (textEqualsIgnoreCase(text, "0") || textEqualsIgnoreCase(text, "false")) {
    result = false;
    return true;
  }
  return false;
}

bool parseNumber(JsonVariantConst variant, double minimum, double maximum,
  bool roundToWhole, double &result)
{
  double value;
  if (variant.is<bool>()) {
    return false;
  } else if (variant.is<int64_t>() || variant.is<uint64_t>()
    || variant.is<double>()) {
    value = variant.as<double>();
  } else if (variant.is<const char *>()) {
    const char *text = variant.as<const char *>();
    if (text == nullptr) return false;

    char *end = nullptr;
    value = strtod(text, &end);
    if (end == text) return false;
    while (std::isspace(static_cast<unsigned char>(*end))) end++;
    if (*end != '\0') return false;
  } else {
    return false;
  }

  if (!std::isfinite(value) || value < minimum || value > maximum) return false;
  result = roundToWhole ? round(value) : value;
  return true;
}

void readBoolean(JsonObjectConst document, const char *key,
  ServerValue<bool> &target, uint16_t &invalidValues)
{
  JsonVariantConst variant = document[key];
  if (variant.isNull()) return;
  if (!parseBoolean(variant, target.value)) {
    invalidValues++;
    return;
  }
  target.present = true;
}

bool parseWorkMode(const char *text, WORK_MODE &result)
{
  if (text == nullptr) return false;
  if (strcmp(text, "MANUAL") == 0) { result = WORK_MODE::MANUAL; return true; }
  if (strcmp(text, "AUTO") == 0) { result = WORK_MODE::AUTO; return true; }
  if (strcmp(text, "OFF") == 0) { result = WORK_MODE::OFF; return true; }
  // dawny kontrakt (serwer sprzed 1.2.0)
  if (strcmp(text, "M") == 0 || strcmp(text, "CWU") == 0 || strcmp(text, "PV") == 0) {
    result = WORK_MODE::MANUAL;
    return true;
  }
  if (strcmp(text, "A") == 0) { result = WORK_MODE::AUTO; return true; }
  return false;
}

void readWorkMode(JsonObjectConst document, const char *key,
  ServerValue<WORK_MODE> &target, uint16_t &invalidValues)
{
  JsonVariantConst variant = document[key];
  if (variant.isNull()) return;
  if (!variant.is<const char *>()
    || !parseWorkMode(variant.as<const char *>(), target.value)) {
    invalidValues++;
    return;
  }
  target.present = true;
}

void readNumber(JsonObjectConst document, const char *key,
  ServerValue<double> &target, double minimum, double maximum,
  bool roundToWhole, uint16_t &invalidValues)
{
  JsonVariantConst variant = document[key];
  if (variant.isNull()) return;
  if (!parseNumber(variant, minimum, maximum, roundToWhole, target.value)) {
    invalidValues++;
    return;
  }
  target.present = true;
}
}

OperationParseResult parseServerOperation(JsonObjectConst document)
{
  OperationParseResult result;
  if (document.isNull()) return result;

  readWorkMode(document, "work_mode", result.state.workMode,
    result.invalidValues);
  readNumber(document, "temp_min", result.state.tempMin, 1, 50, true,
    result.invalidValues);
  readNumber(document, "temp_max", result.state.tempMax, 1, 50, true,
    result.invalidValues);
  // starszy serwer: para według dawnego trybu (CWU → cwu_*, inne → co_*)
  if (!result.state.tempMin.present && !result.state.tempMax.present) {
    const bool cwu = document["work_mode"].is<const char *>()
      && strcmp(document["work_mode"].as<const char *>(), "CWU") == 0;
    readNumber(document, cwu ? "cwu_min" : "co_min", result.state.tempMin, 1, 50, true,
      result.invalidValues);
    readNumber(document, cwu ? "cwu_max" : "co_max", result.state.tempMax, 1, 50, true,
      result.invalidValues);
  }
  readBoolean(document, "sump_heater", result.state.sumpHeater,
    result.invalidValues);
  readBoolean(document, "cold_pomp", result.state.coldPump,
    result.invalidValues);
  readBoolean(document, "hot_pomp", result.state.hotPump,
    result.invalidValues);
  readBoolean(document, "force", result.state.force, result.invalidValues);
  readBoolean(document, "error_reset", result.state.errorReset,
    result.invalidValues);
  readBoolean(document, "restart", result.state.restart, result.invalidValues);
  readBoolean(document, "pv_force", result.state.pvForce, result.invalidValues);
  readBoolean(document, "pv_dtu", result.state.pvDtu, result.invalidValues);
  readBoolean(document, "cop_pause", result.state.copPause, result.invalidValues);
  readNumber(document, "tank_liters", result.state.tankLiters, 20, 2000, true,
    result.invalidValues);
  readNumber(document, "working_watt", result.state.workingWatt, 0, 25599,
    true, result.invalidValues);
  readNumber(document, "eev_max_pulse_open", result.state.eevMaxPulseOpen,
    0, 255, true, result.invalidValues);
  readNumber(document, "eev_min_pulse_open", result.state.eevMinPulseOpen,
    0, 255, true, result.invalidValues);
  // Przegrzanie EEV 0,1–8 °C: CHPC zapisuje je w EEPROM bez sprawdzania (0 = ciecz do sprężarki),
  // z panelu nie zejdzie poniżej 0,1, a po restarcie wartość powyżej 8 zamienia na domyślną.
  readNumber(document, "eev_setpoint", result.state.eevSetpoint, 0.1, 8.0,
    false, result.invalidValues);

  return result;
}
