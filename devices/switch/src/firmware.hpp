// Stałe sprzętowe i kontraktowe sterownika włącznika, wspólne dla całego firmware.
// Zmiana DEVICE_TYPE wymaga zmiany typu urządzenia na serwerze (DeviceType.SWITCH).
#pragma once

#include <cstdint>

// Typ urządzenia w chmurze.
constexpr const char *DEVICE_TYPE = "switch";
// Wersja firmware: wysyłana w zgłoszeniu i porównywana z ofertą chmury (OTA). Podnieść przy
// każdym wydaniu, zanim zbudujesz obraz; tę samą wersję wpisuje się w aplikacji przy wgrywaniu.
constexpr const char *FW_VERSION = "1.0.2";
// Nazwa nadawana nowemu urządzeniu przy pierwszym zgłoszeniu.
constexpr const char *DEVICE_NAME = "Włącznik";

// Przekaźniki płytki, w kolejności numerów w chmurze (1, 2, …). Płytka „ESP32 Relay AC X1”
// ma jeden przekaźnik Songle 30 A włączany stanem wysokim. Test pinów (2026-10-02) wskazał
// GPIO17 albo GPIO2; przekaźnik zadziałał dopiero z GPIO2 (wersja 1.0.2, 2026-10-03), więc
// przekaźnik 1 steruje obydwoma pinami. Liczbę przekaźników sterownik wysyła w zgłoszeniu.
constexpr uint8_t RELAY_PINS[] = {17};
constexpr uint8_t RELAY_COUNT = sizeof(RELAY_PINS) / sizeof(RELAY_PINS[0]);
constexpr bool RELAY_ACTIVE_HIGH = true;
// Drugi pin ustawiany razem z przekaźnikiem o tym samym numerze (0xFF = brak). Na samym GPIO17
// przekaźnik nie klikał; z GPIO2 działa. GPIO2 (pin trybu startu) jest wyjściem dopiero po starcie.
constexpr uint8_t RELAY_MIRROR_PINS[RELAY_COUNT] = {2};

// Domyślny czas „Włącz” do pierwszego zgłoszenia (potem z chmury), 0 (bez limitu) – 10080 min.
constexpr uint16_t DEFAULT_ON_MINUTES = 30;
constexpr uint16_t MAX_ON_MINUTES = 10080;

// Stały adres chmury (nie ma go na stronie /install). Środowisko esp32dev-local
// (platformio.ini) podmienia go na lokalny serwer (npm run local) po HTTP; host, port
// i TLS dla WebSocket są wyliczane z tego adresu (switch.cpp, parseCloudUrl).
#ifndef SWITCH_CLOUD_URL
#define SWITCH_CLOUD_URL "https://chpc-web.onrender.com/api/"
#endif
constexpr const char *CLOUD_URL = SWITCH_CLOUD_URL;
