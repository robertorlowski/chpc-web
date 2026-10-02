// Implementacja settings.hpp: parsowanie i zapis ustawień, czas kompresora z /install.
#include <settings.hpp>

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
