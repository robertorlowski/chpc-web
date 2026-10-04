// Aktualizacja firmware z chmury (OTA, od 1.5.0): oferta i decyzja, czy ją pobrać. Chmura wysyła
// ofertę tylko na zlecenie z aplikacji („Aktualizuj” w Ustawieniach): w odpowiedzi na zgłoszenie
// (settings.firmware) i na GET pellet-boiler-pelux200/commands/next (firmware). Ta sama logika co we
// włączniku (devices/switch/src/ota.hpp); samo pobieranie jest w pellet.cpp.
#pragma once

#include <ArduinoJson.h>
#include <string>

struct OtaOffer {
  std::string version;
  std::string url;
  // 64 znaki hex, małe litery; obraz bez sumy kontrolnej nie jest pobierany
  std::string sha256;
  // identyfikator zlecenia (czas kliknięcia „Aktualizuj” w ms)
  std::string request;
};

// Wczytuje obiekt["firmware"] {version, url, sha256, request?}. Zwraca false, gdy oferty nie ma albo
// jest niepełna (brak wersji, adres inny niż https://, suma inna niż 64 znaki hex).
bool parseOtaOffer(JsonVariantConst settings, OtaOffer &out);

// Klucz próby: wersja albo wersja#zlecenie. Zapisany w NVS po pobraniu (ota_tried), więc każde
// zlecenie daje najwyżej jedną próbę, a ponowne „Aktualizuj” w aplikacji — kolejną.
std::string otaKey(const OtaOffer &offer);

// Pobieramy, gdy wersja z oferty różni się od działającej (także starsza: powrót do
// poprzedniego wydania) i to zlecenie nie było już próbowane (lastTried, ochrona przed pętlą).
bool shouldUpdate(const OtaOffer &offer, const char *currentVersion, const std::string &lastTried);
