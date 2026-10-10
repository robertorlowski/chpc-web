#pragma once

#include <Arduino.h>

// Konfiguracja połączenia w NVS (przestrzeń "hp"): SSID, hasło Wi-Fi i Root ID
// nadany przez chmurę, oraz SN z fabrycznego MAC. Używają jej cloud_client,
// config_portal i device_io. secrets.h daje tylko wartości domyślne.

// Runtime overrides for the compile-time defaults in secrets.h. A value stored
// in NVS wins; an empty or missing one falls back to the built-in default, so
// a freshly flashed controller works without visiting the configuration page.
// An empty rootId means the controller is not registered in the cloud yet and
// obtains one from POST /api/devices/register.
struct DeviceConfig {
  String wifiSsid;
  String wifiPassword;
  String rootId;
};

// Wersja firmware wysyłana w zgłoszeniu (pole version, w chmurze firmwareVersion;
// karta „Sterownik” w Ustawieniach). Pierwsza numerowana wersja co: 1.0.0 (2026-10-04);
// 1.1.0: aktualizacja z chmury na zlecenie „Aktualizuj” (OTA, partycje min_spiffs);
// 1.1.1: w work_mode OFF działa ręczne włączenie pompy ciepłej i zimnej z aplikacji, temperatury
// idą do pompy od razu (para ostatniego trybu grzania), przegrzanie EEV tylko 0,1–8 °C;
// 1.2.0: tryb MANUAL / AUTO / OFF z jedną temperaturą od–do (bez CO/CWU), bez przekaźników,
// przycisk OFF → CLOUD → RĘCZNY, konfiguracja pompy z chmury (wymuszenie PV, DTU, zbiornik),
// COP na bieżąco i bez wyniku przy pracy pompy CO kotła;
// 1.2.1: ekran: jedna wyśrodkowana linia „T: od - do” (Tmin–Tmax z pompy) zamiast T.HP i T.od-do.
constexpr const char *FW_VERSION = "1.2.3";

// Wspólna przestrzeń NVS; main.cpp trzyma w niej też tryb sterownika ("mode").
constexpr const char *PREFERENCES_NAMESPACE = "hp";

// Network the controller opens when it cannot join the configured one, so a
// wrong password never makes the configuration page unreachable.
// Stan obecny: AP startuje zawsze razem ze sterownikiem, a wyłącza go
// i przywraca AccessPointPolicy. Nazwa MyHome-HeatPump-<4 ostatnie znaki SN>,
// adres 10.10.10.1 jak we wszystkich sterownikach (od 2026-10-10, wcześniej
// HP-CO-setup pod 192.168.4.1).
const char *configApSsid();
// Adres sterownika w jego sieci (AP).
constexpr uint8_t CONFIG_AP_ADDRESS[4] = {10, 10, 10, 1};

// Basic-auth credentials guarding /install. The telemetry page on / is open.
// These live in tracked source, so treat them as a lock on the front door,
// not as a secret.
constexpr const char *INSTALL_USER = "admin";
constexpr const char *INSTALL_PASSWORD = "123!";

// Wczytuje NVS raz w setup() (i usuwa klucze dawnej roli pieca: pellet_root,
// pellet_poll); później obowiązuje kopia w RAM.
void loadDeviceConfig();
const DeviceConfig &deviceConfig();
// True, gdy jest Root ID (z NVS albo CLOUD_ROOT_ID z secrets.h).
bool deviceRegistered();

// Factory MAC burnt into eFuse, as 12 upper-case hex digits in the order
// WiFi.macAddress() prints them. It identifies the controller in the cloud.
const String &deviceSerial();

// Stores the Wi-Fi fields only; the rootId is owned by the registration.
bool saveWifiConfig(const String &ssid, const String &password);
bool saveRootId(const String &rootId);
// Forgets a rootId the server does not match with this serial, so the
// controller registers again.
void clearRootId();
