// Połączenie z kotłem przez moduł ecoNET300 (od firmware 1.9.0; bez Arduino, testy w test_econet300).
//
// Zamiast magistrali RS-485 płytka czyta lokalne API ecoNET300 w sieci domowej (http://<IP>/econet/<zapytanie>,
// Basic Auth) i wysyła do chmury ten sam odczyt co z magistrali. API jest nieoficjalne (integracja Home Assistant,
// docs/econet300-api/README.md, nagranie ecoMAX 860P2-N w docs/econet300-api/odpowiedzi/) i niesprawdzone na
// naszym module. Co działa w tej wersji:
//   - odczyt: regParams.curr → EcomaxSensorData (econetToSensorData), więc wysyłka, licznik pelletu i świeżość
//     danych są wspólne z RS-485;
//   - stan pracy: ecoNET `mode` ma inną numerację niż magistrala (econetState);
//   - nastawy: rmCurrentDataParamsEdits daje zadaną kotła (1280) i CWU (1281) z zakresem; econetSettingsHex buduje
//     z nich odpowiedź w formacie 0xB1 (tylko nr 98 i 119, reszta nieużywana), więc serwer i aplikacja pokazują
//     te dwie nastawy bez zmian;
//   - zapis: nr 98 i 119 przez rmCurrNewParam (econetEditKey), włącz/wyłącz przez newParam BOILER_CONTROL;
//   - pobranie odpowiedzi modułu do analizy (/install/econet-dump): JsonSecretMasker ukrywa hasła i klucze.
#pragma once

#include <ArduinoJson.h>
#include <cstddef>
#include <cstdint>

#include <ecomax_frame.hpp>

// Numer stanu ecoNET (mode) → stan z magistrali (PyPlumIO DeviceState: 0 wyłączony, 1 stabilizacja, 2 rozpalanie,
// 3 praca, 4 nadzór, 5 postój, 6 czuwanie, 7 wygaszanie, 8 alarm, 9 ręczny, 10 rozszczelnienie, 11 inny).
uint8_t econetState(int mode);

// regParams.curr → odczyt jak z SensorData. False, gdy brak obiektu albo pola mode.
bool econetToSensorData(JsonVariantConst curr, EcomaxSensorData &out);

// Klucz rmCurrNewParam dla numeru parametru kotła (98 → "1280", 119 → "1281"); nullptr, gdy nieobsługiwany.
const char *econetEditKey(uint8_t ecomaxIndex);

// rmCurrentDataParamsEdits.data → hex odpowiedzi 0xB1 ([0, 0, 120] + 120 × (wartość, min, max), FF = nieużywany)
// z nr 98 (klucz 1280) i 119 (1281). Zwraca liczbę podanych nastaw (0 = nic do wysłania).
uint8_t econetSettingsHex(JsonVariantConst edits, char *hex, size_t hexSize);

// Odpowiedź zapisu ecoNET300: {"result": "OK"}.
bool econetWriteOk(JsonVariantConst reply);

// Maskowanie w strumieniu JSON wartości napisowych kluczy z hasłami i kluczami („password”, „servicePassword”,
// „key”, „pass”, „wifiPassword”…): wartość zamieniana na "MASKED". Znak po znaku, bez buforowania całości.
class JsonSecretMasker {
public:
  // Kolejny znak wejścia; wyjście (0–8 znaków) dopisywane do out, zwraca ich liczbę.
  size_t feed(char c, char *out);

private:
  static bool secretKey(const char *key);
  enum class State : uint8_t { NORMAL, STRING, STRING_ESCAPE, AFTER_KEY, AFTER_COLON, MASKING, MASKING_ESCAPE };
  State state_ = State::NORMAL;
  char key_[24] = {};
  uint8_t keyLength_ = 0;
  bool keyOverflow_ = false;
  bool lastStringSecret_ = false;
};
