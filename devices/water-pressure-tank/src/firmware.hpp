// Stałe sprzętowe i kontraktowe sterownika hydroforu, wspólne dla całego
// firmware (water-pressure-tank.cpp, settings.*). Zmiana DEVICE_TYPE wymaga
// zmiany typu urządzenia na serwerze (DeviceType.WATER_PRESSURE_TANK).
#pragma once

#include <cstdint>

// Typ urządzenia w chmurze; tylko w kodzie i w definicji urządzenia.
constexpr const char *DEVICE_TYPE = "water-pressure-tank";
// Wersja firmware: wysyłana w zgłoszeniu i porównywana z wersją oferowaną przez
// chmurę (OTA). Podnieść przy każdym wydaniu, zanim zbudujesz obraz; tę samą wersję
// wpisuje się na stronie firmware w aplikacji przy wgrywaniu pliku.
constexpr const char *FW_VERSION = "1.1.4";
// Nazwa nadawana nowemu urządzeniu przy pierwszym zgłoszeniu.
constexpr const char *DEVICE_NAME = "Hydrofor";

// Przekaźnik kompresora. Zamontowany moduł jest sterowany stanem niskim (false), z
// rezystorem 10 kΩ z IN do 3V3. Dla modułu ze zworką H (stan wysoki) ustaw true
// i daj rezystor do masy (docs, punkt „Podłączenie”).
constexpr uint8_t RELAY_PIN = 10;
constexpr bool RELAY_ACTIVE_HIGH = false;

// Opóźnienie startu kompresora po podaniu zasilania (ustabilizowanie zasilania).
constexpr uint32_t COMPRESSOR_START_DELAY_MS = 1000;
// Czas domyślny do pierwszego zgłoszenia; zakres 1–MAX taki sam jak walidacja
// serwera (PUT /api/device/properties i /water-pressure-tank/settings).
constexpr uint16_t DEFAULT_COMPRESSOR_SECONDS = 30;
constexpr uint16_t MAX_COMPRESSOR_SECONDS = 3600;

// Stały adres chmury (nie ma go na stronie /install).
constexpr const char *CLOUD_URL = "https://chpc-web.onrender.com/api/";
