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

// Wspólna przestrzeń NVS; main.cpp trzyma w niej też tryb sterownika ("mode").
constexpr const char *PREFERENCES_NAMESPACE = "hp";

// Network the controller opens when it cannot join the configured one, so a
// wrong password never makes the configuration page unreachable.
// Stan obecny: AP startuje zawsze razem ze sterownikiem, a wyłącza go
// i przywraca AccessPointPolicy.
constexpr const char *CONFIG_AP_SSID = "HP-CO-setup";

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
