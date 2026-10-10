#pragma once

// Skopiuj do secrets.h (poza gitem) i wpisz własne wartości.

// Punkt dostępowy sterownika, działa przez cały czas pracy. Hasło krótsze niż
// 8 znaków (np. puste) daje sieć otwartą.
#define AP_PASSWORD ""

// Logowanie do /install (Basic Auth), takie samo jak w sterowniku co.
#define INSTALL_USER "admin"
#define INSTALL_PASSWORD "zmien-mnie"

// Wartości domyślne do czasu zapisania innych na stronie /install
// (zapis w NVS ma pierwszeństwo).
#define WIFI_SSID ""
#define WIFI_PASSWORD ""
