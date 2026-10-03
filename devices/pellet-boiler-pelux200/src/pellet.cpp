// Sterownik pieca Pellux 200 (typ pellet-boiler-pelux200) na osobnej płytce ESP32-C3
// SuperMini z modułem RS-485 HW-519 (CLAUDE.md, punkt 5c; do 2026-10-02 rola firmware co):
// nasłuch magistrali ecoMAX kotła, dekodowanie SensorData (ecomax_frame.*), wysyłka ostatniego
// odczytu co poll_interval_seconds. Polaryzacja magistrali wybierana sama (bus_polarity.hpp).
// Od 1.1.0 (etap 2) sterownik udaje moduł ecoNET (0x56): odpowiada na CheckDevice i
// ProgramVersion, żeby regulator wysyłał mu SensorData (econet.hpp). Nie odpowiada, gdy
// odzywa się fabryczny ecoNET kotła (EconetGuard). Magistralę obsługuje osobne zadanie
// FreeRTOS (busTask), bo odpowiedź musi wyjść od razu, a HTTP blokuje loop() do 8 s.
// Etap 3: po starcie (i na polecenie „p” z konsoli USB) sterownik czyta wszystkie ustawienia
// kotła (boiler_settings.hpp) — linie „SETTINGS …” na konsoli i /boiler-settings.json; to
// kopia na wypadek awarii regulatora. Ustawień nie zapisuje.
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

#include <boiler_settings.hpp>
#include <bus_polarity.hpp>
#include <ecomax_frame.hpp>
#include <econet.hpp>
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
// bufor UART (zapas, gdy zadanie magistrali chwilę nie dostanie procesora)
constexpr size_t RX_BUFFER_BYTES = 4096;
constexpr size_t MAX_BYTES_PER_LOOP = 512;
// Odstęp przed odpowiedzią: regulator po ostatnim bajcie zapytania musi przełączyć swój
// nadajnik na odbiór (bajt przy 115200 bodów to ok. 0,1 ms).
constexpr uint32_t ECONET_REPLY_DELAY_MS = 2;
// Odstęp zapytania o ustawienia od naszej odpowiedzi na CheckDevice (handleEconet).
constexpr uint32_t SETTINGS_QUERY_GAP_MS = 50;
constexpr uint32_t BUS_TASK_STACK = 6144;
constexpr UBaseType_t BUS_TASK_PRIORITY = 2;  // wyżej niż loop() (1)

const IPAddress AP_ADDRESS(10, 11, 18, 1);

const char *const STATE_NAMES[] = {
  "wyłączony", "stabilizacja", "rozpalanie", "praca", "nadzór", "pauza", "czuwanie",
  "wygaszanie", "alarm", "ręczny", "odpieczętowanie", "inny"};

Preferences preferences;
WebServer server(80);
WiFiClientSecure secureClient;
WiFiClient plainClient;
HTTPClient http;

// Stan wspólny zadania magistrali i loop(): odczyt, ramki, stan sieci dla ecoNET — zmiany
// i kopie pod stateLock (sekcja krytyczna, bez wypisywania na konsolę w środku).
portMUX_TYPE stateLock = portMUX_INITIALIZER_UNLOCKED;
EcomaxFrameParser parser;
BusPolarity polarity;
EcomaxSensorData latest;
bool hasReading = false;
uint32_t readingAtMs = 0;
uint32_t busBytes = 0;
uint32_t validFrames = 0;
uint32_t sensorFrames = 0;

// ecoNET (etap 2): osłona adresu 0x56, stan sieci zgłaszany regulatorowi (aktualizowany
// w tick()), zapytania pominięte w czasie nasłuchu albo blokady.
EconetGuard guard;
EconetNetworkInfo networkInfo;
uint32_t econetSkipped = 0;
bool econetAllowed = false;

// Odczyt ustawień kotła (etap 3): zlecany flagą (start, konsola), wykonywany w busTask.
BoilerSettingsReader boilerSettings;
volatile bool boilerSettingsRequested = true;

// Zmiana parametru kotła („set <nr> <wartość>” z konsoli): busTask sprawdza zakres podany przez
// regulator i stan kotła (tylko zatrzymany, stan 0), wysyła 0x33, po potwierdzeniu czyta
// ustawienia od nowa, żeby było widać nową wartość.
BoilerParameterWriter parameterWriter;
volatile bool parameterSetRequested = false;
volatile uint8_t parameterSetIndex = 0;
volatile uint8_t parameterSetValue = 0;

// Podgląd czasów na magistrali („t” z konsoli): przez TRACE_MS każda ramka i każde nasze
// nadanie jako „TRACE <µs> …” — do ustalenia, kiedy regulator słucha.
constexpr uint32_t TRACE_MS = 3000;
volatile uint32_t traceUntilMs = 0;

bool tracing()
{
  return traceUntilMs != 0 && static_cast<int32_t>(traceUntilMs - millis()) > 0;
}

// Nagranie rozmowy z kotłem („r” z konsoli): przez CAPTURE_MS każda poprawna ramka z magistrali
// i każde nasze nadanie w całości, „RAW <ms> RX|TX <hex>”. Z nagrań powstają dane testowe
// (test/fixtures) i symulator kotła (tools/), bo kocioł nie zawsze jest pod ręką.
constexpr uint32_t CAPTURE_MS = 5UL * 60 * 1000;
volatile uint32_t captureUntilMs = 0;

bool capturing()
{
  return captureUntilMs != 0 && static_cast<int32_t>(captureUntilMs - millis()) > 0;
}

void captureFrame(const char *direction, const uint8_t *bytes, size_t length)
{
  if (!capturing()) return;
  Serial.printf("RAW %lu %s ", static_cast<unsigned long>(millis()), direction);
  for (size_t index = 0; index < length; index++) Serial.printf("%02x", bytes[index]);
  Serial.println();
}

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
// co 2 s), 0x89 (panele → wszyscy) i od 1.1.0 SensorData 0x35, najwyżej raz na
// DUMP_INTERVAL_MS dla każdego typu.
// Linia: "DUMP <typ> <nadawca> <ms> <hex>" — do porównania z wartościami na panelu kotła.
constexpr uint32_t DUMP_INTERVAL_MS = 10000;
uint32_t lastDump08Ms = 0;
uint32_t lastDump89Ms = 0;
uint32_t lastDump35Ms = 0;

void dumpFrame(const EcomaxFrame &frame)
{
  uint32_t *last = frame.type == 0x08 ? &lastDump08Ms
    : frame.type == 0x89            ? &lastDump89Ms
    : frame.type == 0x35            ? &lastDump35Ms
                                    : nullptr;
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
  bool added = false;
  portENTER_CRITICAL(&stateLock);
  uint8_t index = 0;
  for (; index < frameKindCount; index++) {
    FrameKind &kind = frameKinds[index];
    if (kind.type == frame.type && kind.sender == frame.sender && kind.recipient == frame.recipient) {
      kind.count++;
      kind.lastLength = static_cast<uint16_t>(frame.dataLength);
      break;
    }
  }
  if (index == frameKindCount && frameKindCount < MAX_FRAME_KINDS) {
    frameKinds[frameKindCount++] = {frame.type, frame.sender, frame.recipient, 1, static_cast<uint16_t>(frame.dataLength)};
    added = true;
  }
  portEXIT_CRITICAL(&stateLock);
  if (!added) return;
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

// UART1: odbiór GPIO21, nadawanie GPIO20; invert odwraca sygnał w obu kierunkach, gdy
// przewody A/B są zamienione.
void startBus()
{
  Serial1.end();
  Serial1.setRxBufferSize(RX_BUFFER_BYTES);
  Serial1.begin(ECOMAX_BAUD, SERIAL_8N1, ECOMAX_RX_PIN, ECOMAX_TX_PIN, polarity.inverted());
  logf("magistrala: odbiór GPIO%d, nadawanie GPIO%d, %lu bodów, sygnał %s", ECOMAX_RX_PIN, ECOMAX_TX_PIN,
    static_cast<unsigned long>(ECOMAX_BAUD), polarity.inverted() ? "odwrócony" : "normalny");
}

// Stan odpowiedzi ecoNET do strony i konsoli.
const char *econetStateText(uint32_t nowMs)
{
  if (guard.blocked(nowMs)) {
    return guard.blockReason() == EconetBlockReason::COLLISIONS ? "wstrzymany: kolizje na magistrali"
                                                                : "wstrzymany: odzywa się inny moduł ecoNET";
  }
  if (!polarity.confirmed()) return "czeka na poprawne ramki";
  if (!guard.mayTransmit(nowMs)) return "nasłuch przed nadawaniem";
  return "odpowiada";
}

// Odpowiedź z ustawieniami: jedna linia „SETTINGS <nazwa> <ms> <hex>” na konsoli.
void logSettingsResponse(uint8_t item)
{
  Serial.printf("SETTINGS %s %lu ", BOILER_SETTINGS_REQUESTS[item].name,
    static_cast<unsigned long>(boilerSettings.receivedAtMs(item)));
  const uint8_t *data = boilerSettings.data(item);
  for (size_t index = 0; index < boilerSettings.length(item); index++) Serial.printf("%02x", data[index]);
  Serial.println();
}

// Zlecona z konsoli zmiana parametru: tylko przy świeżym odczycie z kotłem zatrzymanym (stan 0)
// i wartości w zakresie min–max z ostatniego odczytu ustawień.
void startParameterSet(uint32_t nowMs)
{
  if (!parameterSetRequested || parameterWriter.busy()) return;
  parameterSetRequested = false;
  const uint8_t index = parameterSetIndex;
  const uint8_t value = parameterSetValue;
  uint8_t current, min, max;
  if (!ecomaxParameterValues(boilerSettings, index, current, min, max)) {
    logf("parametr kotła nr %u: brak w odczycie ustawień (najpierw „p”), nie zmieniam", index);
    return;
  }
  if (value < min || value > max) {
    logf("parametr kotła nr %u: %u poza zakresem %u–%u, nie zmieniam", index, value, min, max);
    return;
  }
  if (!hasReading || nowMs - readingAtMs >= READING_MAX_AGE_MS || latest.state != 0) {
    logf("parametr kotła nr %u: kocioł nie jest zatrzymany (stan %u) albo brak świeżego odczytu, nie zmieniam",
      index, hasReading ? latest.state : 255);
    return;
  }
  if (current == value) {
    logf("parametr kotła nr %u ma już wartość %u", index, value);
    return;
  }
  parameterWriter.start(index, value);
  logf("parametr kotła nr %u: %u → %u (zakres %u–%u), wysyłam", index, current, value, min, max);
}

// Ramka od 0x56 (echo albo fabryczny ecoNET), odpowiedź regulatora z ustawieniami
// i odpowiedź na zapytanie regulatora do 0x56 (z doklejonym zapytaniem o ustawienia).
void handleEconet(const EcomaxFrame &frame, uint32_t nowMs)
{
  if (frame.sender == ECONET_ADDRESS) {
    if (!guard.onEconetFrame(frame, millis())) {
      logf("ecoNET: ramka typu 0x%02x od 0x56, która nie jest naszą — inny moduł ecoNET, cisza na %lu min",
        frame.type, static_cast<unsigned long>(EconetGuard::BLOCK_MS / 60000));
    }
    return;
  }
  if (frame.recipient != ECONET_ADDRESS && frame.recipient != ECOMAX_ADDRESS_BROADCAST) return;
  if (parameterWriter.onResponse(frame)) {
    logf("parametr kotła nr %u = %u: regulator potwierdził, czytam ustawienia od nowa",
      parameterWriter.index(), parameterWriter.value());
    boilerSettingsRequested = true;
    return;
  }
  const int8_t item = boilerSettings.current();
  portENTER_CRITICAL(&stateLock);
  const bool stored = boilerSettings.onResponse(frame, nowMs);
  portEXIT_CRITICAL(&stateLock);
  if (stored) {
    logf("ustawienia kotła: %s, %u B", BOILER_SETTINGS_REQUESTS[item].name,
      static_cast<unsigned>(boilerSettings.length(item)));
    logSettingsResponse(item);
    if (!boilerSettings.busy()) logf("ustawienia kotła: koniec odczytu (bez odpowiedzi: %lu)",
      static_cast<unsigned long>(boilerSettings.failed()));
    return;
  }
  if (frame.recipient != ECONET_ADDRESS) return;
  EconetNetworkInfo network;
  portENTER_CRITICAL(&stateLock);
  network = networkInfo;
  portEXIT_CRITICAL(&stateLock);
  uint8_t reply[ECONET_MAX_FRAME];
  const size_t length = buildEconetResponse(frame, network, reply, sizeof(reply));
  if (length == 0) return;
  if (!polarity.confirmed() || !guard.mayTransmit(nowMs)) {
    econetSkipped++;
    return;
  }
  // Zapytanie o ustawienia tylko za odpowiedzią na CheckDevice (regulator oddał nam magistralę).
  size_t queryLength = 0;
  uint8_t query[ECONET_MAX_FRAME];
  if (frame.type == ECOMAX_FRAME_CHECK_DEVICE) {
    startParameterSet(nowMs);
    if (parameterWriter.busy()) {
      queryLength = parameterWriter.nextRequest(nowMs, query, sizeof(query));
    } else {
      if (boilerSettingsRequested && !boilerSettings.busy()) {
        boilerSettingsRequested = false;
        boilerSettings.start();
        logf("ustawienia kotła: początek odczytu");
      }
      queryLength = boilerSettings.nextRequest(nowMs, query, sizeof(query));
    }
  }
  vTaskDelay(pdMS_TO_TICKS(ECONET_REPLY_DELAY_MS));
  Serial1.write(reply, length);
  captureFrame("TX", reply, length);
  if (tracing()) {
    Serial.printf("TRACE %lu TX typ 0x%02x %u B\n", static_cast<unsigned long>(micros()), reply[7],
      static_cast<unsigned>(length));
  }
  guard.onTransmitted(reply, length, millis(), parser.rejectedCount());
  if (queryLength == 0) return;
  // Zapytanie osobno, SETTINGS_QUERY_GAP_MS po odpowiedzi: doklejone tuż za nią regulator
  // pomijał (2026-10-03). Okno adresu 0x56 trwa ok. 300 ms, więc to wciąż nasza kolej;
  // gdy ktoś w tym czasie nadaje, zapytanie czeka na następne CheckDevice.
  vTaskDelay(pdMS_TO_TICKS(SETTINGS_QUERY_GAP_MS));
  if (Serial1.available() > 0) {
    if (parameterWriter.busy()) parameterWriter.cancelRequest();
    else boilerSettings.cancelRequest();
    return;
  }
  Serial1.write(query, queryLength);
  captureFrame("TX", query, queryLength);
  if (tracing()) {
    Serial.printf("TRACE %lu TX typ 0x%02x %u B (zapytanie)\n", static_cast<unsigned long>(micros()), query[7],
      static_cast<unsigned>(queryLength));
  }
  guard.onTransmitted(query, queryLength, millis(), parser.rejectedCount());
}

// Bajty z UART1 do parsera; każda poprawna ramka potwierdza polaryzację, SensorData to odczyt.
// Wołane tylko z busTask.
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
      // cała ramka: dane leżą w buforze parsera zaraz za 8 bajtami nagłówka
      captureFrame("RX", frame.data - 8, frame.dataLength + 10);
      if (tracing()) {
        Serial.printf("TRACE %lu RX typ 0x%02x 0x%02x->0x%02x %u B\n", static_cast<unsigned long>(micros()),
          frame.type, frame.sender, frame.recipient, static_cast<unsigned>(frame.dataLength));
      }
      recordFrameKind(frame);
      handleEconet(frame, nowMs);
      if (!isSensorDataFrame(frame)) continue;
      EcomaxSensorData decoded;
      if (!decodeSensorData(frame.data, frame.dataLength, decoded)) continue;
      portENTER_CRITICAL(&stateLock);
      latest = decoded;
      hasReading = true;
      readingAtMs = nowMs;
      sensorFrames++;
      portEXIT_CRITICAL(&stateLock);
    }
  }
  guard.update(millis(), parser.rejectedCount());
  const bool writing = parameterWriter.busy();
  parameterWriter.update(millis());
  if (writing && parameterWriter.result() == BoilerParameterWriter::Result::FAILED) {
    logf("parametr kotła nr %u: brak potwierdzenia po %u próbach — sprawdź wartość na panelu",
      parameterWriter.index(), static_cast<unsigned>(BoilerParameterWriter::ATTEMPTS));
    boilerSettingsRequested = true;
  }
  const int8_t settingsItem = boilerSettings.current();
  const uint32_t settingsFailed = boilerSettings.failed();
  boilerSettings.update(millis());
  if (boilerSettings.failed() != settingsFailed) {
    logf("ustawienia kotła: brak odpowiedzi na %s po %u próbach", BOILER_SETTINGS_REQUESTS[settingsItem].name,
      static_cast<unsigned>(BoilerSettingsReader::ATTEMPTS));
    if (!boilerSettings.busy()) logf("ustawienia kotła: koniec odczytu (bez odpowiedzi: %lu)",
      static_cast<unsigned long>(boilerSettings.failed()));
  }
  const bool allowed = polarity.confirmed() && guard.mayTransmit(nowMs);
  if (allowed != econetAllowed) {
    econetAllowed = allowed;
    logf("ecoNET: %s", econetStateText(nowMs));
  }
  if (polarity.update(nowMs)) {
    logf("magistrala: bajty bez poprawnych ramek, odwracam sygnał (zmiana %lu)",
      static_cast<unsigned long>(polarity.switches()));
    startBus();
  }
}

// Zadanie magistrali: czyta bez przerwy (co 1 ms), także gdy loop() czeka na HTTP.
void busTask(void *)
{
  esp_task_wdt_add(nullptr);
  for (;;) {
    esp_task_wdt_reset();
    readBus(millis());
    vTaskDelay(1);
  }
}

// Kopia ostatniego odczytu (false, gdy go nie ma albo jest starszy niż READING_MAX_AGE_MS).
bool freshReading(EcomaxSensorData &out)
{
  portENTER_CRITICAL(&stateLock);
  const bool fresh = hasReading && millis() - readingAtMs < READING_MAX_AGE_MS;
  if (fresh) out = latest;
  portEXIT_CRITICAL(&stateLock);
  return fresh;
}

bool readingFresh()
{
  EcomaxSensorData ignored;
  return freshReading(ignored);
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
void sendReading(uint32_t nowMs, const EcomaxSensorData &reading)
{
  JsonDocument document;
  fillPelletJson(document, reading);
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
    polarity.confirmed() ? "" : " (niepotwierdzony)", readingFresh() ? "świeży" : "brak");
  logf("ecoNET: %s, odpowiedzi %lu, echo %lu, pominięte %lu, obce ramki %lu, kolizje %lu", econetStateText(nowMs),
    static_cast<unsigned long>(guard.transmitted()), static_cast<unsigned long>(guard.echoes()),
    static_cast<unsigned long>(econetSkipped), static_cast<unsigned long>(guard.foreignFrames()),
    static_cast<unsigned long>(guard.collisions()));
  EcomaxSensorData reading;
  if (freshReading(reading)) {
    JsonDocument document;
    fillPelletJson(document, reading);
    String json;
    serializeJson(document, json);
    Serial.printf("          odczyt: %s\n", json.c_str());
  }
  FrameKind kinds[MAX_FRAME_KINDS];
  portENTER_CRITICAL(&stateLock);
  const uint8_t kindCount = frameKindCount;
  memcpy(kinds, frameKinds, sizeof(FrameKind) * kindCount);
  portEXIT_CRITICAL(&stateLock);
  for (uint8_t index = 0; index < kindCount; index++) {
    const FrameKind &kind = kinds[index];
    Serial.printf("          ramki: typ 0x%02x od 0x%02x do 0x%02x: %lu szt., ostatnio %u B\n", kind.type, kind.sender,
      kind.recipient, static_cast<unsigned long>(kind.count), static_cast<unsigned>(kind.lastLength));
  }
}

// Stan sieci, który ecoNET zgłasza regulatorowi w DeviceAvailable (menu ecoNET na panelu).
void updateNetworkInfo()
{
  EconetNetworkInfo info;
  info.wifiConnected = WiFi.status() == WL_CONNECTED;
  if (info.wifiConnected) {
    const IPAddress ip = WiFi.localIP();
    const IPAddress mask = WiFi.subnetMask();
    const IPAddress gateway = WiFi.gatewayIP();
    for (uint8_t i = 0; i < 4; i++) {
      info.ip[i] = ip[i];
      info.netmask[i] = mask[i];
      info.gateway[i] = gateway[i];
    }
    info.signalPercent = signalPercentFromRssi(WiFi.RSSI());
  }
  info.cloudConnected = registeredThisBoot && (lastPostStatus == 0 || (lastPostStatus >= 200 && lastPostStatus < 300));
  strlcpy(info.ssid, wifiSsid.c_str(), sizeof(info.ssid));
  portENTER_CRITICAL(&stateLock);
  networkInfo = info;
  portEXIT_CRITICAL(&stateLock);
}

// Co 1 s: AP, stan sieci dla ecoNET, zgłoszenie (co 30 s do skutku), wysyłka świeżego
// odczytu co pollSeconds.
void tick(uint32_t nowMs)
{
  updateAccessPoint(nowMs);
  updateNetworkInfo();
  logStatus(nowMs);
  if (WiFi.status() != WL_CONNECTED) return;
  if (!registeredThisBoot) {
    if (lastRegisterAttemptMs == 0 || nowMs - lastRegisterAttemptMs >= REGISTER_RETRY_MS) registerDevice();
    if (!registeredThisBoot) return;
  }
  EcomaxSensorData reading;
  if (static_cast<int32_t>(nowMs - nextPostMs) >= 0 && freshReading(reading)) sendReading(nowMs, reading);
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
+'<br>ecoNET (0x56): <b>'+s.econet+'</b><br><small>odpowiedzi '+s.econetTx+', echo '+s.econetEcho
+', obce ramki '+s.econetForeign+', kolizje '+s.econetCollisions+'</small>'
+'<br>Ustawienia kotła: <b>'+s.settingsRead+'/5</b>'+(s.settingsBusy?' (odczyt trwa)':'')
+' <a href="/boiler-settings.json" download>pobierz</a>'
+'<br><small>Odbiór GPIO21, nadawanie GPIO20, 115200 bodów</small>';
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
  JsonDocument state;
  EcomaxSensorData last;
  portENTER_CRITICAL(&stateLock);
  const bool have = hasReading;
  const uint32_t at = readingAtMs;
  if (have) last = latest;
  portEXIT_CRITICAL(&stateLock);
  const uint32_t now = millis();
  if (have) {
    JsonDocument reading;
    fillPelletJson(reading, last);
    state["reading"] = reading;
    state["stateName"] = last.state < 12 ? STATE_NAMES[last.state] : "?";
    state["ageS"] = (now - at) / 1000;
  }
  uint8_t settingsRead = 0;
  for (uint8_t item = 0; item < BOILER_SETTINGS_COUNT; item++) settingsRead += boilerSettings.has(item) ? 1 : 0;
  state["settingsRead"] = settingsRead;
  state["settingsBusy"] = boilerSettings.busy();
  state["econet"] = econetStateText(now);
  state["econetTx"] = guard.transmitted();
  state["econetEcho"] = guard.echoes();
  state["econetForeign"] = guard.foreignFrames();
  state["econetCollisions"] = guard.collisions();
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

// GET /boiler-settings.json: surowe odpowiedzi regulatora z ustawieniami (hex, dane ramki bez
// nagłówka) — kopia na wypadek awarii; dekodowanie opisuje docs/kociol-ustawienia.md.
void handleBoilerSettings()
{
  static uint8_t copy[BoilerSettingsReader::MAX_DATA];
  JsonDocument document;
  document["firmware"] = FW_VERSION;
  document["busy"] = boilerSettings.busy();
  for (uint8_t item = 0; item < BOILER_SETTINGS_COUNT; item++) {
    size_t length = 0;
    uint32_t at = 0;
    portENTER_CRITICAL(&stateLock);
    const bool has = boilerSettings.has(item);
    if (has) {
      length = boilerSettings.length(item);
      at = boilerSettings.receivedAtMs(item);
      memcpy(copy, boilerSettings.data(item), length);
    }
    portEXIT_CRITICAL(&stateLock);
    if (!has) continue;
    String hex;
    hex.reserve(length * 2);
    char pair[3];
    for (size_t index = 0; index < length; index++) {
      snprintf(pair, sizeof(pair), "%02x", copy[index]);
      hex += pair;
    }
    JsonObject entry = document[BOILER_SETTINGS_REQUESTS[item].name].to<JsonObject>();
    entry["type"] = BOILER_SETTINGS_REQUESTS[item].type | 0x80;
    entry["ageS"] = (millis() - at) / 1000;
    entry["hex"] = hex;
  }
  String body;
  serializeJson(document, body);
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
  server.on("/boiler-settings.json", HTTP_GET, handleBoilerSettings);
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
  // watchdog pętli i zadania magistrali: brak esp_task_wdt_reset() przez WATCHDOG_S = restart
  esp_task_wdt_init(WATCHDOG_S, true);
  esp_task_wdt_add(nullptr);
  startBus();
  guard.begin(millis());
  xTaskCreate(busTask, "bus", BUS_TASK_STACK, nullptr, BUS_TASK_PRIORITY, nullptr);
  startNetwork();
}

// Strony WWW w każdym obiegu, reszta co 1 s (magistrala w busTask).
void loop()
{
  esp_task_wdt_reset();
  server.handleClient();
  // Konsola USB: litery p / t / r od razu, „set <nr> <wartość>” zakończone Enterem.
  static char consoleLine[32];
  static uint8_t consoleLength = 0;
  while (Serial.available() > 0) {
    const int command = Serial.read();
    if (consoleLength > 0 || command == 's' || command == 'S') {
      if (command == '\n' || command == '\r') {
        consoleLine[consoleLength] = '\0';
        consoleLength = 0;
        unsigned index, value;
        if (sscanf(consoleLine, "set %u %u", &index, &value) == 2 && index < 256 && value < 256) {
          parameterSetIndex = static_cast<uint8_t>(index);
          parameterSetValue = static_cast<uint8_t>(value);
          parameterSetRequested = true;
          logf("parametr kotła nr %u → %u: zlecone, czekam na okno ecoNET", index, value);
        } else {
          logf("konsola: nieznane polecenie „%s” (set <nr> <wartość>)", consoleLine);
        }
      } else if (consoleLength + 1 < sizeof(consoleLine)) {
        consoleLine[consoleLength++] = static_cast<char>(command);
      }
      continue;
    }
    if (command == 'p' || command == 'P') {
      boilerSettingsRequested = true;
      logf("ustawienia kotła: odczyt zlecony z konsoli");
    } else if (command == 't' || command == 'T') {
      traceUntilMs = millis() + TRACE_MS;
    } else if (command == 'r' || command == 'R') {
      captureUntilMs = millis() + CAPTURE_MS;
      logf("nagranie magistrali: %lu min", static_cast<unsigned long>(CAPTURE_MS / 60000));
    }
  }
  const uint32_t now = millis();
  if (now - lastTickMs >= TICK_MS) {
    lastTickMs = now;
    tick(now);
  }
}
