// Sterownik pieca Pellux 200 (typ pellet-boiler-pelux200) na osobnej płytce ESP32-C3
// SuperMini z modułem RS-485 HW-519 (CLAUDE.md, punkt 5c; do 2026-10-02 rola firmware co):
// nasłuch magistrali ecoMAX panelu kotła (tylko odbiór, etap 1), dekodowanie SensorData
// (ecomax_frame.*), wysyłka ostatniego odczytu co poll_interval_seconds. Polaryzacja magistrali wybierana sama (bus_polarity.hpp).
// Kontrakt z chmurą: POST devices/register (rootId, settings.poll_interval_seconds),
// POST pellet-boiler-pelux200/add (odpowiedź {poll_interval_seconds}). NVS: przestrzeń „pel”.
// Przy kotle nikt nie naciśnie resetu, więc sterownik restartuje się sam: watchdog pętli
// (WATCHDOG_S) i po WIFI_RESTART_AFTER_MS bez Wi-Fi (2026-10-03 płytka raz zawisła bez restartu).
#include <Arduino.h>
#include <esp_task_wdt.h>
#include <cstdarg>
#include <HTTPClient.h>
#include <Preferences.h>
#include <WebServer.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <Update.h>
#include <esp_mac.h>

#include <bus_polarity.hpp>
#include <ecomax_frame.hpp>
#include <firmware.hpp>
#include <pellet_telemetry.hpp>
#include <secrets.h>

namespace {

constexpr const char *PREFERENCES_NAMESPACE = "pel";
constexpr const char *KEY_WIFI_SSID = "wifi_ssid";
constexpr const char *KEY_WIFI_PASSWORD = "wifi_pass";
constexpr const char *KEY_ROOT_ID = "root_id";
constexpr const char *KEY_POLL_SECONDS = "poll_s";
constexpr const char *KEY_INVERTED = "bus_inv";

constexpr uint32_t TICK_MS = 1000;
constexpr uint32_t REGISTER_RETRY_MS = 30000;
// po nieudanej wysyłce ponowienie po 60 s, nie po pełnym interwale
constexpr uint32_t POST_RETRY_MS = 60000;
constexpr uint32_t AP_OFF_AFTER_MS = 60000;
constexpr uint32_t AP_ON_AFTER_MS = 60000;
constexpr uint16_t HTTP_TIMEOUT_MS = 5000;
constexpr uint16_t REGISTER_TIMEOUT_MS = 8000;
constexpr uint32_t STATUS_LOG_MS = 30000;
// pętla stoi dłużej (najdłuższe zapytanie HTTP to 8 s) = zawieszenie, restart układu
constexpr uint32_t WATCHDOG_S = 30;
// tyle bez połączenia z siecią domową = restart (stos Wi-Fi bywa, że nie wraca sam)
constexpr uint32_t WIFI_RESTART_AFTER_MS = 10UL * 60 * 1000;
// bufor UART: HTTP blokuje pętlę na kilka sekund, nadmiar przepada, parser się resynchronizuje
constexpr size_t RX_BUFFER_BYTES = 4096;
constexpr size_t MAX_BYTES_PER_LOOP = 512;

const IPAddress AP_ADDRESS(10, 11, 18, 1);

const char *const STATE_NAMES[] = {
  "wyłączony", "stabilizacja", "rozpalanie", "praca", "nadzór", "pauza", "czuwanie",
  "wygaszanie", "alarm", "ręczny", "odpieczętowanie", "inny"};

Preferences preferences;
WebServer server(80);
WiFiClientSecure secureClient;
WiFiClient plainClient;
HTTPClient http;

EcomaxFrameParser parser;
BusPolarity polarity;
EcomaxSensorData latest;
bool hasReading = false;
uint32_t readingAtMs = 0;
uint32_t busBytes = 0;
uint32_t validFrames = 0;
uint32_t sensorFrames = 0;

// Diagnostyka magistrali (od 1.0.2): jakie ramki naprawdę lecą na magistrali kotła —
// para (typ, nadawca, odbiorca) z licznikiem; pierwsza ramka każdej pary trafia na konsolę
// w hex. Na kotle 2026-10-03 przychodziły poprawne ramki, ale żadna SensorData (0x35).
struct FrameKind {
  uint8_t type;
  uint8_t sender;
  uint8_t recipient;
  uint32_t count;
  uint16_t lastLength;
};
constexpr uint8_t MAX_FRAME_KINDS = 24;
FrameKind frameKinds[MAX_FRAME_KINDS];
uint8_t frameKindCount = 0;

// Pełne dane ramek do rozszyfrowania (od 1.0.3): RegulatorData 0x08 (regulator → wszyscy,
// co 2 s) i 0x89 (panele → wszyscy), najwyżej raz na DUMP_INTERVAL_MS dla każdego typu.
// Linia: "DUMP <typ> <nadawca> <ms> <hex>" — do porównania z wartościami na panelu kotła.
constexpr uint32_t DUMP_INTERVAL_MS = 10000;
uint32_t lastDump08Ms = 0;
uint32_t lastDump89Ms = 0;

void dumpFrame(const EcomaxFrame &frame)
{
  uint32_t *last = frame.type == 0x08 ? &lastDump08Ms : frame.type == 0x89 ? &lastDump89Ms : nullptr;
  if (!last) return;
  const uint32_t now = millis();
  if (*last != 0 && now - *last < DUMP_INTERVAL_MS) return;
  *last = now;
  Serial.printf("DUMP %02x %02x %lu ", frame.type, frame.sender, static_cast<unsigned long>(now));
  for (size_t index = 0; index < frame.dataLength; index++) Serial.printf("%02x", frame.data[index]);
  Serial.println();
}

// Zlicza ramkę; przy nowej parze wypisuje nagłówek i do 48 bajtów danych.
void recordFrameKind(const EcomaxFrame &frame)
{
  dumpFrame(frame);
  for (uint8_t index = 0; index < frameKindCount; index++) {
    FrameKind &kind = frameKinds[index];
    if (kind.type == frame.type && kind.sender == frame.sender && kind.recipient == frame.recipient) {
      kind.count++;
      kind.lastLength = static_cast<uint16_t>(frame.dataLength);
      return;
    }
  }
  if (frameKindCount >= MAX_FRAME_KINDS) return;
  frameKinds[frameKindCount++] = {frame.type, frame.sender, frame.recipient, 1, static_cast<uint16_t>(frame.dataLength)};
  char hex[3 * 48 + 1] = {};
  const size_t shown = frame.dataLength < 48 ? frame.dataLength : 48;
  for (size_t index = 0; index < shown; index++) snprintf(hex + index * 3, 4, "%02x ", frame.data[index]);
  Serial.printf("[%7lu] ramka nowa: typ 0x%02x od 0x%02x (typ nadawcy 0x%02x, wersja %u) do 0x%02x, dane %u B: %s\n",
    static_cast<unsigned long>(millis()), frame.type, frame.sender, frame.senderType, frame.version, frame.recipient,
    static_cast<unsigned>(frame.dataLength), hex);
}

String wifiSsid;
String wifiPassword;
const String cloudUrl = CLOUD_URL;
String rootId;
String serial;
uint16_t pollSeconds = DEFAULT_POLL_SECONDS;

bool registeredThisBoot = false;
uint32_t lastRegisterAttemptMs = 0;
uint32_t nextPostMs = 0;
uint32_t lastPostOkMs = 0;
int lastHttpStatus = 0;
int lastPostStatus = 0;
uint32_t lastTickMs = 0;
uint32_t lastStatusLogMs = 0;

bool accessPointOn = false;
uint32_t wifiLostSinceMs = 0;
uint32_t wifiConnectedSinceMs = 0;
bool uploadAccepted = false;
bool uploadFinished = false;

// Dziennik na konsoli USB (115200): czas w ms od startu i linia tekstu.
void logf(const char *format, ...)
{
  char line[200];
  va_list args;
  va_start(args, format);
  vsnprintf(line, sizeof(line), format, args);
  va_end(args);
  Serial.printf("[%7lu] %s\n", static_cast<unsigned long>(millis()), line);
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

// Wartość z NVS, a gdy jej nie ma (pierwszy start) — wkompilowana z secrets.h.
String storedOrDefault(const char *key, const char *fallback)
{
  String value = preferences.getString(key, "");
  return value.length() > 0 ? value : String(fallback);
}

// Wi-Fi, Root ID, interwał wysyłki i zatwierdzona polaryzacja magistrali z NVS.
void loadConfig()
{
  wifiSsid = storedOrDefault(KEY_WIFI_SSID, WIFI_SSID);
  wifiPassword = storedOrDefault(KEY_WIFI_PASSWORD, WIFI_PASSWORD);
  rootId = preferences.getString(KEY_ROOT_ID, "");
  pollSeconds = preferences.getUShort(KEY_POLL_SECONDS, DEFAULT_POLL_SECONDS);
  polarity = BusPolarity(preferences.getBool(KEY_INVERTED, false));
}

// --- magistrala ecoMAX ---

// UART1 tylko z pinem odbioru (TX = -1: sterownik nie nadaje); invert odwraca sygnał,
// gdy przewody A/B są zamienione.
void startBus()
{
  Serial1.end();
  Serial1.setRxBufferSize(RX_BUFFER_BYTES);
  Serial1.begin(ECOMAX_BAUD, SERIAL_8N1, ECOMAX_RX_PIN, -1, polarity.inverted());
  logf("magistrala: GPIO%d, %lu bodów, sygnał %s", ECOMAX_RX_PIN, static_cast<unsigned long>(ECOMAX_BAUD),
    polarity.inverted() ? "odwrócony" : "normalny");
}

// Bajty z UART1 do parsera; każda poprawna ramka potwierdza polaryzację, SensorData to odczyt.
void readBus(uint32_t nowMs)
{
  size_t budget = MAX_BYTES_PER_LOOP;
  while (budget > 0 && Serial1.available() > 0) {
    const int byte = Serial1.read();
    if (byte < 0) break;
    budget--;
    busBytes++;
    polarity.onBytes(1);
    parser.feed(static_cast<uint8_t>(byte));

    EcomaxFrame frame;
    while (parser.next(frame)) {
      validFrames++;
      if (!polarity.confirmed()) {
        preferences.putBool(KEY_INVERTED, polarity.inverted());
        logf("magistrala: pierwsza poprawna ramka, sygnał %s", polarity.inverted() ? "odwrócony" : "normalny");
      }
      polarity.onFrame(nowMs);
      recordFrameKind(frame);
      if (!isSensorDataFrame(frame)) continue;
      EcomaxSensorData decoded;
      if (!decodeSensorData(frame.data, frame.dataLength, decoded)) continue;
      latest = decoded;
      hasReading = true;
      readingAtMs = nowMs;
      sensorFrames++;
    }
  }
  if (polarity.update(nowMs)) {
    logf("magistrala: bajty bez poprawnych ramek, odwracam sygnał (zmiana %lu)",
      static_cast<unsigned long>(polarity.switches()));
    startBus();
  }
}

bool readingFresh(uint32_t nowMs)
{
  return hasReading && nowMs - readingAtMs < READING_MAX_AGE_MS;
}

// --- chmura ---

// Adres endpointu sterownika: zawsze z deviceId (SN), z rootId, gdy jest zapisany.
String requestUrl(const char *path)
{
  String url = cloudUrl + path + "?deviceId=" + serial;
  if (rootId.length() > 0) url += "&rootId=" + rootId;
  return url;
}

// Jedno zapytanie HTTP(S) (certyfikat nie jest sprawdzany, jak w pozostałych sterownikach).
// lastHttpStatus < 0 oznacza błąd połączenia.
bool post(const String &url, const String &body, String *response = nullptr, uint16_t timeoutMs = HTTP_TIMEOUT_MS)
{
  if (WiFi.status() != WL_CONNECTED) return false;
  const bool secure = url.startsWith("https://");
  if (secure) secureClient.setInsecure();
  http.setReuse(true);
  http.setConnectTimeout(timeoutMs);
  http.setTimeout(timeoutMs);
  if (!(secure ? http.begin(secureClient, url) : http.begin(plainClient, url))) return false;
  http.addHeader("Content-Type", "application/json");
  lastHttpStatus = http.POST(body);
  const bool ok = lastHttpStatus >= 200 && lastHttpStatus < 300;
  if (ok && response) *response = http.getString();
  http.end();
  return ok;
}

// Interwał z settings zgłoszenia albo z odpowiedzi na wysyłkę (30–3600 s, inne pomijane).
void applyPollSeconds(JsonVariantConst value)
{
  if (!value.is<unsigned>()) return;
  const unsigned seconds = value.as<unsigned>();
  if (seconds < 30 || seconds > 3600 || seconds == pollSeconds) return;
  pollSeconds = static_cast<uint16_t>(seconds);
  preferences.putUShort(KEY_POLL_SECONDS, pollSeconds);
  logf("chmura: interwał wysyłki %u s", static_cast<unsigned>(pollSeconds));
}

// Zgłoszenie przy starcie (i po 404/409): rootId i interwał wysyłki.
void registerDevice()
{
  lastRegisterAttemptMs = millis();
  JsonDocument request;
  request["deviceId"] = serial;
  request["deviceType"] = DEVICE_TYPE;
  request["name"] = DEVICE_NAME;
  request["version"] = FW_VERSION;
  request["ip"] = WiFi.localIP().toString();
  String body;
  serializeJson(request, body);
  String response;
  if (!post(cloudUrl + "devices/register", body, &response, REGISTER_TIMEOUT_MS)) {
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
  }
  applyPollSeconds(reply["settings"]["poll_interval_seconds"]);
  registeredThisBoot = true;
  logf("zgłoszenie: OK (HTTP %d), rootId %s, interwał %u s", lastHttpStatus, rootId.c_str(),
    static_cast<unsigned>(pollSeconds));
}

// Ostatni świeży odczyt do chmury. 404/409: Root ID nieaktualny, zgłoszenie od nowa.
void sendReading(uint32_t nowMs)
{
  JsonDocument document;
  fillPelletJson(document, latest);
  String body;
  serializeJson(document, body);
  String response;
  const bool ok = post(requestUrl("pellet-boiler-pelux200/add"), body, &response);
  lastPostStatus = lastHttpStatus;
  logf("odczyt do chmury: %s (HTTP %d)", ok ? "OK" : "błąd", lastHttpStatus);
  if (ok) {
    lastPostOkMs = nowMs;
    JsonDocument reply;
    if (!deserializeJson(reply, response)) applyPollSeconds(reply["poll_interval_seconds"]);
    nextPostMs = nowMs + pollSeconds * 1000UL;
    return;
  }
  nextPostMs = nowMs + POST_RETRY_MS;
  if (lastHttpStatus == 404 || lastHttpStatus == 409) {
    rootId = "";
    preferences.remove(KEY_ROOT_ID);
    registeredThisBoot = false;
    lastRegisterAttemptMs = 0;
  }
}

// --- Wi-Fi i AP ---

const char *accessPointPassword()
{
  return strlen(AP_PASSWORD) >= 8 ? AP_PASSWORD : nullptr;
}

// AP do konfiguracji (domyślnie otwarty): po starcie i po 1 min bez Wi-Fi; wyłączany
// po 1 min połączenia (strony są wtedy pod adresem IP sterownika w sieci domowej).
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
    logf("AP %s: wyłączony (strony pod %s)", AP_SSID, WiFi.localIP().toString().c_str());
  } else if (!accessPointOn && !connected && wifiLostSinceMs != 0 && nowMs - wifiLostSinceMs >= AP_ON_AFTER_MS) {
    WiFi.mode(WIFI_AP_STA);
    WiFi.softAPConfig(AP_ADDRESS, AP_ADDRESS, IPAddress(255, 255, 255, 0));
    accessPointOn = WiFi.softAP(AP_SSID, accessPointPassword());
    logf("AP %s: włączony (brak Wi-Fi)", AP_SSID);
  }
  // Restart po długim braku Wi-Fi, ale nie bez zapisanej sieci i nie w trakcie konfiguracji
  // przez AP (restart przerwałby telefonowi stronę /install).
  if (!connected && wifiSsid.length() > 0 && wifiLostSinceMs != 0 && nowMs - wifiLostSinceMs >= WIFI_RESTART_AFTER_MS
    && WiFi.softAPgetStationNum() == 0) {
    logf("Wi-Fi: brak połączenia od %lu min, restart", static_cast<unsigned long>(WIFI_RESTART_AFTER_MS / 60000));
    delay(100);
    ESP.restart();
  }
}

// Co 30 s jedna linia stanu na konsoli.
void logStatus(uint32_t nowMs)
{
  if (nowMs - lastStatusLogMs < STATUS_LOG_MS) return;
  lastStatusLogMs = nowMs;
  logf("stan: Wi-Fi %d, zgłoszony %d, bajty %lu, ramki %lu (SensorData %lu, odrzucone %lu), sygnał %s%s, odczyt %s",
    static_cast<int>(WiFi.status()), registeredThisBoot, static_cast<unsigned long>(busBytes),
    static_cast<unsigned long>(validFrames), static_cast<unsigned long>(sensorFrames),
    static_cast<unsigned long>(parser.rejectedCount()), polarity.inverted() ? "odwrócony" : "normalny",
    polarity.confirmed() ? "" : " (niepotwierdzony)", readingFresh(nowMs) ? "świeży" : "brak");
  for (uint8_t index = 0; index < frameKindCount; index++) {
    const FrameKind &kind = frameKinds[index];
    Serial.printf("          ramki: typ 0x%02x od 0x%02x do 0x%02x: %lu szt., ostatnio %u B\n", kind.type, kind.sender,
      kind.recipient, static_cast<unsigned long>(kind.count), static_cast<unsigned>(kind.lastLength));
  }
}

// Co 1 s: AP, zgłoszenie (co 30 s do skutku), wysyłka świeżego odczytu co pollSeconds.
void tick(uint32_t nowMs)
{
  updateAccessPoint(nowMs);
  logStatus(nowMs);
  if (WiFi.status() != WL_CONNECTED) return;
  if (!registeredThisBoot) {
    if (lastRegisterAttemptMs == 0 || nowMs - lastRegisterAttemptMs >= REGISTER_RETRY_MS) registerDevice();
    if (!registeredThisBoot) return;
  }
  if (readingFresh(nowMs) && static_cast<int32_t>(nowMs - nextPostMs) >= 0) sendReading(nowMs);
}

// --- strony WWW ---

String htmlEscape(const String &text)
{
  String out;
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
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Piec Pellux 200</title>
<style>body{font-family:sans-serif;margin:0 auto;max-width:28rem;padding:1rem;color:#222}
.card{background:#f1f1f1;border-radius:.5rem;padding:.75rem 1rem;margin-bottom:1rem}
.on{color:#1481a5}.bad{color:#c62828}table{width:100%;border-collapse:collapse}td{padding:.15rem 0}
td+td{text-align:right;font-weight:600}button{background:#1481a5;color:#fff;border:0;border-radius:6px;padding:.6rem 1rem;font-size:1rem}
label{display:block;margin:.4rem 0}label input{width:100%;box-sizing:border-box;padding:.3rem}small{color:#555}
h2{margin:0 0 .5rem;padding-bottom:.3rem;border-bottom:2px solid #1481a5;color:#1481a5;font-size:1.25rem}
</style></head><body>)html";

// Odczyt i diagnostyka magistrali z /state.json (odświeżanie co 2 s).
const char MAIN_PAGE[] PROGMEM = R"html(<h1>Piec Pellux 200</h1>
<div class="card"><h2>Odczyt</h2><div id="reading">---</div></div>
<div class="card"><h2>Magistrala ecoMAX</h2><div id="bus">---</div></div>
<div class="card"><h2>Wi-Fi i chmura</h2><div id="net">---</div></div>
<p><a href="/install">Instalacja</a></p>
<script>
var L={state:'Stan',heating_temp:'Kocioł [°C]',heating_target:'Kocioł zadana [°C]',water_heater_temp:'CWU [°C]',
water_heater_target:'CWU zadana [°C]',feeder_temp:'Podajnik [°C]',return_temp:'Powrót [°C]',exhaust_temp:'Spaliny [°C]',
outside_temp:'Zewnętrzna [°C]',fuel_level:'Paliwo [%]',fan_power:'Wentylator [%]',boiler_power:'Moc [kW]',
boiler_load:'Obciążenie [%]',fuel_consumption:'Zużycie [kg/h]',fan:'Wentylator',feeder:'Podajnik',
heating_pump:'Pompa CO',water_heater_pump:'Pompa CWU',circulation_pump:'Cyrkulacja',lighter:'Zapalarka',alarm:'Alarm'};
function v(x){return x===true?'tak':x===false?'nie':typeof x=='number'?Math.round(x*10)/10:x}
function load(){fetch('/state.json',{cache:'no-store'}).then(r=>r.json()).then(s=>{
reading.innerHTML=s.reading?'<table>'+Object.keys(L).filter(k=>k in s.reading).map(k=>'<tr><td>'+L[k]+'</td><td>'
+(k=='state'?s.stateName:v(s.reading[k]))+'</td></tr>').join('')+'</table><small>'+s.ageS+' s temu</small>'
:'<span class="bad">Brak odczytu z kotła</span>';
bus.innerHTML='Bajty: <b>'+s.bytes+'</b>, ramki: <b>'+s.frames+'</b> (SensorData '+s.sensorFrames+', odrzucone '+s.rejected+')<br>'
+'Sygnał: <b>'+(s.inverted?'odwrócony':'normalny')+'</b>'+(s.confirmed?'':' <small>(dobierany)</small>')
+'<br><small>GPIO21, 115200 bodów, tylko odbiór</small>';
net.innerHTML='Wi-Fi: '+(s.wifi?'<b class="on">'+s.ssid+'</b>, '+s.ip+', '+s.rssi+' dBm':'<b class="bad">brak</b>')
+'<br>Chmura: '+(s.registered?'<b class="on">zgłoszony</b>':'<b class="bad">niezgłoszony</b>')
+(s.lastPostS!==null?', ostatnia wysyłka '+s.lastPostS+' s temu':'')+(s.lastStatus?' (HTTP '+s.lastStatus+')':'')
+'<br><small>Wysyłka co '+s.pollSeconds+' s, gdy odczyt jest świeży</small>'})}
load();setInterval(load,2000);
</script></body></html>)html";

// GET / (i każda nieznana ścieżka).
void handleRoot()
{
  String page = FPSTR(PAGE_HEAD);
  page += FPSTR(MAIN_PAGE);
  server.sendHeader("Cache-Control", "no-store");
  server.send(200, "text/html; charset=utf-8", page);
}

// GET /state.json: ostatni odczyt (te same pola co wysyłka), liczniki magistrali, sieć.
void handleState()
{
  const uint32_t now = millis();
  JsonDocument state;
  if (hasReading) {
    JsonDocument reading;
    fillPelletJson(reading, latest);
    state["reading"] = reading;
    state["stateName"] = latest.state < 12 ? STATE_NAMES[latest.state] : "?";
    state["ageS"] = (now - readingAtMs) / 1000;
  }
  state["bytes"] = busBytes;
  state["frames"] = validFrames;
  state["sensorFrames"] = sensorFrames;
  state["rejected"] = parser.rejectedCount();
  state["inverted"] = polarity.inverted();
  state["confirmed"] = polarity.confirmed();
  state["wifi"] = WiFi.status() == WL_CONNECTED;
  state["ssid"] = wifiSsid;
  if (WiFi.status() == WL_CONNECTED) {
    state["ip"] = WiFi.localIP().toString();
    state["rssi"] = WiFi.RSSI();
  }
  state["registered"] = registeredThisBoot;
  if (lastPostOkMs) state["lastPostS"] = (now - lastPostOkMs) / 1000;
  else state["lastPostS"] = nullptr;
  state["lastStatus"] = lastPostStatus ? lastPostStatus : lastHttpStatus;
  state["pollSeconds"] = pollSeconds;
  String body;
  serializeJson(state, body);
  server.sendHeader("Cache-Control", "no-store");
  server.send(200, "application/json", body);
}

// Basic Auth stron /install (login z secrets.h).
bool authorized()
{
  if (server.authenticate(INSTALL_USER, INSTALL_PASSWORD)) return true;
  server.requestAuthentication();
  return false;
}

// /install: Wi-Fi, ręczne wgranie firmware (OTA z chmury dla tego rodzaju nie ma), dane sterownika.
void handleInstall()
{
  if (!authorized()) return;
  if (server.method() == HTTP_POST) {
    const String ssid = server.arg("ssid");
    const String password = server.arg("password");
    if (ssid.length() > 0) {
      wifiSsid = ssid;
      preferences.putString(KEY_WIFI_SSID, ssid);
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
  page += "<label>Plik firmware.bin<input name=\"firmware\" type=\"file\" accept=\".bin\" required></label>";
  page += "<p><button type=\"submit\">Wgraj</button></p></form>";
  page += "<div class=\"card\"><div>SN: <b>" + serial + "</b></div>";
  page += "<div>Root ID: <b>" + (rootId.length() ? htmlEscape(rootId) : String("---")) + "</b></div>";
  page += "<div>Zgłoszenie w chmurze: " + String(registeredThisBoot ? "tak" : "nie") + "</div>";
  page += "</div><p><a href=\"/\">Strona główna</a></p></body></html>";
  server.sendHeader("Cache-Control", "no-store");
  server.send(200, "text/html; charset=utf-8", page);
}

// Ręczne wgranie firmware.bin (strona /install albo curl): prosto do nieaktywnej partycji OTA.
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

// Koniec wgrywania: odpowiedź i restart do nowego obrazu.
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

// AP do konfiguracji (10.11.18.1) razem z siecią domową (AP+STA) i strony WWW.
void startNetwork()
{
  WiFi.mode(WIFI_AP_STA);
  WiFi.softAPConfig(AP_ADDRESS, AP_ADDRESS, IPAddress(255, 255, 255, 0));
  accessPointOn = WiFi.softAP(AP_SSID, accessPointPassword());
  logf("AP %s: %s (10.11.18.1)", AP_SSID, accessPointOn ? "uruchomiony" : "NIE uruchomiony");
  if (wifiSsid.length() > 0) {
    logf("Wi-Fi: łączę z %s", wifiSsid.c_str());
    WiFi.begin(wifiSsid.c_str(), wifiPassword.c_str());
  } else {
    logf("Wi-Fi: brak zapisanej sieci (ustaw na /install przez AP)");
  }
  server.on("/", HTTP_GET, handleRoot);
  server.on("/state.json", HTTP_GET, handleState);
  server.on("/install", handleInstall);
  server.on("/install/firmware", HTTP_POST, handleFirmwareDone, handleFirmwareUpload);
  server.onNotFound(handleRoot);
  server.begin();
}

}  // namespace

// Start: konfiguracja z NVS, nasłuch magistrali, sieć. Zgłoszenie i wysyłka w tick().
void setup()
{
  Serial.begin(115200);
  preferences.begin(PREFERENCES_NAMESPACE, false);
  loadConfig();
  serial = readSerial();
  logf("start: firmware %s, SN %s, rootId %s, chmura %s", FW_VERSION, serial.c_str(),
    rootId.length() > 0 ? rootId.c_str() : "brak", CLOUD_URL);
  startBus();
  startNetwork();
  // watchdog zadania pętli: brak esp_task_wdt_reset() przez WATCHDOG_S = restart układu
  esp_task_wdt_init(WATCHDOG_S, true);
  esp_task_wdt_add(nullptr);
}

// Magistrala i strony w każdym obiegu (bufor UART nie może się przepełnić), reszta co 1 s.
void loop()
{
  esp_task_wdt_reset();
  server.handleClient();
  const uint32_t now = millis();
  readBus(now);
  if (now - lastTickMs >= TICK_MS) {
    lastTickMs = now;
    tick(now);
  }
}
