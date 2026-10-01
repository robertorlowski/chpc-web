// Aktualizacja firmware przez sieć (OTA): oferta z chmury (settings.firmware
// w odpowiedzi na zgłoszenie) i decyzja, czy ją pobrać. Bez zależności od
// Arduino (testowane w test_logic); samo pobieranie jest w water-pressure-tank.cpp.
#pragma once

#include <ArduinoJson.h>
#include <string>

struct OtaOffer {
  std::string version;
  std::string url;
  // 64 znaki hex, małe litery; obraz bez sumy kontrolnej nie jest pobierany
  std::string sha256;
};

// Wczytuje settings.firmware {version, url, sha256}. Zwraca false, gdy oferty
// nie ma albo jest niepełna (brak wersji, adres inny niż https://, suma
// inna niż 64 znaki hex); wtedy out zostaje bez zmian.
bool parseOtaOffer(JsonVariantConst settings, OtaOffer &out);

// Pobieramy, gdy wersja z oferty różni się od działającej (także starsza:
// pozwala wrócić do poprzedniego wydania) i nie była już próbowana
// (lastTried). Zabezpiecza przed pętlą aktualizacji, gdy obraz ma inną wersję
// niż podaje chmura (np. po zapomnianej zmianie FW_VERSION).
bool shouldUpdate(const OtaOffer &offer, const char *currentVersion, const std::string &lastTried);
