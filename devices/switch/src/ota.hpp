// Aktualizacja firmware przez sieć (OTA): oferta z chmury (settings.firmware w odpowiedzi
// na zgłoszenie) i decyzja, czy ją pobrać. Ta sama logika co w hydroforze
// (devices/water-pressure-tank/src/ota.hpp); samo pobieranie jest w switch.cpp.
#pragma once

#include <ArduinoJson.h>
#include <string>

struct OtaOffer {
  std::string version;
  std::string url;
  // 64 znaki hex, małe litery; obraz bez sumy kontrolnej nie jest pobierany
  std::string sha256;
};

// Wczytuje settings.firmware {version, url, sha256}. Zwraca false, gdy oferty nie ma
// albo jest niepełna (brak wersji, adres inny niż https://, suma inna niż 64 znaki hex).
bool parseOtaOffer(JsonVariantConst settings, OtaOffer &out);

// Pobieramy, gdy wersja z oferty różni się od działającej (także starsza: powrót do
// poprzedniego wydania) i nie była już próbowana (lastTried, ochrona przed pętlą).
bool shouldUpdate(const OtaOffer &offer, const char *currentVersion, const std::string &lastTried);
