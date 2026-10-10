#pragma once

// Skopiuj do secrets.h (poza gitem) i wpisz własne wartości.

// Punkt dostępowy do pierwszej konfiguracji: działa po starcie i po 1 min bez Wi-Fi, wyłącza
// się po 1 min połączenia z Wi-Fi (switch.cpp, updateAccessPoint). Hasło krótsze niż 8 znaków
// (np. puste) daje sieć otwartą: w tym czasie każdy w zasięgu może przełączyć przekaźnik.
#define AP_PASSWORD ""

// Logowanie do /install (Basic Auth), takie samo jak w sterowniku co i hydroforze.
#define INSTALL_USER "admin"
#define INSTALL_PASSWORD "zmien-mnie"

// Wartości domyślne do czasu zapisania innych na stronie /install (zapis w NVS ma pierwszeństwo).
#define WIFI_SSID ""
#define WIFI_PASSWORD ""
