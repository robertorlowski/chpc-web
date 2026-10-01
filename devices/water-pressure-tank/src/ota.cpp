// Implementacja ota.hpp: ocena oferty aktualizacji z chmury.
#include <ota.hpp>

#include <cctype>

bool parseOtaOffer(JsonVariantConst settings, OtaOffer &out)
{
  JsonVariantConst firmware = settings["firmware"];
  if (!firmware.is<JsonObjectConst>()) return false;

  const std::string version = firmware["version"] | "";
  const std::string url = firmware["url"] | "";
  std::string sha256 = firmware["sha256"] | "";
  if (version.empty() || url.rfind("https://", 0) != 0 || sha256.size() != 64) return false;
  for (char &c : sha256) {
    if (!std::isxdigit(static_cast<unsigned char>(c))) return false;
    c = static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
  }
  out.version = version;
  out.url = url;
  out.sha256 = sha256;
  return true;
}

bool shouldUpdate(const OtaOffer &offer, const char *currentVersion, const std::string &lastTried)
{
  if (offer.version.empty()) return false;
  if (offer.version == currentVersion) return false;
  return offer.version != lastTried;
}
