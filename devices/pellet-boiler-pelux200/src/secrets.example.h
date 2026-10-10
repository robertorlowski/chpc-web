#pragma once

// Skopiuj do secrets.h (poza gitem) i wpisz własne wartości.

// Punkt dostępowy do konfiguracji: działa po starcie i po 1 min bez Wi-Fi, wyłącza się po
// 1 min połączenia (pellet.cpp, updateAccessPoint). Hasło krótsze niż 8 znaków = sieć otwarta.
#define AP_PASSWORD ""

// Logowanie do /install (Basic Auth), jak w pozostałych sterownikach.
#define INSTALL_USER "admin"
#define INSTALL_PASSWORD "zmien-mnie"

// Wartości domyślne do czasu zapisania innych na stronie /install (NVS ma pierwszeństwo).
#define WIFI_SSID ""
#define WIFI_PASSWORD ""
