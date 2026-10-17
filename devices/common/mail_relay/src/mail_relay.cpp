// Zadanie przekaźnika poczty (opis w mail_relay.hpp).
#include "mail_relay.hpp"

#include <HTTPClient.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <mbedtls/platform_util.h>
#include <vector>

namespace mail_relay {
namespace {

constexpr uint32_t TASK_STACK = 16384;
constexpr uint16_t HTTP_TIMEOUT_MS = 8000;
// zwykłe pytanie o maile (chmura uważa płytkę za dostępną do 150 s po ostatnim pytaniu)
constexpr uint32_t POLL_MS = 60000;
// po sygnale „mail”: częściej, żeby przejąć mail, którego druga płytka nie wysłała (FAILOVER 20 s, dzierżawa 60 s)
constexpr uint32_t WOKEN_POLL_MS = 25000;
constexpr uint32_t WOKEN_WINDOW_MS = 90000;
constexpr uint32_t NO_WIFI_RETRY_MS = 10000;

class Guard {
public:
  explicit Guard(SemaphoreHandle_t handle) : handle(handle) { xSemaphoreTake(handle, portMAX_DELAY); }
  ~Guard() { xSemaphoreGive(handle); }

private:
  SemaphoreHandle_t handle;
};

void wipe(std::string &text)
{
  if (!text.empty()) mbedtls_platform_zeroize(&text[0], text.size());
  text.clear();
}

}  // namespace

bool MailRelay::begin(Preferences &preferences, const String &cloudUrl)
{
  apiUrl = cloudUrl;
  if (!crypto.begin(preferences)) {
    keyState = "błąd klucza";
    return false;
  }
  lock = xSemaphoreCreateMutex();
  // rdzeń 0 (Wi-Fi), pętla Arduino zostaje na rdzeniu 1
  xTaskCreatePinnedToCore(taskEntry, "mail_relay", TASK_STACK, this, 1, &task, 0);
  return task != nullptr;
}

void MailRelay::setDevice(const String &rootId, const String &serial)
{
  if (!lock) return;
  Guard guard(lock);
  deviceRootId = rootId;
  deviceSerial = serial;
}

void MailRelay::onRegisterReply(JsonVariantConst mail)
{
  if (!lock || mail.isNull()) return;
  String json;
  serializeJson(mail, json);
  {
    Guard guard(lock);
    registerMail = json;
  }
  if (task) xTaskNotifyGive(task);
}

void MailRelay::wake()
{
  if (!lock) return;
  {
    Guard guard(lock);
    woken = true;
    wokenAtMs = millis();
  }
  if (task) xTaskNotifyGive(task);
}

String MailRelay::statusText()
{
  if (!lock) return "przekaźnik poczty nieczynny (" + keyState + ")";
  Guard guard(lock);
  String text = "klucz " + crypto.fingerprint() + " – " + keyState;
  text += haveSettings ? ", dane poczty w pamięci" : ", bez danych poczty";
  text += ", wysłano " + String(sentCount) + "; ostatnio: " + lastResult;
  return text;
}

void MailRelay::setStatus(const String &text)
{
  Guard guard(lock);
  lastResult = text;
}

void MailRelay::taskEntry(void *self)
{
  static_cast<MailRelay *>(self)->run();
}

void MailRelay::forgetSettings()
{
  wipe(settings.pass);
  wipe(settings.user);
  settings.host.clear();
  haveSettings = false;
}

// Jedno zapytanie do chmury z ?rootId=&deviceId= (certyfikat chmury nie jest sprawdzany, jak w reszcie
// komunikacji sterowników; treść i tak jest zaszyfrowana kluczem płytki).
bool MailRelay::http(const char *method, const String &path, const String &body, String &response, int &status)
{
  String rootId, serial;
  {
    Guard guard(lock);
    rootId = deviceRootId;
    serial = deviceSerial;
  }
  const String url = apiUrl + path + "?rootId=" + rootId + "&deviceId=" + serial;
  WiFiClientSecure secure;
  WiFiClient plain;
  HTTPClient client;
  client.setConnectTimeout(HTTP_TIMEOUT_MS);
  client.setTimeout(HTTP_TIMEOUT_MS);
  const bool tls = url.startsWith("https://");
  if (tls) secure.setInsecure();
  if (!(tls ? client.begin(secure, url) : client.begin(plain, url))) return false;
  if (body.length() > 0) client.addHeader("Content-Type", "application/json");
  status = client.sendRequest(method, body);
  const bool ok = status >= 200 && status < 300;
  if (ok) response = client.getString();
  client.end();
  return ok;
}

// {key, fingerprint, config?{epk, iv, ct, tag}} z odpowiedzi na zgłoszenie albo z GET mail/config
void MailRelay::applyMailField(const String &json, const String &rootId)
{
  JsonDocument mail;
  if (deserializeJson(mail, json)) return;
  const String key = mail["key"] | "none";
  {
    Guard guard(lock);
    keyState = key == "approved" ? "zatwierdzony" : key == "pending" ? "czeka na zatwierdzenie w aplikacji" : "nieznany w chmurze";
  }
  if (key != "approved") {
    forgetSettings();
    return;
  }
  JsonVariantConst sealed = mail["config"];
  if (sealed.isNull()) return;
  String plain;
  if (!crypto.decrypt(sealed["epk"] | "", sealed["iv"] | "", sealed["ct"] | "", sealed["tag"] | "", "config:" + rootId, plain)) {
    setStatus("nie odszyfrowano danych poczty");
    return;
  }
  JsonDocument config;
  const bool parsed = !deserializeJson(config, plain);
  if (plain.length() > 0) mbedtls_platform_zeroize(&plain[0], plain.length());
  if (!parsed) return;
  forgetSettings();
  settings.host = config["host"] | "";
  settings.port = config["port"] | 587;
  settings.user = config["user"] | "";
  settings.pass = config["pass"] | "";
  config.clear();
  haveSettings = !settings.host.empty() && !settings.user.empty() && !settings.pass.empty();
}

// GET mail/next → SMTP → POST mail/result. True = był mail (sprawdź od razu następny).
bool MailRelay::sendNextMail(const String &rootId)
{
  String response;
  int status = 0;
  if (!http("GET", "mail/next", "", response, status)) return false;
  JsonDocument job;
  if (deserializeJson(job, response)) return false;
  const String id = job["id"] | "";
  if (id.length() == 0) return false;

  JsonVariantConst sealed = job["mail"];
  String plain;
  JsonDocument result;
  result["id"] = id;
  if (!crypto.decrypt(sealed["epk"] | "", sealed["iv"] | "", sealed["ct"] | "", sealed["tag"] | "", "mail:" + id, plain)) {
    // bez potwierdzenia chmura i tak nie przyjmie wyniku; mail wróci do kolejki po dzierżawie
    setStatus("nie odszyfrowano maila");
    return false;
  }
  JsonDocument mail;
  const bool parsed = !deserializeJson(mail, plain);
  mbedtls_platform_zeroize(&plain[0], plain.length());
  if (!parsed) return false;
  result["receipt"] = mail["receipt"] | "";

  std::vector<std::string> to;
  for (JsonVariantConst address : mail["to"].as<JsonArrayConst>()) to.emplace_back(address.as<const char *>());
  std::string raw = mail["raw"] | "";
  const std::string from = mail["from"] | "";
  mail.clear();

  std::string error;
  const uint32_t started = millis();
  const bool sent = smtpSend(settings, from, to, raw, error);
  wipe(raw);
  result["ok"] = sent;
  if (!sent) result["error"] = error.c_str();
  String body;
  serializeJson(result, body);
  String reply;
  http("POST", "mail/result", body, reply, status);

  {
    Guard guard(lock);
    if (sent) sentCount++;
    lastResult = sent ? "wysłano (" + String((millis() - started) / 1000) + " s)" : String("błąd: ") + error.c_str();
  }
  // błąd logowania: hasło mogło się zmienić w chmurze, pobierz dane od nowa przy następnym obiegu
  if (!sent && error.rfind("AUTH", 0) == 0) forgetSettings();
  return true;
}

void MailRelay::run()
{
  uint32_t waitMs = 2000;
  while (true) {
    ulTaskNotifyTake(pdTRUE, pdMS_TO_TICKS(waitMs));
    if (WiFi.status() != WL_CONNECTED) {
      waitMs = NO_WIFI_RETRY_MS;
      continue;
    }
    String rootId, pendingRegister;
    bool recentlyWoken = false;
    {
      Guard guard(lock);
      rootId = deviceRootId;
      pendingRegister = registerMail;
      registerMail = "";
      recentlyWoken = woken && millis() - wokenAtMs < WOKEN_WINDOW_MS;
      if (!recentlyWoken) woken = false;
    }
    if (rootId.length() == 0) {
      waitMs = NO_WIFI_RETRY_MS;
      continue;
    }
    if (pendingRegister.length() > 0) applyMailField(pendingRegister, rootId);
    if (!haveSettings) {
      String response;
      int status = 0;
      if (http("GET", "mail/config", "", response, status)) applyMailField(response, rootId);
    }
    if (haveSettings) {
      // kilka maili naraz (np. kod i powiadomienie administratora): po każdym od razu następny
      for (int i = 0; i < 5 && sendNextMail(rootId); i++) {}
    } else {
      // bez zatwierdzonego klucza: samo pytanie utrzymuje płytkę jako „w sieci” dla chmury
      String response;
      int status = 0;
      http("GET", "mail/next", "", response, status);
    }
    waitMs = recentlyWoken ? WOKEN_POLL_MS : POLL_MS;
  }
}

}  // namespace mail_relay
