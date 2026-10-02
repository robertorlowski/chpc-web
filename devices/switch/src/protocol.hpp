// JSON wymieniany z chmurą (bez zależności od Arduino, testowane w test_logic).
// Kontrakt: server/src/modules/switch (POST switch/state, PUT switch/mode, zgłoszenie).
#pragma once

#include <ArduinoJson.h>
#include <cstdint>
#include <string>

#include <relays.hpp>

// Zgłoszenie stanu: {"uptimeS":N,"relays":[{"on":true,"changedS":12},…]}.
// changedS — od ilu sekund przekaźnik jest w obecnym stanie; serwer liczy z tego czas
// włączenia i wyłączenia w historii, także po przerwie w łączności.
std::string buildStateReport(const RelayBank &bank, uint32_t nowMs);

// Odpowiedź na zgłoszenie stanu: {"relays":[{"on":true,"offAfterS":1200,"mode":"schedule"},…]}.
// Stosuje polecenia do bank (pomijając przekaźniki z niewysłaną zmianą lokalną). Zwraca
// false, gdy odpowiedź nie jest poprawnym JSON-em z tablicą relays; changedMask — maska
// przekaźników, które zmieniły stan.
bool applyStateResponse(const char *json, RelayBank &bank, uint32_t nowMs, uint32_t &changedMask);

// Zmiana ze strony sterownika dla PUT switch/mode: {"relay":1,"mode":"timer","minutes":30,"source":"controller"}.
std::string buildModeBody(uint8_t relayNumber, RelayMode mode, uint32_t minutes);

// Domyślny czas „Włącz na…” z settings odpowiedzi na zgłoszenie (default_on_minutes, 1–10080).
// Zwraca false, gdy brak albo poza zakresem (out bez zmian).
bool parseDefaultMinutes(JsonVariantConst settings, uint16_t &out);
