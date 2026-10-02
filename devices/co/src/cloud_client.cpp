// Komunikacja z chpc-web: HTTPS (hp/add, pv/add, devices/register) i WebSocket.
// Kontrakt: CLAUDE.md, punkty 3 (rejestracja, 404/409) i 8 (WebSocket).
// Certyfikat serwera nie jest weryfikowany (brak CA w kliencie).
#include <cloud_client.hpp>

#include <WiFi.h>
#include <device_config.hpp>

namespace {
constexpr const char *CLOUD_HOST = "chpc-web.onrender.com";
constexpr const char *CLOUD_BASE_URL = "https://chpc-web.onrender.com/api/";

// The main loop is blocked for the whole request, so the timeouts must cover
// a TLS handshake plus a slow response without stalling the pump bus for
// minutes. A cold-started instance misses one cycle and is picked up by the
// next one.
constexpr int32_t CONNECT_TIMEOUT_MS = 5000;
constexpr uint16_t RESPONSE_TIMEOUT_MS = 5000;

// A failed registration is retried at this pace, so an unreachable cloud
// costs one blocked request a minute instead of stalling every loop.
constexpr unsigned long REGISTRATION_RETRY_MS = 60000;

String rootIdQuery()
{
  return String("rootId=") + deviceConfig().rootId;
}

// The serial always goes along: the server resolves the device from it when
// there is no rootId yet and rejects a rootId that belongs to another serial.
String deviceQuery()
{
  String query = String("deviceId=") + deviceSerial();
  if (deviceRegistered()) query += String("&") + rootIdQuery();
  return query;
}

String cloudUrl(const String &normalizedPath)
{
  const char separator = normalizedPath.indexOf('?') >= 0 ? '&' : '?';
  return String(CLOUD_BASE_URL) + normalizedPath + separator + deviceQuery();
}

// The server answers a rootId that does not match the serial with 409.
constexpr int HTTP_CONFLICT = 409;
}

CloudClient *CloudClient::instance = nullptr;

void CloudClient::begin()
{
  instance = this;
  if (deviceRegistered()) startWebSocket();
}

// The WebSocket path carries the rootId, so an unregistered controller opens
// it only once the registration has produced one.
void CloudClient::startWebSocket()
{
  String webSocketPath = String("/ws?") + rootIdQuery();
  webSocket.beginSSL(CLOUD_HOST, 443, webSocketPath.c_str());
  webSocket.onEvent(handleWebSocketEvent);
  webSocket.setReconnectInterval(10000);
  webSocketStarted = true;
}

void CloudClient::tick()
{
  if (WiFi.status() != WL_CONNECTED) {
    unsigned long now = millis();
    if (now - lastWifiReconnectAt >= 10000) {
      lastWifiReconnectAt = now;
      WiFi.reconnect();
    }
    return;
  }
  if (!webSocketStarted && deviceRegistered()) startWebSocket();
  if (webSocketStarted) webSocket.loop();
}

void CloudClient::stopWebSocket()
{
  if (!webSocketStarted) return;
  webSocket.disconnect();
  webSocketStarted = false;
}

// Zgłoszenie jest potrzebne, gdy w tym uruchomieniu nie było udanego z bieżącym
// adresem: po starcie (registeredIp = 0.0.0.0), po zmianie IP i po 409.
bool CloudClient::registrationDue() const
{
  return WiFi.status() == WL_CONNECTED && !(registeredIp == WiFi.localIP())
    && (!registrationAttempted
      || millis() - lastRegistrationAt >= REGISTRATION_RETRY_MS);
}

String CloudClient::sendRegistration(const char *deviceType, const char *name, IPAddress &sentIp)
{
  const String &serial = deviceSerial();
  if (serial.length() == 0) return "";

  sentIp = WiFi.localIP();
  JsonDocument request;
  request["deviceType"] = deviceType;
  request["deviceId"] = serial;
  if (name) request["name"] = name;
  request["ip"] = sentIp.toString();
  return send(String(CLOUD_BASE_URL) + "devices/register", request);
}

void CloudClient::registerDevice()
{
  registrationAttempted = true;
  lastRegistrationAt = millis();

  // Pompa zgłasza się bez nazwy (nadaje ją użytkownik).
  IPAddress sentIp;
  String response = sendRegistration("heat_pump", nullptr, sentIp);
  if (response.length() == 0) return;

  JsonDocument reply;
  if (deserializeJson(reply, response)) {
    requestErrors++;
    return;
  }
  // The same serial always gets the same rootId back, so a controller whose
  // NVS was wiped reattaches to its existing cloud record. Inny rootId niż
  // zapisany (np. stary z secrets.h) jest podmieniany, a WebSocket otwierany
  // ponownie z nowym (tick()).
  String rootId = reply["rootId"] | "";
  if (rootId.length() == 0) {
    requestErrors++;
    return;
  }
  if (rootId != deviceConfig().rootId) {
    if (!saveRootId(rootId)) {
      requestErrors++;
      return;
    }
    stopWebSocket();
  }
  registeredIp = sentIp;
}

bool CloudClient::pelletRegistrationDue() const
{
  return WiFi.status() == WL_CONNECTED && !(pelletRegisteredIp == WiFi.localIP())
    && (!pelletRegistrationAttempted
      || millis() - lastPelletRegistrationAt >= REGISTRATION_RETRY_MS);
}

// Ten sam SN co pompa, inny deviceType: serwer zwraca osobny rootId.
void CloudClient::registerPelletBoiler()
{
  pelletRegistrationAttempted = true;
  lastPelletRegistrationAt = millis();

  IPAddress sentIp;
  String response = sendRegistration("pellet-boiler-pelux200", "Piec Pellux 200", sentIp);
  if (response.length() == 0) return;

  JsonDocument reply;
  if (deserializeJson(reply, response)) {
    requestErrors++;
    return;
  }
  String rootId = reply["rootId"] | "";
  if (rootId.length() == 0
    || (rootId != deviceConfig().pelletRootId && !savePelletRootId(rootId))) {
    requestErrors++;
    return;
  }
  JsonVariantConst poll = reply["settings"]["poll_interval_seconds"];
  if (poll.is<uint32_t>()) savePelletPollSeconds(poll.as<uint32_t>());
  pelletRegisteredIp = sentIp;
}

bool CloudClient::postPelletBoiler(const JsonDocument &data)
{
  if (!pelletRegistered() || deviceSerial().length() == 0) return false;

  String url = String(CLOUD_BASE_URL) + "pellet-boiler-pelux200/add?deviceId="
    + deviceSerial() + "&rootId=" + deviceConfig().pelletRootId;
  String response = send(url, data);

  if (httpStatus == HTTP_CONFLICT || httpStatus == 404) {
    // Root ID pieca nie pasuje do SN albo serwer go nie zna: rejestracja od nowa.
    clearPelletRootId();
    pelletRegistrationAttempted = false;
    pelletRegisteredIp = IPAddress();
    return false;
  }
  if (httpStatus < 200 || httpStatus >= 300) return false;

  JsonDocument reply;
  if (response.length() > 0 && !deserializeJson(reply, response)) {
    JsonVariantConst poll = reply["poll_interval_seconds"];
    // Wartość spoza 30..3600 jest ignorowana przez savePelletPollSeconds.
    if (poll.is<uint32_t>()) savePelletPollSeconds(poll.as<uint32_t>());
  }
  return true;
}

bool CloudClient::takeOperationRequest()
{
  bool requested = operationRequested;
  operationRequested = false;
  return requested;
}

String CloudClient::post(const String &path, const JsonDocument &data)
{
  // Without a rootId the serial alone identifies the controller, so only a
  // controller that cannot read its own MAC has nothing to send with.
  if (!deviceRegistered() && deviceSerial().length() == 0) return "";

  String normalizedPath = path;
  while (normalizedPath.startsWith("/")) normalizedPath.remove(0, 1);
  String response = send(cloudUrl(normalizedPath), data);

  if (httpStatus == HTTP_CONFLICT && deviceRegistered()) {
    // The stored rootId belongs to another device. Forgetting it lets the
    // registration fetch the right one; the WebSocket reopens with it.
    clearRootId();
    registrationAttempted = false;
    registeredIp = IPAddress();
    stopWebSocket();
  }
  return response;
}

String CloudClient::send(const String &url, const JsonDocument &data)
{
  if (WiFi.status() != WL_CONNECTED) {
    httpStatus = 0;
    answered = false;
    requestErrors++;
    return "";
  }

  if (!http.begin(url)) {
    httpStatus = 0;
    answered = false;
    requestErrors++;
    return "";
  }
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Cache-Control", "no-cache");
  http.setConnectTimeout(CONNECT_TIMEOUT_MS);
  http.setTimeout(RESPONSE_TIMEOUT_MS);

  String payload;
  serializeJson(data, payload);
  httpStatus = http.POST(payload);
  // HTTPClient reports connection and timeout failures as negative codes.
  answered = httpStatus > 0;
  if (answered) answeredAt = millis();

  String response;
  if (httpStatus >= 200 && httpStatus < 300) {
    response = http.getString();
  } else {
    requestErrors++;
  }
  http.end();
  return response;
}

int CloudClient::lastHttpStatus() const
{
  return httpStatus;
}

bool CloudClient::lastRequestAnswered() const
{
  return answered;
}

unsigned long CloudClient::lastAnswerAt() const
{
  return answeredAt;
}

uint32_t CloudClient::requestErrorCount() const
{
  return requestErrors;
}

uint32_t CloudClient::webSocketDisconnectCount() const
{
  return webSocketDisconnects;
}

void CloudClient::handleWebSocketEvent(
  WStype_t type, uint8_t *payload, size_t length)
{
  if (instance == nullptr) return;

  switch (type) {
    case WStype_CONNECTED:
      // Powitanie; serwer rozpoznaje urządzenie po rootId w ścieżce.
      instance->webSocket.sendTXT("ESP32");
      break;
    case WStype_TEXT:
    {
      JsonDocument message;
      DeserializationError error = deserializeJson(message, payload, length);
      if (!error
        && message["type"] == "operation"
        && message["rootId"] == deviceConfig().rootId.c_str())
        instance->operationRequested = true;
      break;
    }
    case WStype_DISCONNECTED:
      instance->webSocketDisconnects++;
      break;
    default:
      break;
  }
}
