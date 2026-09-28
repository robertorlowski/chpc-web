#pragma once

#include <Arduino.h>
#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <WebSocketsClient.h>

// Klient chmury chpc-web (https://chpc-web.onrender.com/api/): POST JSON
// (hp/add, pv/add) z ?deviceId=<SN>[&rootId=<id>], rejestracja
// (devices/register) i WebSocket /ws?rootId=… Komunikat {type:"operation"}
// tylko ustawia flagę; POST wykonuje main.cpp, gdy magistrala jest wolna.
class CloudClient {
public:
  void begin();
  // Ponowne łączenie Wi-Fi co 10 s i obsługa WebSocketu; wołane w loop().
  void tick();
  // True raz po komunikacie WebSocket "operation": wyślij /hp/add od razu.
  bool takeOperationRequest();
  // True while the controller has no rootId and the retry delay has passed.
  // registerDevice() blocks for a whole HTTP request, so the caller runs it
  // only when the serial bus is idle.
  bool registrationDue() const;
  void registerDevice();
  // Blokujący POST; zwraca treść odpowiedzi 2xx, a w każdym innym przypadku "".
  // Odpowiedź 409 kasuje Root ID i uruchamia ponowną rejestrację.
  String post(const String &path, const JsonDocument &data);
  int lastHttpStatus() const;
  // Any HTTP status, errors included, proves the internet is reachable.
  bool lastRequestAnswered() const;
  unsigned long lastAnswerAt() const;
  uint32_t requestErrorCount() const;
  uint32_t webSocketDisconnectCount() const;

private:
  static CloudClient *instance;
  static void handleWebSocketEvent(
    WStype_t type, uint8_t *payload, size_t length);

  void startWebSocket();
  String send(const String &url, const JsonDocument &data);

  HTTPClient http;
  WebSocketsClient webSocket;
  bool webSocketStarted = false;
  bool operationRequested = false;
  bool registrationAttempted = false;
  unsigned long lastRegistrationAt = 0;
  unsigned long lastWifiReconnectAt = 0;
  int httpStatus = 0;
  bool answered = false;
  unsigned long answeredAt = 0;
  uint32_t requestErrors = 0;
  uint32_t webSocketDisconnects = 0;
};
