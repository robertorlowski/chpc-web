// Odpowiedzi modułu ecoNET na magistrali ecoMAX (etap 2, bez Arduino, testowane w test_econet).
// Regulator co 2 s pyta adres ecoNET (0x56) ramką CheckDevice (0x30); dopiero gdy ktoś się
// zgłosi ramką DeviceAvailable (0xB0), zaczyna wysyłać mu SensorData (0x35) z pełnym stanem
// kotła. Format według biblioteki PyPlumIO (frames/__init__.py, structures/network_info.py,
// structures/program_version.py). Sterownik nadaje wyłącznie w odpowiedzi na zapytania
// skierowane do 0x56 — nigdy z własnej inicjatywy — więc nie wchodzi w cudzą transmisję.
//
// W kotle jest fabryczny moduł ecoNET, dziś wyłączony, ale może zostać włączony (2026-10-03).
// Dwa urządzenia pod 0x56 zderzałyby się na magistrali, dlatego EconetGuard ustępuje mu
// miejsca: nadawanie dopiero po minucie samego nasłuchu i wstrzymanie na 30 min po każdej
// obcej ramce od 0x56 albo po serii kolizji.
#pragma once

#include <cstddef>
#include <cstdint>

#include <ecomax_frame.hpp>

constexpr uint8_t ECONET_ADDRESS = 0x56;
// typ i wersja nadawcy w nagłówku ramki (ECONET_TYPE i ECONET_VERSION w PyPlumIO)
constexpr uint8_t ECONET_SENDER_TYPE = 48;
constexpr uint8_t ECONET_PROTOCOL_VERSION = 5;

constexpr uint8_t ECOMAX_FRAME_CHECK_DEVICE = 0x30;
constexpr uint8_t ECOMAX_FRAME_PROGRAM_VERSION = 0x40;
constexpr uint8_t ECOMAX_FRAME_DEVICE_AVAILABLE = 0xB0;
constexpr uint8_t ECOMAX_FRAME_PROGRAM_VERSION_RESPONSE = 0xC0;

// Największa ramka, jaką budujemy (DeviceAvailable z SSID do 32 znaków).
constexpr size_t ECONET_MAX_FRAME = 80;

// Stan sieci, który ecoNET zgłasza regulatorowi (regulator pokazuje go w menu ecoNET).
struct EconetNetworkInfo {
  uint8_t ip[4] = {0, 0, 0, 0};
  uint8_t netmask[4] = {255, 255, 255, 0};
  uint8_t gateway[4] = {0, 0, 0, 0};
  bool wifiConnected = false;
  bool cloudConnected = false;
  // jakość sygnału 0–100 %
  uint8_t signalPercent = 0;
  char ssid[33] = "";
};

// Składa ramkę: 0x68, długość (LE, cała ramka), odbiorca, nadawca 0x56, typ i wersja nadawcy,
// typ ramki, dane, BCC (XOR wszystkich wcześniejszych bajtów), 0x16. Zwraca długość albo 0.
size_t buildEconetFrame(uint8_t recipient, uint8_t frameType, const uint8_t *data, size_t dataLength,
  uint8_t *out, size_t outSize);

// Odpowiedź na zapytanie regulatora do ecoNET (CheckDevice albo ProgramVersion). Zwraca
// długość ramki w out, 0 gdy ramka nie jest zapytaniem do 0x56, na które odpowiadamy.
size_t buildEconetResponse(const EcomaxFrame &request, const EconetNetworkInfo &network, uint8_t *out,
  size_t outSize);

// RSSI [dBm] → jakość sygnału 0–100 % (−100 dBm = 0, −50 dBm = 100).
uint8_t signalPercentFromRssi(int rssi);

// Powód wstrzymania nadawania.
enum class EconetBlockReason : uint8_t { NONE, FOREIGN_FRAME, COLLISIONS };

// Osłona adresu 0x56 przed fabrycznym modułem ecoNET. Ramka od 0x56 jest echem, gdy jest
// identyczna z jedną z dwóch ostatnich naszych i przyszła w ECHO_WINDOW_MS od nadania (HW-519 może słyszeć
// własne nadawanie); każda inna to obcy moduł. Kolizja = ramki odrzucone przez parser w oknie
// echa bez naszego echa (dwa urządzenia nadały naraz i oba sygnały się zniekształciły).
class EconetGuard {
public:
  static constexpr uint32_t LISTEN_BEFORE_TX_MS = 60000;
  static constexpr uint32_t BLOCK_MS = 30UL * 60 * 1000;
  static constexpr uint32_t ECHO_WINDOW_MS = 100;
  static constexpr uint8_t COLLISIONS_TO_BLOCK = 3;

  // Początek nasłuchu (start sterownika).
  void begin(uint32_t nowMs);
  // Czy wolno teraz odpowiedzieć regulatorowi.
  bool mayTransmit(uint32_t nowMs) const;
  bool blocked(uint32_t nowMs) const;
  // Po wysłaniu ramki; rejectedCount = licznik odrzuconych ramek parsera w chwili nadania.
  void onTransmitted(const uint8_t *frame, size_t length, uint32_t nowMs, uint32_t rejectedCount);
  // Ramka od nadawcy 0x56: true = nasze echo, false = obcy moduł (nadawanie wstrzymane).
  bool onEconetFrame(const EcomaxFrame &frame, uint32_t nowMs);
  // Wywoływane często: po oknie echa rozstrzyga, czy ostatnie nadanie było kolizją.
  void update(uint32_t nowMs, uint32_t rejectedCount);

  EconetBlockReason blockReason() const { return reason; }
  uint32_t transmitted() const { return transmittedCount; }
  uint32_t echoes() const { return echoCount; }
  uint32_t foreignFrames() const { return foreignCount; }
  uint32_t collisions() const { return collisionCount; }

private:
  void block(uint32_t nowMs, EconetBlockReason why);

  uint32_t startMs = 0;
  bool hasBlock = false;
  uint32_t blockedAtMs = 0;
  EconetBlockReason reason = EconetBlockReason::NONE;
  // dwie ostatnie ramki: odpowiedź na CheckDevice i doklejone do niej zapytanie (etap 3)
  static constexpr uint8_t TX_HISTORY = 2;
  bool isEcho(const EcomaxFrame &frame, uint8_t slot) const;
  uint8_t lastTx[TX_HISTORY][ECONET_MAX_FRAME] = {};
  size_t lastTxLength[TX_HISTORY] = {};
  uint8_t nextTxSlot = 0;
  uint32_t lastTxMs = 0;
  bool txPending = false;
  bool echoSeen = false;
  uint32_t rejectedAtTx = 0;
  uint8_t collisionStreak = 0;
  uint32_t transmittedCount = 0;
  uint32_t echoCount = 0;
  uint32_t foreignCount = 0;
  uint32_t collisionCount = 0;
};
