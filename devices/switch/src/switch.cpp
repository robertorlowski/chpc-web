// Sterownik włącznika (typ switch): płytka ESP32 z przekaźnikiem i zasilaczem 230 V
// („ESP32 Relay AC X1”, ESP32-WROOM-32E). Opis: README.md i docs/.
// Co 5 s zgłasza stan przekaźników (POST switch/state) i wykonuje polecenia z odpowiedzi:
// włącz na N s (odlicza sam, więc bez sieci dokończy i się wyłączy), włącz bez limitu, wyłącz.
// Komunikat WebSocket "operation" (zmiana w aplikacji) wywołuje zgłoszenie od razu.
// Strona / sterownika: „Włącz” na czas z pól pod przyciskami (0 h 0 min = bez limitu), „Wyłącz”
// i powrót do harmonogramu;
// zmiana trafia do chmury przez PUT switch/mode (relays.hpp: pending).
// Kontrakt z chmurą: POST devices/register (rootId, settings.default_on_minutes, oferta OTA),
// POST switch/state, PUT switch/mode, WebSocket /ws?rootId=. NVS: przestrzeń „sw”.
#include <Arduino.h>
#include <cstdarg>
#include <HTTPClient.h>
#include <Preferences.h>
#include <WebServer.h>
#include <WebSocketsClient.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <Update.h>
#include <esp_mac.h>
#include <mbedtls/sha256.h>

#include <firmware.hpp>
#include <ota.hpp>
#include <protocol.hpp>
#include <relays.hpp>
#include <secrets.h>

namespace {

constexpr const char *PREFERENCES_NAMESPACE = "sw";
constexpr const char *KEY_WIFI_SSID = "wifi_ssid";
constexpr const char *KEY_WIFI_PASSWORD = "wifi_pass";
constexpr const char *KEY_ROOT_ID = "root_id";
constexpr const char *KEY_DEFAULT_MINUTES = "def_min";
// wersja, po której pobraniu sterownik ostatnio się zrestartował (ochrona przed pętlą OTA)
constexpr const char *KEY_OTA_TRIED = "ota_tried";

constexpr uint32_t TICK_MS = 1000;
constexpr uint32_t EXCHANGE_INTERVAL_MS = 5000;
constexpr uint32_t REGISTER_RETRY_MS = 30000;
constexpr uint32_t PENDING_RETRY_MS = 5000;
// chmura „dostępna”, gdy ostatnia wymiana stanu udała się w tym czasie
constexpr uint32_t CLOUD_ONLINE_MS = 30000;
// AP: wyłączany po 1 min połączenia z Wi-Fi (telefon zdąży zobaczyć wynik zapisu na /install),
// włączany po 1 min bez Wi-Fi
constexpr uint32_t AP_OFF_AFTER_MS = 60000;
constexpr uint32_t AP_ON_AFTER_MS = 60000;
constexpr uint16_t HTTP_TIMEOUT_MS = 4000;
constexpr uint16_t REGISTER_TIMEOUT_MS = 8000;
constexpr uint16_t OTA_TIMEOUT_MS = 15000;
constexpr int HTTP_CONFLICT = 409;
constexpr int HTTP_NOT_FOUND = 404;
constexpr uint32_t STATUS_LOG_MS = 30000;

const IPAddress AP_ADDRESS(10, 11, 17, 1);

Preferences preferences;
WebServer server(80);
WiFiClientSecure secureClient;
WiFiClient plainClient;
HTTPClient http;
WebSocketsClient webSocket;

RelayBank bank(RELAY_COUNT);

String wifiSsid;
String wifiPassword;
const String cloudUrl = CLOUD_URL;
// z CLOUD_URL (parseCloudUrl): WebSocket łączy się z tym samym serwerem
bool cloudTls = true;
String cloudHost;
uint16_t cloudPort = 443;
String rootId;
String serial;
uint16_t defaultMinutes = DEFAULT_ON_MINUTES;

bool registeredThisBoot = false;
bool webSocketStarted = false;
bool exchangeDue = true;
uint32_t lastRegisterAttemptMs = 0;
uint32_t lastExchangeMs = 0;
uint32_t lastExchangeOkMs = 0;
uint32_t lastPendingAttemptMs = 0;
uint32_t lastTickMs = 0;
uint32_t lastStatusLogMs = 0;
int lastHttpStatus = 0;

bool accessPointOn = false;
uint32_t wifiLostSinceMs = 0;
uint32_t wifiConnectedSinceMs = 0;

OtaOffer otaOffer;
bool otaOfferReceived = false;
bool otaAttempted = false;
String otaStatus;
bool uploadAccepted = false;
bool uploadFinished = false;

void logf(const char *format, ...)
{
  char line[200];
  va_list args;
  va_start(args, format);
  vsnprintf(line, sizeof(line), format, args);
  va_end(args);
  Serial.printf("[%7lu] %s\n", static_cast<unsigned long>(millis()), line);
}

void writeRelay(uint8_t index)
{
  const uint8_t level = bank.relay(index).on == RELAY_ACTIVE_HIGH ? HIGH : LOW;
  digitalWrite(RELAY_PINS[index], level);
  if (RELAY_MIRROR_PINS[index] != 0xFF) digitalWrite(RELAY_MIRROR_PINS[index], level);
}

// Zapisuje na piny przekaźniki z maski i loguje zmianę.
void writeChanged(uint32_t mask, const char *reason)
{
  for (uint8_t index = 0; index < bank.count(); index++) {
    if (!(mask & (1UL << index))) continue;
    writeRelay(index);
    logf("przekaźnik %u: %s (%s)", static_cast<unsigned>(index + 1), bank.relay(index).on ? "WŁĄCZONY" : "wyłączony", reason);
  }
  // stan zmieniony lokalnie albo przez odliczanie: chmura dowie się od razu
  if (mask) exchangeDue = true;
}

bool cloudOnline(uint32_t nowMs)
{
  return lastExchangeOkMs != 0 && nowMs - lastExchangeOkMs < CLOUD_ONLINE_MS;
}

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
  rootId = preferences.getString(KEY_ROOT_ID, "");
  defaultMinutes = preferences.getUShort(KEY_DEFAULT_MINUTES, DEFAULT_ON_MINUTES);
}

// --- chmura ---

// https://host[:port]/api/ albo http://host[:port]/api/ (środowisko esp32dev-local).
void parseCloudUrl()
{
  cloudTls = cloudUrl.startsWith("https://");
  const int hostStart = cloudUrl.indexOf("://") + 3;
  int hostEnd = cloudUrl.indexOf('/', hostStart);
  if (hostEnd < 0) hostEnd = cloudUrl.length();
  const String hostPort = cloudUrl.substring(hostStart, hostEnd);
  const int colon = hostPort.indexOf(':');
  cloudHost = colon < 0 ? hostPort : hostPort.substring(0, colon);
  cloudPort = colon < 0 ? (cloudTls ? 443 : 80) : static_cast<uint16_t>(hostPort.substring(colon + 1).toInt());
}

String requestUrl(const char *path)
{
  String url = cloudUrl + path + "?deviceId=" + serial;
  if (rootId.length() > 0) url += "&rootId=" + rootId;
  return url;
}

// Jedno zapytanie HTTPS (certyfikat nie jest sprawdzany, jak w co i hydroforze).
// lastHttpStatus < 0 oznacza błąd połączenia.
bool send(const char *method, const String &url, const String &body, String *response = nullptr,
  uint16_t timeoutMs = HTTP_TIMEOUT_MS)
{
  if (WiFi.status() != WL_CONNECTED) return false;
  const bool secure = url.startsWith("https://");
  if (secure) secureClient.setInsecure();
  // keep-alive: kolejne zapytania co 5 s idą tym samym połączeniem TLS
  http.setReuse(true);
  http.setConnectTimeout(timeoutMs);
  http.setTimeout(timeoutMs);
  if (!(secure ? http.begin(secureClient, url) : http.begin(plainClient, url))) return false;
  http.addHeader("Content-Type", "application/json");
  lastHttpStatus = http.sendRequest(method, body);
  const bool ok = lastHttpStatus >= 200 && lastHttpStatus < 300;
  if (ok && response) *response = http.getString();
  http.end();
  return ok;
}

void stopWebSocket()
{
  if (!webSocketStarted) return;
  webSocket.disconnect();
  webSocketStarted = false;
}

// 409: rootId należy do innego urządzenia, 404: urządzenia nie ma (np. usunięte w bazie).
// Sterownik kasuje Root ID i zgłasza się ponownie.
void forgetRootIdOnError()
{
  if (lastHttpStatus != HTTP_CONFLICT && lastHttpStatus != HTTP_NOT_FOUND) return;
  logf("chmura: HTTP %d, zgłoszę się ponownie", lastHttpStatus);
  rootId = "";
  preferences.remove(KEY_ROOT_ID);
  registeredThisBoot = false;
  lastRegisterAttemptMs = 0;
  stopWebSocket();
}

void handleWebSocketEvent(WStype_t type, uint8_t *payload, size_t length)
{
  if (type == WStype_CONNECTED) {
    logf("WebSocket: połączony");
  } else if (type == WStype_DISCONNECTED) {
    logf("WebSocket: rozłączony");
  } else if (type == WStype_TEXT) {
    JsonDocument message;
    if (!deserializeJson(message, reinterpret_cast<const char *>(payload), length)
      && strcmp(message["type"] | "", "operation") == 0) {
      // zmiana w aplikacji: zgłoszenie stanu w najbliższym obiegu pętli (nie w callbacku)
      exchangeDue = true;
    }
  }
}

void startWebSocket()
{
  const String path = "/ws?rootId=" + rootId;
  if (cloudTls) webSocket.beginSSL(cloudHost.c_str(), cloudPort, path.c_str());
  else webSocket.begin(cloudHost.c_str(), cloudPort, path.c_str());
  webSocket.onEvent(handleWebSocketEvent);
  webSocket.setReconnectInterval(10000);
  webSocketStarted = true;
}

// Zgłoszenie przy każdym starcie: rootId, domyślny czas, oferta OTA, liczba przekaźników.
void registerDevice()
{
  lastRegisterAttemptMs = millis();
  JsonDocument request;
  request["deviceId"] = serial;
  request["deviceType"] = DEVICE_TYPE;
  request["name"] = DEVICE_NAME;
  request["version"] = FW_VERSION;
  request["ip"] = WiFi.localIP().toString();
  request["relays"] = RELAY_COUNT;
  String body;
  serializeJson(request, body);

  logf("zgłoszenie: POST devices/register, wersja %s, ip %s", FW_VERSION, WiFi.localIP().toString().c_str());
  String response;
  if (!send("POST", cloudUrl + "devices/register", body, &response, REGISTER_TIMEOUT_MS)) {
    logf("zgłoszenie: błąd, HTTP %d (ponowię za %lu s)", lastHttpStatus, static_cast<unsigned long>(REGISTER_RETRY_MS / 1000));
    return;
  }
  JsonDocument reply;
  if (deserializeJson(reply, response)) return;
  const String id = reply["rootId"] | "";
  if (id.length() == 0) return;
  if (id != rootId) {
    rootId = id;
    preferences.putString(KEY_ROOT_ID, rootId);
    stopWebSocket();
  }
  uint16_t minutes = defaultMinutes;
  if (parseDefaultMinutes(reply["settings"], minutes) && minutes != defaultMinutes) {
    defaultMinutes = minutes;
    preferences.putUShort(KEY_DEFAULT_MINUTES, minutes);
  }
  otaOfferReceived = parseOtaOffer(reply["settings"], otaOffer);
  registeredThisBoot = true;
  exchangeDue = true;
  if (!webSocketStarted) startWebSocket();
  logf("zgłoszenie: OK (HTTP %d), rootId %s, domyślnie %u min, OTA %s", lastHttpStatus, rootId.c_str(),
    static_cast<unsigned>(defaultMinutes), otaOfferReceived ? otaOffer.version.c_str() : "brak oferty");
}

// Zmiany ze strony sterownika do chmury, po jednej na przekaźnik (najnowsza).
void sendPending(uint32_t nowMs)
{
  lastPendingAttemptMs = nowMs;
  for (uint8_t index = 0; index < bank.count(); index++) {
    const Relay &relay = bank.relay(index);
    if (!relay.pending) continue;
    const uint32_t seq = relay.pendingSeq;
    const RelayMode mode = relay.pendingMode;
    const std::string body = buildModeBody(index + 1, mode, bank.pendingMinutes(index, nowMs));
    const bool ok = send("PUT", requestUrl("switch/mode"), body.c_str());
    logf("zmiana lokalna przekaźnika %u (%s) do chmury: %s (HTTP %d)", static_cast<unsigned>(index + 1),
      relayModeName(mode), ok ? "OK" : "błąd", lastHttpStatus);
    // 400: chmura nie przyjmie tej zmiany, ponawianie nic nie da
    if (ok || lastHttpStatus == 400) {
      bank.confirmPending(index, seq);
      exchangeDue = true;
    }
    forgetRootIdOnError();
  }
}

// Zgłoszenie stanu i polecenia z odpowiedzi.
void exchangeState(uint32_t nowMs)
{
  lastExchangeMs = nowMs;
  exchangeDue = false;
  String response;
  const std::string body = buildStateReport(bank, nowMs);
  if (!send("POST", requestUrl("switch/state"), body.c_str(), &response)) {
    logf("stan do chmury: błąd, HTTP %d", lastHttpStatus);
    forgetRootIdOnError();
    return;
  }
  uint32_t changed = 0;
  if (!applyStateResponse(response.c_str(), bank, millis(), changed)) {
    logf("stan do chmury: odpowiedź bez poleceń");
    return;
  }
  lastExchangeOkMs = millis();
  writeChanged(changed, "chmura");
  // stan już zgłoszony w tej wymianie; następna za EXCHANGE_INTERVAL_MS, chyba że coś się zmieni
  if (changed) exchangeDue = true;
}

// Pobiera obraz z oferty do nieaktywnej partycji OTA, licząc SHA-256 w locie; obraz jest
// aktywowany dopiero po zgodnej sumie. Blokuje pętlę (kilkanaście sekund), dlatego
// wołane tylko przy wszystkich przekaźnikach wyłączonych.
bool downloadFirmware(const OtaOffer &offer)
{
  logf("OTA: pobieram %s", offer.url.c_str());
  stopWebSocket();
  secureClient.stop();
  WiFiClientSecure client;
  client.setInsecure();  // integralność daje SHA-256 z odpowiedzi chmury
  HTTPClient download;
  download.setFollowRedirects(HTTPC_FORCE_FOLLOW_REDIRECTS);
  download.setConnectTimeout(OTA_TIMEOUT_MS);
  download.setTimeout(OTA_TIMEOUT_MS);
  if (!download.begin(client, offer.url.c_str())) return false;
  const int status = download.GET();
  const int total = download.getSize();
  if (status != 200 || total <= 0 || !Update.begin(total)) {
    otaStatus = "pobieranie nie powiodło się (HTTP " + String(status) + ")";
    logf("OTA: HTTP %d, rozmiar %d", status, total);
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
    logf("OTA: SHA-256 niezgodna (jest %s, oferta %s)", hex, offer.sha256.c_str());
    return false;
  }
  if (!Update.end(true)) {
    otaStatus = "obraz odrzucony";
    return false;
  }
  logf("OTA: obraz %d B zapisany, SHA-256 zgodna", total);
  return true;
}

bool allRelaysOff()
{
  for (uint8_t index = 0; index < bank.count(); index++) {
    if (bank.relay(index).on) return false;
  }
  return true;
}

// Aktualizacja raz na uruchomienie, gdy wszystkie przekaźniki są wyłączone (pobieranie blokuje
// pętlę i restart wyłącza przekaźniki; po starcie stan przywróci chmura). Przy włączonym
// przekaźniku sterownik czeka, aż się wyłączy.
void tryFirmwareUpdate()
{
  if (!otaOfferReceived || !allRelaysOff() || bank.anyPending()) return;
  otaAttempted = true;
  const String tried = preferences.getString(KEY_OTA_TRIED, "");
  if (!shouldUpdate(otaOffer, FW_VERSION, tried.c_str())) return;
  otaStatus = "pobieranie wersji " + String(otaOffer.version.c_str());
  if (!downloadFirmware(otaOffer)) return;
  preferences.putString(KEY_OTA_TRIED, otaOffer.version.c_str());
  logf("OTA: restart do wersji %s", otaOffer.version.c_str());
  delay(100);
  ESP.restart();
}

// Hasło AP krótsze niż 8 znaków (np. puste) daje sieć otwartą (WPA2 wymaga co najmniej 8).
const char *accessPointPassword()
{
  return strlen(AP_PASSWORD) >= 8 ? AP_PASSWORD : nullptr;
}

// AP do konfiguracji (domyślnie otwarty): po starcie i po 1 min bez Wi-Fi; wyłączany po 1 min
// połączenia z Wi-Fi. Strona / pozwala przełączać przekaźnik bez logowania, więc AP nie działa
// stale; z siecią domową strony są pod adresem IP sterownika.
void updateAccessPoint(uint32_t nowMs)
{
  const bool connected = WiFi.status() == WL_CONNECTED;
  if (connected) {
    wifiLostSinceMs = 0;
    if (wifiConnectedSinceMs == 0) wifiConnectedSinceMs = nowMs;
  } else {
    wifiConnectedSinceMs = 0;
    if (wifiLostSinceMs == 0) wifiLostSinceMs = nowMs;
  }

  if (accessPointOn && connected && nowMs - wifiConnectedSinceMs >= AP_OFF_AFTER_MS) {
    WiFi.softAPdisconnect(true);
    WiFi.mode(WIFI_STA);
    accessPointOn = false;
    logf("AP %s: wyłączony (Wi-Fi połączone, strony pod %s)", AP_SSID, WiFi.localIP().toString().c_str());
  } else if (!accessPointOn && !connected && wifiLostSinceMs != 0 && nowMs - wifiLostSinceMs >= AP_ON_AFTER_MS) {
    WiFi.mode(WIFI_AP_STA);
    WiFi.softAPConfig(AP_ADDRESS, AP_ADDRESS, IPAddress(255, 255, 255, 0));
    accessPointOn = WiFi.softAP(AP_SSID, accessPointPassword());
    logf("AP %s: włączony (brak Wi-Fi)", AP_SSID);
  }
}

void logStatus(uint32_t nowMs)
{
  if (nowMs - lastStatusLogMs < STATUS_LOG_MS) return;
  lastStatusLogMs = nowMs;
  logf("stan: Wi-Fi %d (RSSI %d), zgłoszony %d, chmura %s, ostatni HTTP %d, AP %s, przekaźnik 1 %s",
    static_cast<int>(WiFi.status()), WiFi.status() == WL_CONNECTED ? WiFi.RSSI() : 0, registeredThisBoot,
    cloudOnline(nowMs) ? "OK" : "brak", lastHttpStatus, accessPointOn ? "włączony" : "wyłączony",
    bank.relay(0).on ? "ON" : "off");
}

// Co 1 s z loop(): AP, zgłoszenie (co 30 s do skutku), zmiany lokalne, wymiana stanu
// (co 5 s albo od razu po zmianie), OTA.
void tick(uint32_t nowMs)
{
  updateAccessPoint(nowMs);
  logStatus(nowMs);
  if (WiFi.status() != WL_CONNECTED) return;

  if (!registeredThisBoot) {
    if (lastRegisterAttemptMs == 0 || nowMs - lastRegisterAttemptMs >= REGISTER_RETRY_MS) registerDevice();
    if (!registeredThisBoot) return;
  }
  if (bank.anyPending() && (lastPendingAttemptMs == 0 || nowMs - lastPendingAttemptMs >= PENDING_RETRY_MS
      || exchangeDue)) {
    sendPending(nowMs);
  }
  if (registeredThisBoot && (exchangeDue || nowMs - lastExchangeMs >= EXCHANGE_INTERVAL_MS)) exchangeState(nowMs);
  if (registeredThisBoot && !otaAttempted && cloudOnline(nowMs)) tryFirmwareUpdate();
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
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Włącznik</title>
<style>body{font-family:sans-serif;margin:0 auto;max-width:28rem;padding:1rem;color:#222}
.card{background:#f1f1f1;border-radius:.5rem;padding:.75rem 1rem;margin-bottom:1rem}
.state{font-size:1.6rem;font-weight:700}.on{color:#1481a5}.off{color:#888}.bad{color:#c62828}
.count{font-size:2rem;font-weight:700;color:#1481a5;text-align:center;font-variant-numeric:tabular-nums}
button{background:#1481a5;color:#fff;border:0;border-radius:6px;padding:.6rem 1rem;font-size:1rem}
button.stop{background:#c62828}button.second{background:#7a8c93}button:disabled{opacity:.4}
.buttons{display:flex;flex-wrap:wrap;gap:.5rem}.timer{display:flex;gap:.4rem;align-items:center;margin-top:.5rem}
.timer input{width:4rem;padding:.3rem}label{display:block;margin:.4rem 0}label input{width:100%;box-sizing:border-box;padding:.3rem}
small{color:#555}h2{margin:0 0 .5rem;padding-bottom:.3rem;border-bottom:2px solid #1481a5;color:#1481a5;font-size:1.25rem}
</style></head><body>)html";

// Karty przekaźników budowane w przeglądarce z /state.json (odświeżanie co 1 s, odliczanie lokalne).
const char MAIN_PAGE[] PROGMEM = R"html(<h1>Włącznik</h1><div id="relays"></div>
<div class="card"><h2>Wi-Fi i chmura</h2><div id="net">---</div></div>
<p><a href="/install">Instalacja</a></p>
<script>
var MODES={schedule:'Harmonogram',on:'Włączony ręcznie (bez limitu)',timer:'Włączony na czas',off:'Wyłączony · harmonogram zablokowany'};
function hms(t){var h=Math.floor(t/3600),m=('0'+Math.floor(t%3600/60)).slice(-2),s=('0'+t%60).slice(-2);return (h?h+':':'')+m+':'+s}
function card(r,d){return '<div class="card"><h2>Przekaźnik '+r.relay+'</h2>'
+'<div class="state '+(r.on?'on':'off')+'">'+(r.on?'WŁĄCZONY':'WYŁĄCZONY')+'</div>'
+'<div class="'+(r.mode=='off'?'bad':'')+'">'+(MODES[r.mode]||'tryb nieznany (brak chmury)')+(r.pending?' · <small>czeka na wysłanie do chmury</small>':'')+'</div>'
+(r.remainingS?'<div class="count">'+hms(r.remainingS)+'</div>':'')
+'<p class="buttons"><button onclick="on('+r.relay+')">Włącz</button>'
+'<button class="stop" onclick="cmd('+r.relay+',\'off\')">Wyłącz</button>'
+'<button class="second" onclick="cmd('+r.relay+',\'schedule\')"'+(r.mode=='schedule'?' disabled':'')+'>Harmonogram</button></p>'
+'<div class="timer">Czas włączenia '+field(r.relay,'h',Math.floor(d/60),168)+' h '+field(r.relay,'m',d%60,59)+' min</div>'
+'<small>0 h 0 min = bez limitu czasu</small></div>'}
function field(n,k,d,max){var id=k+n,v=window['v'+id];return '<input id="'+id+'" type="number" min="0" max="'+max+'" value="'+(v===undefined?d:v)+'" oninput="window[\'v'+id+'\']=this.value">'}
function on(n){var t=(+document.getElementById('h'+n).value||0)*60+(+document.getElementById('m'+n).value||0);
if(t>10080){alert('Najwyżej 7 dni (168 h).');return}if(t>0)cmd(n,'timer',t);else cmd(n,'on')}
function load(){if(document.activeElement&&document.activeElement.tagName=='INPUT')return;
fetch('/state.json',{cache:'no-store'}).then(r=>r.json()).then(s=>{
relays.innerHTML=s.relays.map(function(r){return card(r,s.defaultMinutes)}).join('');
net.innerHTML='Wi-Fi: '+(s.wifi?'<b class="on">'+s.ssid+'</b>, '+s.ip+', '+s.rssi+' dBm':'<b class="bad">brak połączenia</b>')
+'<br>Chmura: '+(s.cloud?'<b class="on">połączona</b>':'<b class="bad">brak</b>')+(s.lastStatus?' (HTTP '+s.lastStatus+')':'')
+'<br><small>Bez chmury przekaźnik dokończy bieżące włączenie na czas i się wyłączy.</small>'})}
function cmd(n,m,min){fetch('/relay?n='+n+'&mode='+m+(min?'&minutes='+min:''),{method:'POST'}).then(function(){document.activeElement.blur();load()})}
load();setInterval(load,1000);
</script></body></html>)html";

void handleRoot()
{
  String page = FPSTR(PAGE_HEAD);
  page += FPSTR(MAIN_PAGE);
  server.sendHeader("Cache-Control", "no-store");
  server.send(200, "text/html; charset=utf-8", page);
}

void handleState()
{
  const uint32_t now = millis();
  JsonDocument state;
  JsonArray relays = state["relays"].to<JsonArray>();
  for (uint8_t index = 0; index < bank.count(); index++) {
    const Relay &relay = bank.relay(index);
    JsonObject item = relays.add<JsonObject>();
    item["relay"] = index + 1;
    item["on"] = relay.on;
    item["mode"] = relayModeName(relay.mode);
    item["remainingS"] = (bank.remainingMs(index, now) + 999) / 1000;
    item["pending"] = relay.pending;
  }
  state["defaultMinutes"] = defaultMinutes;
  state["wifi"] = WiFi.status() == WL_CONNECTED;
  state["ssid"] = wifiSsid;
  if (WiFi.status() == WL_CONNECTED) {
    state["ip"] = WiFi.localIP().toString();
    state["rssi"] = WiFi.RSSI();
  }
  state["cloud"] = cloudOnline(now);
  state["lastStatus"] = lastHttpStatus;
  String body;
  serializeJson(state, body);
  server.sendHeader("Cache-Control", "no-store");
  server.send(200, "application/json", body);
}

// POST /relay?n=1&mode=on|off|timer|schedule[&minutes=N]: zmiana ze strony, od razu na przekaźnik,
// do chmury w najbliższym tick(). Bez logowania jak w hydroforze: strona działa w sieci domowej.
void handleRelay()
{
  const int number = server.arg("n").toInt();
  const RelayMode mode = relayModeFromName(server.arg("mode").c_str());
  const long minutes = server.arg("minutes").toInt();
  if (number < 1 || number > bank.count() || mode == RelayMode::Unknown
    || (mode == RelayMode::Timer && (minutes < 1 || minutes > MAX_ON_MINUTES))) {
    server.send(400, "application/json", "{}");
    return;
  }
  const uint8_t index = static_cast<uint8_t>(number - 1);
  const uint32_t now = millis();
  const uint32_t changed = bank.applyLocal(index, mode, static_cast<uint32_t>(minutes), cloudOnline(now), now)
    ? 1UL << index : 0;
  logf("strona: przekaźnik %d tryb %s%s", number, relayModeName(mode),
    mode == RelayMode::Timer ? (" na " + String(minutes) + " min").c_str() : "");
  writeChanged(changed, "strona sterownika");
  exchangeDue = true;
  server.send(200, "application/json", "{}");
}

bool authorized()
{
  if (server.authenticate(INSTALL_USER, INSTALL_PASSWORD)) return true;
  server.requestAuthentication();
  return false;
}

// /install (Basic Auth): Wi-Fi, ręczne wgranie firmware, dane sterownika.
void handleInstall()
{
  if (!authorized()) return;

  if (server.method() == HTTP_POST) {
    const String ssid = server.arg("ssid");
    const String password = server.arg("password");
    if (ssid.length() > 0) {
      wifiSsid = ssid;
      preferences.putString(KEY_WIFI_SSID, ssid);
      // puste pole hasła zostawia zapisane
      if (password.length() > 0) {
        wifiPassword = password;
        preferences.putString(KEY_WIFI_PASSWORD, password);
      }
    }
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
  page += "<form method=\"post\" action=\"/install/firmware\" enctype=\"multipart/form-data\" class=\"card\"><h2>Firmware</h2>";
  page += "<div>Wersja: <b>" + String(FW_VERSION) + "</b></div>";
  if (otaStatus.length() > 0) page += "<div><small>Aktualizacja z chmury: " + htmlEscape(otaStatus) + "</small></div>";
  page += "<label>Plik firmware.bin<input name=\"firmware\" type=\"file\" accept=\".bin\" required></label>";
  page += "<div><small>Po wgraniu sterownik się restartuje (przekaźniki wyłączą się na chwilę).</small></div>";
  page += "<p><button type=\"submit\">Wgraj</button></p></form>";
  page += "<div class=\"card\"><div>SN: <b>" + serial + "</b></div>";
  page += "<div>Root ID: <b>" + (rootId.length() ? htmlEscape(rootId) : String("---")) + "</b></div>";
  page += "<div>Przekaźników: <b>" + String(RELAY_COUNT) + "</b></div>";
  page += "<div>Wi-Fi: " + String(WiFi.status() == WL_CONNECTED ? WiFi.localIP().toString() : String("brak połączenia")) + "</div>";
  page += "<div>Zgłoszenie w chmurze: " + String(registeredThisBoot ? "tak" : "nie") + "</div>";
  page += "</div><p><a href=\"/\">Strona główna</a></p></body></html>";
  server.sendHeader("Cache-Control", "no-store");
  server.send(200, "text/html; charset=utf-8", page);
}

void handleFirmwareUpload()
{
  HTTPUpload &upload = server.upload();
  switch (upload.status) {
  case UPLOAD_FILE_START:
    uploadFinished = false;
    uploadAccepted = server.authenticate(INSTALL_USER, INSTALL_PASSWORD) && Update.begin(UPDATE_SIZE_UNKNOWN);
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
    uploadFinished ? "Firmware wgrany, sterownik się restartuje." : "Nie wgrano: plik jest niepoprawny.");
  if (uploadFinished) {
    delay(500);
    ESP.restart();
  }
}

void startNetwork()
{
  WiFi.mode(WIFI_AP_STA);
  WiFi.softAPConfig(AP_ADDRESS, AP_ADDRESS, IPAddress(255, 255, 255, 0));
  accessPointOn = WiFi.softAP(AP_SSID, accessPointPassword());
  logf("AP %s: %s (10.11.17.1, %s)", AP_SSID, accessPointOn ? "uruchomiony" : "NIE uruchomiony",
    accessPointPassword() ? "z hasłem" : "otwarty");
  if (wifiSsid.length() > 0) {
    logf("Wi-Fi: łączę z %s", wifiSsid.c_str());
    WiFi.begin(wifiSsid.c_str(), wifiPassword.c_str());
  } else {
    logf("Wi-Fi: brak zapisanej sieci (ustaw na /install przez AP)");
  }

  server.on("/", HTTP_GET, handleRoot);
  server.on("/state.json", HTTP_GET, handleState);
  server.on("/relay", HTTP_POST, handleRelay);
  server.on("/install", handleInstall);
  server.on("/install/firmware", HTTP_POST, handleFirmwareDone, handleFirmwareUpload);
  server.onNotFound(handleRoot);
  server.begin();
}

}  // namespace

void setup()
{
  Serial.setTxBufferSize(2048);
  Serial.begin(115200);
  // Przekaźniki wyłączone, zanim piny staną się wyjściami; stan po starcie poda chmura.
  for (uint8_t index = 0; index < RELAY_COUNT; index++) {
    writeRelay(index);
    pinMode(RELAY_PINS[index], OUTPUT);
    if (RELAY_MIRROR_PINS[index] != 0xFF) pinMode(RELAY_MIRROR_PINS[index], OUTPUT);
    writeRelay(index);
  }

  preferences.begin(PREFERENCES_NAMESPACE, false);
  loadConfig();
  parseCloudUrl();
  serial = readSerial();
  logf("start: firmware %s, SN %s, rootId %s, przekaźników %u, chmura %s", FW_VERSION, serial.c_str(),
    rootId.length() > 0 ? rootId.c_str() : "brak", static_cast<unsigned>(RELAY_COUNT), CLOUD_URL);
  startNetwork();
}

void loop()
{
  server.handleClient();
  if (webSocketStarted) webSocket.loop();

  // odliczanie włączeń na czas sprawdzane w każdym obiegu, także bez sieci
  const uint32_t now = millis();
  writeChanged(bank.update(now), "koniec czasu");

  if (now - lastTickMs >= TICK_MS || exchangeDue) {
    lastTickMs = now;
    tick(now);
  }
}
