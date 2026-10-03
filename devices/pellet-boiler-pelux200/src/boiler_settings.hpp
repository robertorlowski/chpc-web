// Odczyt ustawień kotła przez ecoNET (etap 3, tylko odczyt; bez Arduino, testowane w
// test_econet). Sterownik jako ecoNET (0x56) pyta regulator o parametry kotła, mieszaczy
// i termostatów, harmonogramy i schemat RegulatorData; odpowiedzi (typ zapytania | 0x80)
// trzyma surowo w pamięci. Dekodowanie i nazwy parametrów — na komputerze (PyPlumIO), archiwum
// w docs/ustawienia-kotla-*.json.
//
// Zmiana parametru kotła (BoilerParameterWriter, od 2026-10-03 na prośbę użytkownika: CWU
// 55 → 50 °C): ramka 0x33 [nr, wartość], potwierdzenie 0xB3. Tylko jeden parametr kotła naraz,
// tylko z konsoli USB; sprawdzenie zakresu i stanu kotła robi pellet.cpp. Mieszaczy (0x34),
// harmonogramów (0x37), włączania regulatora (0x3B) i termostatów (0x5D) nie ma.
//
// Kiedy nadawać: regulator odpytuje urządzenia w oknach co ok. 300 ms; zapytanie idzie jako
// osobna ramka chwilę po naszej odpowiedzi na CheckDevice, czyli w oknie adresu 0x56
// (zapytanie doklejone tuż za odpowiedzią regulator pomijał, 2026-10-03).
#pragma once

#include <cstddef>
#include <cstdint>

#include <ecomax_frame.hpp>

struct BoilerSettingsRequest {
  uint8_t type;
  uint8_t data[2];
  uint8_t length;
  const char *name;
};

constexpr uint8_t BOILER_SETTINGS_COUNT = 5;
extern const BoilerSettingsRequest BOILER_SETTINGS_REQUESTS[BOILER_SETTINGS_COUNT];

class BoilerSettingsReader {
public:
  static constexpr uint32_t TIMEOUT_MS = 4000;
  static constexpr uint8_t ATTEMPTS = 3;
  static constexpr size_t MAX_DATA = ECOMAX_MAX_FRAME - 10;

  // Odczyt wszystkich ustawień od początku (poprzednie odpowiedzi zostają do nadpisania).
  void start();
  bool busy() const { return index >= 0; }
  int8_t current() const { return index; }
  // Ramka zapytania do wysłania teraz; 0, gdy nic nie czeka albo czekamy na odpowiedź.
  size_t nextRequest(uint32_t nowMs, uint8_t *out, size_t outSize);
  // Zapytanie z nextRequest() nie zostało wysłane (magistrala zajęta): bez liczenia próby.
  void cancelRequest();
  // Ramka od regulatora (0x45) do 0x56 albo do wszystkich (0x00): true, gdy to odpowiedź na
  // bieżące zapytanie.
  bool onResponse(const EcomaxFrame &frame, uint32_t nowMs);
  // Brak odpowiedzi przez TIMEOUT_MS: ponowienie, po ATTEMPTS próbach następne zapytanie.
  void update(uint32_t nowMs);

  bool has(uint8_t item) const { return item < BOILER_SETTINGS_COUNT && present[item]; }
  const uint8_t *data(uint8_t item) const { return stored[item]; }
  size_t length(uint8_t item) const { return storedLength[item]; }
  uint32_t receivedAtMs(uint8_t item) const { return receivedAt[item]; }
  uint32_t failed() const { return failedCount; }

private:
  void advance();

  int8_t index = -1;
  uint8_t attempts = 0;
  bool awaiting = false;
  uint32_t sentMs = 0;
  uint32_t failedCount = 0;
  uint8_t stored[BOILER_SETTINGS_COUNT][MAX_DATA] = {};
  size_t storedLength[BOILER_SETTINGS_COUNT] = {};
  bool present[BOILER_SETTINGS_COUNT] = {};
  uint32_t receivedAt[BOILER_SETTINGS_COUNT] = {};
};

// Wartość, min i max parametru kotła nr `index` z ostatniej odpowiedzi 0xB1 (pozycja 0 czytnika):
// dane [0, pierwszy, liczba] + liczba × (wartość, min, max). False, gdy brak odczytu, numer poza
// odpowiedzią albo parametr nieużywany (FF FF FF).
bool ecomaxParameterValues(const BoilerSettingsReader &reader, uint8_t index, uint8_t &value, uint8_t &min,
  uint8_t &max);

constexpr uint8_t ECOMAX_FRAME_SET_PARAMETER = 0x33;
constexpr uint8_t ECOMAX_FRAME_SET_PARAMETER_RESPONSE = 0xB3;

// Zmiana jednego parametru kotła: wysyłka jak zapytania o ustawienia (w oknie 0x56), czekanie
// na 0xB3, 4 s na odpowiedź, 3 próby.
class BoilerParameterWriter {
public:
  enum class Result : uint8_t { NONE, CONFIRMED, FAILED };

  static constexpr uint32_t TIMEOUT_MS = 4000;
  static constexpr uint8_t ATTEMPTS = 3;

  // False, gdy poprzednia zmiana jeszcze trwa.
  bool start(uint8_t index, uint8_t value);
  bool busy() const { return pending; }
  size_t nextRequest(uint32_t nowMs, uint8_t *out, size_t outSize);
  void cancelRequest();
  // Ramka od regulatora do 0x56 albo 0x00: true, gdy to potwierdzenie 0xB3 bieżącej zmiany.
  bool onResponse(const EcomaxFrame &frame);
  void update(uint32_t nowMs);

  Result result() const { return lastResult; }
  uint8_t index() const { return parameterIndex; }
  uint8_t value() const { return parameterValue; }

private:
  bool pending = false;
  bool awaiting = false;
  uint8_t attempts = 0;
  uint32_t sentMs = 0;
  uint8_t parameterIndex = 0;
  uint8_t parameterValue = 0;
  Result lastResult = Result::NONE;
};
