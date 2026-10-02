// Implementacja protocol.hpp.
#include <protocol.hpp>

#include <firmware.hpp>

std::string buildStateReport(const RelayBank &bank, uint32_t nowMs)
{
  JsonDocument document;
  document["uptimeS"] = nowMs / 1000;
  JsonArray relays = document["relays"].to<JsonArray>();
  for (uint8_t index = 0; index < bank.count(); index++) {
    const Relay &relay = bank.relay(index);
    JsonObject item = relays.add<JsonObject>();
    item["on"] = relay.on;
    item["changedS"] = (nowMs - relay.changedMs) / 1000;
  }
  std::string body;
  serializeJson(document, body);
  return body;
}

bool applyStateResponse(const char *json, RelayBank &bank, uint32_t nowMs, uint32_t &changedMask)
{
  changedMask = 0;
  JsonDocument document;
  if (deserializeJson(document, json)) return false;
  JsonArrayConst relays = document["relays"].as<JsonArrayConst>();
  if (relays.isNull()) return false;
  uint8_t index = 0;
  for (JsonVariantConst command : relays) {
    if (index >= bank.count()) break;
    if (command["on"].is<bool>()) {
      const uint32_t offAfterS = command["offAfterS"] | 0U;
      const RelayMode mode = relayModeFromName(command["mode"] | "");
      if (bank.applyCloud(index, command["on"].as<bool>(), offAfterS, mode, nowMs)) changedMask |= 1UL << index;
    }
    index++;
  }
  return true;
}

std::string buildModeBody(uint8_t relayNumber, RelayMode mode, uint32_t minutes)
{
  JsonDocument document;
  document["relay"] = relayNumber;
  document["mode"] = relayModeName(mode);
  if (mode == RelayMode::Timer) document["minutes"] = minutes;
  document["source"] = "controller";
  std::string body;
  serializeJson(document, body);
  return body;
}

bool parseDefaultMinutes(JsonVariantConst settings, uint16_t &out)
{
  JsonVariantConst value = settings["default_on_minutes"];
  if (!value.is<unsigned>()) return false;
  const unsigned minutes = value.as<unsigned>();
  if (minutes > MAX_ON_MINUTES) return false;
  out = static_cast<uint16_t>(minutes);
  return true;
}
