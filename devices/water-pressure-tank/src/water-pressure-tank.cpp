// Sterownik hydroforu (typ water-pressure-tank), ESP32-C3 SuperMini.
// Sterownik ma zasilanie tylko w czasie pracy pompy: po starcie raz włącza
// kompresor na ustawiony czas, a dopóki jest sieć, co 1 s wysyła stan
// uruchomienia do chmury. Opis: docs/water-pressure-tank.md.
// Kontrakt z chmurą: POST devices/register (zgłoszenie, rootId + settings),
// POST water-pressure-tank/add (co 1 s), PUT water-pressure-tank/settings
// (czas kompresora z /install). Aktualizacja przez sieć (OTA): oferta w
// settings.firmware odpowiedzi na zgłoszenie, ota.hpp i downloadFirmware().
// NVS: przestrzeń „wp”, klucze niżej i w run_report.hpp.
#include <Arduino.h>
#include <HTTPClient.h>
#include <Preferences.h>
#include <WebServer.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <Update.h>
#include <esp_mac.h>
#include <mbedtls/sha256.h>

#include <compressor.hpp>
#include <firmware.hpp>
#include <ota.hpp>
#include <run_report.hpp>
#include <secrets.h>
#include <settings.hpp>

namespace {

constexpr const char *PREFERENCES_NAMESPACE = "wp";
constexpr const char *KEY_WIFI_SSID = "wifi_ssid";
constexpr const char *KEY_WIFI_PASSWORD = "wifi_pass";
// adres chmury zapisany przez dawną stronę /install; usuwany przy starcie
constexpr const char *KEY_OLD_CLOUD_URL = "cloud_url";
constexpr const char *KEY_ROOT_ID = "root_id";
constexpr const char *KEY_SETTINGS = "settings";
// numer następnego uruchomienia (runId)
constexpr const char *KEY_NEXT_RUN = "run_next";
// czas kompresora zmieniony na /install, jeszcze niewysłany do chmury
constexpr const char *KEY_COMPRESSOR_PENDING = "comp_pending";

// wersja, po której pobraniu sterownik ostatnio się zrestartował (ochrona przed pętlą OTA)
constexpr const char *KEY_OTA_TRIED = "ota_tried";

constexpr uint32_t TICK_MS = 1000;
constexpr uint32_t REGISTER_RETRY_MS = 10000;
constexpr uint32_t COMPRESSOR_SEND_RETRY_MS = 10000;
constexpr uint16_t HTTP_TIMEOUT_MS = 2000;
constexpr uint16_t OTA_TIMEOUT_MS = 15000;
constexpr int HTTP_CONFLICT = 409;

const IPAddress AP_ADDRESS(10, 11, 16, 1);

Preferences preferences;
WebServer server(80);
WiFiClientSecure secureClient;
WiFiClient plainClient;
HTTPClient http;

Compressor compressor;
Settings settings;
RunQueue queue;
RunRecord currentRun;

String wifiSsid;
String wifiPassword;
const String cloudUrl = CLOUD_URL;
String rootId;
String serial;

bool accessPointOn = false;
bool registeredThisBoot = false;
uint32_t lastRegisterAttemptMs = 0;
uint32_t lastTickMs = 0;
int lastHttpStatus = 0;
uint32_t lastDeliveredMs = 0;
bool compressorPending = false;
uint32_t lastCompressorSendMs = 0;

OtaOffer otaOffer;
bool otaOfferReceived = false;
// jedna próba na uruchomienie; nieudane pobranie ponowi się przy następnym
bool otaAttempted = false;
String otaStatus;
bool uploadAccepted = false;
bool uploadFinished = false;

// Blob w NVS dla kolejki i bieżącego uruchomienia. Blob o innym rozmiarze
// (np. po zmianie struktury w nowej wersji) jest traktowany jak brak klucza.
class NvsStore : public BlobStore {
public:
  size_t read(const char *key, void *data, size_t size) override
  {
    if (preferences.getBytesLength(key) != size) return 0;
    return preferences.getBytes(key, data, size);
  }

  bool write(const char *key, const void *data, size_t size) override
  {
    return preferences.putBytes(key, data, size) == size;
  }
} store;

void writeRelay(bool on)
{
  digitalWrite(RELAY_PIN, on == RELAY_ACTIVE_HIGH ? HIGH : LOW);
}

// SN = fabryczny MAC z eFuse (12 znaków hex), deviceId w chmurze.
String readSerial()
{
  uint8_t mac[6] = {};
  if (esp_efuse_mac_get_default(mac) != ESP_OK) return "";
  char text[13];
  snprintf(text, sizeof(text), "%02X%02X%02X%02X%02X%02X", mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
  return text;
}

String storedOrDefault(const char *key, const char *fallback)
{
  String value = preferences.getString(key, "");
  return value.length() > 0 ? value : String(fallback);
}

void loadConfig()
{
  wifiSsid = storedOrDefault(KEY_WIFI_SSID, WIFI_SSID);
  wifiPassword = storedOrDefault(KEY_WIFI_PASSWORD, WIFI_PASSWORD);
  if (preferences.isKey(KEY_OLD_CLOUD_URL)) preferences.remove(KEY_OLD_CLOUD_URL);
  rootId = preferences.getString(KEY_ROOT_ID, "");
  // Przed pierwszym zgłoszeniem brak zapisu: zostają wartości domyślne z
  // settings.hpp (30 s, 2/4 bar, bez zbiorników, więc szacunek wody 0).
  parseSettingsText(preferences.getString(KEY_SETTINGS, "").c_str(), settings);
  compressorPending = preferences.getBool(KEY_COMPRESSOR_PENDING, false);
}

// --- chmura ---

String requestUrl(const char *path)
{
  String url = cloudUrl + path + "?deviceId=" + serial;
  if (rootId.length() > 0) url += "&rootId=" + rootId;
  return url;
}

// Jedno zapytanie HTTP(S) z limitem 2 s. Nie ponawia: wysyłka co 1 s i tak
// przychodzi za sekundę. lastHttpStatus < 0 oznacza błąd połączenia.
bool send(const char *method, const String &url, const String &body, String *response = nullptr)
{
  if (WiFi.status() != WL_CONNECTED) return false;
  const bool secure = url.startsWith("https://");
  // certyfikat nie jest sprawdzany (jak w sterowniku co)
  if (secure) secureClient.setInsecure();
  // keep-alive: kolejne zapytania co 1 s idą tym samym połączeniem TLS
  http.setReuse(true);
  http.setConnectTimeout(HTTP_TIMEOUT_MS);
  http.setTimeout(HTTP_TIMEOUT_MS);
  if (!(secure ? http.begin(secureClient, url) : http.begin(plainClient, url))) return false;
  http.addHeader("Content-Type", "application/json");
  lastHttpStatus = http.sendRequest(method, body);
  const bool ok = lastHttpStatus >= 200 && lastHttpStatus < 300;
  if (ok && response) *response = http.getString();
  http.end();
  return ok;
}

bool post(const String &url, const String &body, String *response = nullptr)
{
  return send("POST", url, body, response);
}

void forgetRootIdOnConflict()
{
  if (lastHttpStatus != HTTP_CONFLICT) return;
  // rootId należy do innego urządzenia (np. po wyczyszczeniu bazy)
  // następny tick() zgłosi sterownik ponownie i dostanie właściwy rootId
  rootId = "";
  preferences.remove(KEY_ROOT_ID);
  registeredThisBoot = false;
}

// Zgłoszenie przy każdym starcie: rootId, ustawienia. Nazwa trafia tylko do
// nowego urządzenia (serwer nie nadpisuje nazwy nadanej przez użytkownika).
void registerDevice()
{
  lastRegisterAttemptMs = millis();
  JsonDocument request;
  request["deviceId"] = serial;
  request["deviceType"] = DEVICE_TYPE;
  request["name"] = DEVICE_NAME;
  request["version"] = FW_VERSION;
  String body;
  serializeJson(request, body);

  String response;
  if (!post(cloudUrl + "devices/register", body, &response)) return;

  JsonDocument reply;
  if (deserializeJson(reply, response)) return;
  String id = reply["rootId"] | "";
  if (id.length() == 0) return;
  if (id != rootId) {
    rootId = id;
    preferences.putString(KEY_ROOT_ID, rootId);
  }
  // Nowy czas kompresora działa od następnego włączenia. Czas ustawiony na
  // /install i jeszcze niewysłany ma pierwszeństwo przed wartością z chmury.
  if (applyCloudSettings(reply["settings"], settings, compressorPending)) {
    preferences.putString(KEY_SETTINGS, serializeSettings(settings).c_str());
    compressor.setSeconds(settings.compressorSeconds);
  }
  otaOfferReceived = parseOtaOffer(reply["settings"], otaOffer);
  registeredThisBoot = true;
}

// Czas kompresora ustawiony na /install trafia do chmury; po błędzie
// sterownik ponawia co 10 s, a po utracie zasilania przy następnym starcie.
void sendCompressorSeconds(uint32_t nowMs)
{
  lastCompressorSendMs = nowMs;
  const bool ok = send("PUT", requestUrl("water-pressure-tank/settings"),
    buildCompressorSecondsBody(settings.compressorSeconds).c_str());
  forgetRootIdOnConflict();
  // 400: chmura nie przyjmie tej wartości, ponawianie nic nie da
  if (ok || lastHttpStatus == 400) {
    compressorPending = false;
    preferences.remove(KEY_COMPRESSOR_PENDING);
  }
}

bool sendRun(const RunRecord &run, bool queued)
{
  const bool ok = post(requestUrl("water-pressure-tank/add"), buildRunReport(run, queued).c_str());
  forgetRootIdOnConflict();
  return ok;
}

// Pobiera obraz z oferty prosto do nieaktywnej partycji OTA, licząc SHA-256
// w locie. Obraz jest aktywowany dopiero po zgodnej sumie, więc przerwanie
// pobierania albo zasilania nie psuje działającego firmware. Blokuje pętlę
// (kilkanaście sekund), dlatego wołane tylko przy wyłączonym kompresorze.
bool downloadFirmware(const OtaOffer &offer)
{
  secureClient.stop();  // zwalnia pamięć połączenia keep-alive na czas drugiego TLS
  WiFiClientSecure client;
  client.setInsecure();  // integralność daje SHA-256 z odpowiedzi chmury
  HTTPClient download;
  // GitHub Releases przekierowuje na inną domenę
  download.setFollowRedirects(HTTPC_FORCE_FOLLOW_REDIRECTS);
  download.setConnectTimeout(OTA_TIMEOUT_MS);
  download.setTimeout(OTA_TIMEOUT_MS);
  if (!download.begin(client, offer.url.c_str())) return false;
  const int status = download.GET();
  const int total = download.getSize();
  if (status != 200 || total <= 0 || !Update.begin(total)) {
    otaStatus = "pobieranie nie powiodło się (HTTP " + String(status) + ")";
    download.end();
    return false;
  }

  mbedtls_sha256_context sha;
  mbedtls_sha256_init(&sha);
  mbedtls_sha256_starts(&sha, 0);
  WiFiClient *stream = download.getStreamPtr();
  uint8_t buffer[1024];
  int remaining = total;
  uint32_t lastDataMs = millis();
  bool ok = true;
  while (remaining > 0) {
    const size_t available = stream->available();
    if (available == 0) {
      if (!download.connected() || millis() - lastDataMs > OTA_TIMEOUT_MS) { ok = false; break; }
      delay(1);
      continue;
    }
    const size_t count = stream->readBytes(buffer, min(min(available, sizeof(buffer)), static_cast<size_t>(remaining)));
    mbedtls_sha256_update(&sha, buffer, count);
    if (Update.write(buffer, count) != count) { ok = false; break; }
    remaining -= count;
    lastDataMs = millis();
  }
  download.end();

  uint8_t digest[32];
  mbedtls_sha256_finish(&sha, digest);
  mbedtls_sha256_free(&sha);
  char hex[65];
  for (int index = 0; index < 32; index++) snprintf(hex + index * 2, 3, "%02x", digest[index]);

  if (!ok || remaining != 0) {
    Update.abort();
    otaStatus = "przerwane pobieranie";
    return false;
  }
  if (offer.sha256 != hex) {
    Update.abort();
    otaStatus = "suma SHA-256 niezgodna";
    return false;
  }
  if (!Update.end(true)) {
    otaStatus = "obraz odrzucony";
    return false;
  }
  return true;
}

// Aktualizacja przez sieć po udanym zgłoszeniu i wysłaniu uruchomienia, przy
// wyłączonym kompresorze (pętla jest wtedy zablokowana i nie pilnowałaby
// przekaźnika). Po zapisie obrazu restart; kompresor włączy się jak przy
// każdym starcie. Wersję zapisujemy dopiero po zapisie obrazu: gdy po restarcie
// FW_VERSION nadal nie zgadza się z ofertą, kolejna próba jest pomijana.
void tryFirmwareUpdate()
{
  otaAttempted = true;
  if (!otaOfferReceived) return;
  const String tried = preferences.getString(KEY_OTA_TRIED, "");
  if (!shouldUpdate(otaOffer, FW_VERSION, tried.c_str())) return;
  writeRelay(false);
  otaStatus = "pobieranie wersji " + String(otaOffer.version.c_str());
  if (!downloadFirmware(otaOffer)) return;
  preferences.putString(KEY_OTA_TRIED, otaOffer.version.c_str());
  delay(100);
  ESP.restart();
}

// Bieżące uruchomienie w NVS co 1 s: gdy zasilanie zniknie bez sieci, przy
// następnym starcie trafi do kolejki (queuePreviousRun). pumpRunS liczy się od
// startu sterownika, czyli od podania zasilania pompie.
void updateCurrentRun(uint32_t nowMs)
{
  currentRun.pumpRunS = nowMs / 1000;
  currentRun.compressorStartS = compressor.firstStartS();
  currentRun.compressorEndS = compressor.lastEndS();
  currentRun.restarts = compressor.restarts();
  store.write(KEY_CURRENT_RUN, &currentRun, sizeof(currentRun));
}

// Wywoływane co 1 s z loop(). Kolejność: zapis w NVS, czas kompresora do
// chmury, zgłoszenie (ponawiane co 10 s), wysyłka bieżącego uruchomienia,
// jedno uruchomienie z kolejki. Bez zgłoszenia nic nie jest wysyłane.
void tick(uint32_t nowMs)
{
  updateCurrentRun(nowMs);
  if (WiFi.status() != WL_CONNECTED) return;

  // przed zgłoszeniem, żeby odpowiedź na nie niosła już nowy czas
  if (compressorPending
    && (lastCompressorSendMs == 0 || nowMs - lastCompressorSendMs >= COMPRESSOR_SEND_RETRY_MS)) {
    sendCompressorSeconds(nowMs);
  }

  if (!registeredThisBoot) {
    if (lastRegisterAttemptMs == 0 || nowMs - lastRegisterAttemptMs >= REGISTER_RETRY_MS) registerDevice();
    if (!registeredThisBoot) return;
  }

  if (sendRun(currentRun, false)) {
    lastDeliveredMs = nowMs;
    // Pierwsza doręczona wiadomość: od teraz serwer zna uruchomienie, więc po
    // utracie zasilania nie trafi ono do kolejki.
    if (!currentRun.delivered) {
      currentRun.delivered = true;
      store.write(KEY_CURRENT_RUN, &currentRun, sizeof(currentRun));
    }
  }

  // jedno uruchomienie z kolejki na sekundę, żeby nie blokować pętli
  if (!queue.empty() && sendRun(queue.front(), true)) {
    queue.pop();
    queue.save(store);
  }

  if (!otaAttempted && currentRun.delivered && queue.empty() && !compressor.running()) tryFirmwareUpdate();
}

// --- strony WWW ---

String htmlEscape(const String &text)
{
  String out;
  out.reserve(text.length());
  for (char c : text) {
    if (c == '<') out += "&lt;";
    else if (c == '>') out += "&gt;";
    else if (c == '&') out += "&amp;";
    else if (c == '"') out += "&quot;";
    else out += c;
  }
  return out;
}

const char PAGE_HEAD[] PROGMEM = R"html(<!doctype html><html lang="pl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Hydrofor</title>
<style>body{font-family:sans-serif;margin:0 auto;max-width:28rem;padding:1rem;color:#222}
.card{background:#f1f1f1;border-radius:.5rem;padding:.75rem 1rem;margin-bottom:1rem}
.state{font-size:1.6rem;font-weight:700}.on{color:#1481a5}.off{color:#888}
button{background:#1481a5;color:#fff;border:0;border-radius:6px;padding:.6rem 1rem;font-size:1rem}
label{display:block;margin:.4rem 0}input{width:100%;box-sizing:border-box;padding:.3rem}
small{color:#555}ul{margin:.3rem 0;padding-left:1.2rem}li span{float:right}
h2{margin:0 0 .5rem;padding-bottom:.3rem;border-bottom:2px solid #1481a5;color:#1481a5;font-size:1.25rem}
.card p{text-align:right}</style></head><body>)html";

const char MAIN_PAGE[] PROGMEM = R"html(<h1>Hydrofor</h1>
<div class="card"><h2>Kompresor</h2><div id="state" class="state">---</div>
<div>Do wyłączenia: <b id="remaining">---</b> s</div>
<div>Czas pracy kompresora: <b id="seconds">---</b> s</div>
<div>Pompa pracuje: <b id="pump">---</b> s</div>
<p><button onclick="restart()">Uruchom kompresor ponownie</button></p></div>
<div class="card"><h2>Zbiorniki</h2><ul id="tanks"></ul>
<div>Ilość wody: <b id="water">---</b> l</div></div>
<div class="card"><small id="cloud">---</small></div>
<p><a href="/install">Instalacja</a></p>
<script>
function tank(t){return '<li>'+(t.name||'Zbiornik')+' ('+t.volumeLiters+' l'+(t.enabled?'':', wyłączony')+')<span>'+t.liters.toFixed(1)+' l</span></li>'}
function load(){fetch('/state.json',{cache:'no-store'}).then(r=>r.json()).then(s=>{
var e=document.getElementById('state');e.textContent=s.running?'WŁĄCZONY':'WYŁĄCZONY';e.className='state '+(s.running?'on':'off');
remaining.textContent=s.remainingS;seconds.textContent=s.compressorSeconds;pump.textContent=s.pumpRunS;
water.textContent=s.waterLiters.toFixed(1);tanks.innerHTML=s.tanks.map(tank).join('');
cloud.textContent='Wi-Fi: '+(s.wifi?'połączone':'brak')+', chmura: '+(s.registered?'zgłoszony':'niezgłoszony')
+(s.lastStatus?' (HTTP '+s.lastStatus+')':'')+', w kolejce: '+s.queued})}
function restart(){fetch('/restart',{method:'POST'}).then(load)}
load();setInterval(load,1000);
</script></body></html>)html";

void handleRoot()
{
  String page = FPSTR(PAGE_HEAD);
  page += FPSTR(MAIN_PAGE);
  server.sendHeader("Cache-Control", "no-store");
  server.send(200, "text/html; charset=utf-8", page);
}

// JSON dla strony / (odpytywany co 1 s); tylko lokalnie, nie trafia do chmury.
void handleState()
{
  const uint32_t now = millis();
  JsonDocument state;
  state["running"] = compressor.running();
  state["remainingS"] = (compressor.remainingMs(now) + 999) / 1000;
  state["compressorSeconds"] = settings.compressorSeconds;
  state["pumpRunS"] = now / 1000;
  state["restarts"] = compressor.restarts();
  state["waterLiters"] = estimatedWaterLiters(settings);
  JsonArray tanks = state["tanks"].to<JsonArray>();
  for (uint8_t index = 0; index < settings.tankCount; index++) {
    const Tank &tank = settings.tanks[index];
    JsonObject item = tanks.add<JsonObject>();
    item["name"] = tank.name;
    item["volumeLiters"] = tank.volumeLiters;
    item["enabled"] = tank.enabled;
    item["liters"] = tankWaterLiters(tank, settings.pressureLow, settings.pressureHigh);
  }
  state["wifi"] = WiFi.status() == WL_CONNECTED;
  state["registered"] = registeredThisBoot;
  state["lastStatus"] = lastHttpStatus;
  state["queued"] = queue.size();
  String body;
  serializeJson(state, body);
  server.sendHeader("Cache-Control", "no-store");
  server.send(200, "application/json", body);
}

// „Uruchom kompresor ponownie”: pełny ustawiony czas od teraz, także gdy
// kompresor jeszcze pracuje (licznik restarts rośnie).
void handleRestart()
{
  compressor.restart(millis());
  writeRelay(compressor.running());
  server.send(200, "application/json", "{}");
}

bool authorized()
{
  if (server.authenticate(INSTALL_USER, INSTALL_PASSWORD)) return true;
  server.requestAuthentication();
  return false;
}

// /install (Basic Auth, login z secrets.h): GET strona, POST zapis Wi-Fi.
void handleInstall()
{
  if (!authorized()) return;

  if (server.method() == HTTP_POST) {
    const String ssid = server.arg("ssid");
    const String password = server.arg("password");
    if (ssid.length() > 0) {
      wifiSsid = ssid;
      preferences.putString(KEY_WIFI_SSID, ssid);
      // puste pole hasła zostawia zapisane, żeby strona nie odsyłała go jawnym HTTP
      if (password.length() > 0) {
        wifiPassword = password;
        preferences.putString(KEY_WIFI_PASSWORD, password);
      }
    }
    // Nowa sieć od razu, bez restartu: restart ponownie włączyłby kompresor.
    WiFi.disconnect();
    if (wifiSsid.length() > 0) WiFi.begin(wifiSsid.c_str(), wifiPassword.c_str());
    server.sendHeader("Location", "/install", true);
    server.send(303, "text/plain", "");
    return;
  }

  String page = FPSTR(PAGE_HEAD);
  page += "<h1>Instalacja</h1><form method=\"post\" class=\"card\"><h2>Wi-Fi</h2>";
  page += "<label>Sieć Wi-Fi (SSID)<input name=\"ssid\" value=\"" + htmlEscape(wifiSsid) + "\"></label>";
  page += "<label>Hasło Wi-Fi <small>(puste = bez zmian)</small><input name=\"password\" type=\"password\"></label>";
  page += "<p><button type=\"submit\">Zapisz</button></p></form>";
  // osobny formularz: zapis czasu nie łączy ponownie z Wi-Fi
  page += "<form method=\"post\" action=\"/install/compressor\" class=\"card\"><h2>Kompresor</h2>";
  page += "<label>Czas pracy kompresora [s] <small>(1–" + String(MAX_COMPRESSOR_SECONDS) + ")</small>";
  page += "<input name=\"seconds\" type=\"number\" min=\"1\" max=\"" + String(MAX_COMPRESSOR_SECONDS)
    + "\" step=\"1\" required value=\"" + String(settings.compressorSeconds) + "\"></label>";
  if (server.arg("compressor") == "bad") {
    page += "<div><b>Nieprawidłowy czas: podaj pełne sekundy 1–" + String(MAX_COMPRESSOR_SECONDS) + ".</b></div>";
  }
  page += "<div><small>Chmura: ";
  page += compressorPending ? "czeka na wysyłkę" : "aktualna";
  page += "</small></div><p><button type=\"submit\">Zapisz czas</button></p></form>";
  // ręczne wgranie obrazu (awaryjnie, gdy OTA z chmury nie działa)
  page += "<form method=\"post\" action=\"/install/firmware\" enctype=\"multipart/form-data\" class=\"card\"><h2>Firmware</h2>";
  page += "<div>Wersja: <b>" + String(FW_VERSION) + "</b></div>";
  if (otaStatus.length() > 0) page += "<div><small>Aktualizacja z chmury: " + htmlEscape(otaStatus) + "</small></div>";
  page += "<label>Plik firmware.bin<input name=\"firmware\" type=\"file\" accept=\".bin\" required></label>";
  page += "<div><small>Działa tylko przy wyłączonym kompresorze. Po wgraniu sterownik się restartuje.</small></div>";
  page += "<p><button type=\"submit\">Wgraj</button></p></form>";
  page += "<div class=\"card\"><div>SN: <b>" + serial + "</b></div>";
  page += "<div>Root ID: <b>" + (rootId.length() ? htmlEscape(rootId) : String("---")) + "</b></div>";
  page += "<div>Wi-Fi: " + String(WiFi.status() == WL_CONNECTED ? WiFi.localIP().toString() : String("brak połączenia")) + "</div>";
  page += "<div>Zgłoszenie w chmurze: " + String(registeredThisBoot ? "tak" : "nie") + "</div>";
  page += "<div>Ostatnia wysyłka: " + String(lastDeliveredMs ? String((millis() - lastDeliveredMs) / 1000) + " s temu" : String("---"));
  page += lastHttpStatus ? " (HTTP " + String(lastHttpStatus) + ")" : String("");
  page += "</div></div><p><a href=\"/\">Strona główna</a></p></body></html>";
  server.sendHeader("Cache-Control", "no-store");
  server.send(200, "text/html; charset=utf-8", page);
}

// Czas kompresora ze strony /install: zapis w NVS od razu, do chmury w tick().
void handleCompressorSeconds()
{
  if (!authorized()) return;

  uint16_t seconds = 0;
  if (!parseCompressorSecondsText(server.arg("seconds").c_str(), seconds)) {
    server.sendHeader("Location", "/install?compressor=bad", true);
    server.send(303, "text/plain", "");
    return;
  }
  // lastCompressorSendMs = 0: tick() wyśle nowy czas od razu, bez czekania 10 s
  if (seconds != settings.compressorSeconds || compressorPending) {
    settings.compressorSeconds = seconds;
    preferences.putString(KEY_SETTINGS, serializeSettings(settings).c_str());
    compressor.setSeconds(seconds);
    compressorPending = true;
    preferences.putBool(KEY_COMPRESSOR_PENDING, true);
    lastCompressorSendMs = 0;
  }
  server.sendHeader("Location", "/install", true);
  server.send(303, "text/plain", "");
}

// Ręczne wgranie firmware.bin: UPLOAD_* wołane w trakcie odbioru pliku, potem
// handleFirmwareDone. Przy pracującym kompresorze plik jest odrzucany, bo
// odbiór blokuje pętlę i przekaźnik nie zostałby wyłączony w terminie.
void handleFirmwareUpload()
{
  HTTPUpload &upload = server.upload();
  switch (upload.status) {
  case UPLOAD_FILE_START:
    uploadFinished = false;
    uploadAccepted = server.authenticate(INSTALL_USER, INSTALL_PASSWORD) && !compressor.running()
      && Update.begin(UPDATE_SIZE_UNKNOWN);
    break;
  case UPLOAD_FILE_WRITE:
    if (uploadAccepted && Update.write(upload.buf, upload.currentSize) != upload.currentSize) {
      Update.abort();
      uploadAccepted = false;
    }
    break;
  case UPLOAD_FILE_END:
    if (uploadAccepted) uploadFinished = Update.end(true);
    uploadAccepted = false;
    break;
  default:
    if (uploadAccepted) Update.abort();
    uploadAccepted = false;
    break;
  }
}

void handleFirmwareDone()
{
  if (!authorized()) return;
  server.send(uploadFinished ? 200 : 409, "text/plain; charset=utf-8",
    uploadFinished ? "Firmware wgrany, sterownik się restartuje." : "Nie wgrano: kompresor pracuje albo plik jest niepoprawny.");
  if (uploadFinished) {
    delay(500);
    ESP.restart();
  }
}

// AP (10.11.16.1) działa przez cały czas pracy, równolegle z połączeniem do
// sieci domowej (tryb AP+STA). Nieznane ścieżki pokazują stronę główną.
void startNetwork()
{
  WiFi.mode(WIFI_AP_STA);
  WiFi.softAPConfig(AP_ADDRESS, AP_ADDRESS, IPAddress(255, 255, 255, 0));
  // hasło krótsze niż 8 znaków daje sieć otwartą (WPA2 wymaga co najmniej 8)
  const char *apPassword = strlen(AP_PASSWORD) >= 8 ? AP_PASSWORD : nullptr;
  accessPointOn = WiFi.softAP(AP_SSID, apPassword);
  if (!accessPointOn) Serial.println("Nie udało się uruchomić punktu dostępowego");
  if (wifiSsid.length() > 0) WiFi.begin(wifiSsid.c_str(), wifiPassword.c_str());

  server.on("/", HTTP_GET, handleRoot);
  server.on("/state.json", HTTP_GET, handleState);
  server.on("/restart", HTTP_POST, handleRestart);
  server.on("/install", handleInstall);
  server.on("/install/compressor", HTTP_POST, handleCompressorSeconds);
  server.on("/install/firmware", HTTP_POST, handleFirmwareDone, handleFirmwareUpload);
  server.onNotFound(handleRoot);
  server.begin();
}

}  // namespace

void setup()
{
  // Stan „wyłączony” przed przełączeniem pinu na wyjście: pin ani przez chwilę
  // nie ma stanu włączającego przekaźnik (dawny szkic włączał go przy starcie).
  writeRelay(false);
  pinMode(RELAY_PIN, OUTPUT);
  writeRelay(false);

  preferences.begin(PREFERENCES_NAMESPACE, false);
  loadConfig();

  // Kompresor startuje raz, 1 s po podaniu zasilania i przed Wi-Fi.
  delay(COMPRESSOR_START_DELAY_MS);
  compressor.start(millis(), settings.compressorSeconds);
  writeRelay(compressor.running());

  Serial.begin(115200);
  serial = readSerial();

  // Uruchomienie z poprzedniego startu, z którego nic nie doszło do chmury,
  // trafia do kolejki, zanim bieżące nadpisze klucz run_current.
  queue.load(store);
  if (queuePreviousRun(store, queue)) queue.save(store);
  currentRun = RunRecord();
  // Pierwszy numer losowy: po wyczyszczeniu NVS numeracja nie wraca do 1,
  // więc nowe uruchomienie nie trafia do starego rekordu o tym samym runId.
  currentRun.runId = preferences.getUInt(KEY_NEXT_RUN, 0);
  if (currentRun.runId == 0) currentRun.runId = (esp_random() & 0x3FFFFFFFUL) | 1UL;
  preferences.putUInt(KEY_NEXT_RUN, currentRun.runId + 1);
  updateCurrentRun(millis());

  startNetwork();
}

void loop()
{
  server.handleClient();

  // wyłączenie kompresora sprawdzane w każdym obiegu, nie co 1 s
  const uint32_t now = millis();
  if (compressor.update(now)) writeRelay(false);

  if (now - lastTickMs >= TICK_MS) {
    lastTickMs = now;
    tick(now);
  }
}
