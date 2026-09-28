// Stałe sprzętowe i kontraktowe sterownika hydroforu, wspólne dla całego
// firmware (water-pressure-tank.cpp, settings.*). Zmiana DEVICE_TYPE wymaga
// zmiany typu urządzenia na serwerze (DeviceType.WATER_PRESSURE_TANK).
#pragma once

#include <cstdint>

// Typ urządzenia w chmurze; tylko w kodzie i w definicji urządzenia.
constexpr const char *DEVICE_TYPE = "water-pressure-tank";
// Nazwa nadawana nowemu urządzeniu przy pierwszym zgłoszeniu.
constexpr const char *DEVICE_NAME = "Hydrofor";

// Przekaźnik kompresora. Obecny moduł jest sterowany stanem niskim; po
// przestawieniu zworki na H (zalecane, docs punkt 2) ustaw true.
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
