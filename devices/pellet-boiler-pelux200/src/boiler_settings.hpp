// Odczyt ustawień kotła przez ecoNET (etap 3, tylko odczyt; bez Arduino, testowane w
// test_econet). Sterownik jako ecoNET (0x56) pyta regulator o parametry kotła, mieszaczy
// i termostatów, harmonogramy i schemat RegulatorData; odpowiedzi (typ zapytania | 0x80)
// trzyma surowo w pamięci. Dekodowanie i nazwy parametrów — na komputerze (PyPlumIO), archiwum
// w docs/ustawienia-kotla-*.json.
//
// Zmiana parametru (BoilerParameterWriter): kotła ramką 0x33 [nr, wartość] z potwierdzeniem 0xB3
// (sprawdzone 2026-10-03: CWU 55 → 50 °C), od 1.3.0 także mieszacza ramką 0x34 [mieszacz od 0, nr,
// wartość] z potwierdzeniem 0xB4 (według PyPlumIO, na kotle niesprawdzone). Jeden parametr naraz,
// z konsoli USB albo ze zlecenia z aplikacji; sprawdzenie zakresu robi pellet.cpp. Od 1.4.0 włącz/wyłącz
// regulator (0x3B), od 1.8.0 włącz/wyłącz harmonogram (0x37, tylko przełącznik; godziny bez zmian).
// Termostatów (0x5D) nie ma.
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

// Jak wyżej dla mieszacza `mixer` (od 0) z odpowiedzi 0xB2 (pozycja 1 czytnika): dane [0, pierwszy,
// liczba, mieszacze] + mieszacze × liczba × (wartość, min, max).
bool mixerParameterValues(const BoilerSettingsReader &reader, uint8_t mixer, uint8_t index, uint8_t &value,
  uint8_t &min, uint8_t &max);

// Harmonogramy regulatora z odpowiedzi 0xB6 (pozycja 3 czytnika), jak SchedulesStructure w PyPlumIO:
// dane [?, pierwszy, liczba] + liczba × (nr harmonogramu, przełącznik 0/1, parametr: wartość, min, max,
// 42 B tygodnia: 7 dni od niedzieli × 48 półgodzin, starszy bit pierwszy). U nas (2026-10-03): 0 CO, 1 CWU,
// 4 czyszczenie kotła (boiler_clean, jedyny włączony, 07:00–21:30), 6 i 7 mieszacze.
constexpr uint8_t SCHEDULE_ENTRY_SIZE = 47;
constexpr uint8_t SCHEDULE_WEEK_SIZE = 42;
constexpr uint8_t SCHEDULE_BOILER_CLEAN = 4;
// Przełącznik harmonogramu nr schedule; false, gdy brak odczytu albo harmonogramu w odpowiedzi.
bool scheduleSwitch(const BoilerSettingsReader &reader, uint8_t schedule, uint8_t &enabled);
// Dane ramki 0x37 (SetScheduleRequest w PyPlumIO): [1, nr, przełącznik, wartość parametru, 42 B tygodnia],
// tydzień i parametr z odczytu bez zmian. Zwraca długość (46) albo 0, gdy harmonogramu nie ma w odczycie.
size_t buildSetScheduleData(const BoilerSettingsReader &reader, uint8_t schedule, uint8_t enabled, uint8_t *out,
  size_t outSize);
constexpr size_t SET_SCHEDULE_DATA_SIZE = 4 + SCHEDULE_WEEK_SIZE;

constexpr uint8_t ECOMAX_FRAME_SET_PARAMETER = 0x33;
constexpr uint8_t ECOMAX_FRAME_SET_PARAMETER_RESPONSE = 0xB3;
constexpr uint8_t ECOMAX_FRAME_SET_MIXER_PARAMETER = 0x34;
constexpr uint8_t ECOMAX_FRAME_SET_MIXER_PARAMETER_RESPONSE = 0xB4;
// Włącz (1) / wyłącz (0) regulator — jak „Włącz/Wyłącz regulator” na panelu (od 1.4.0, z PyPlumIO,
// na kotle niesprawdzone): pellet rozpala albo przechodzi w wygaszanie.
constexpr uint8_t ECOMAX_FRAME_CONTROL = 0x3B;
constexpr uint8_t ECOMAX_FRAME_CONTROL_RESPONSE = 0xBB;
// Zmiana harmonogramu (od 1.8.0, z PyPlumIO, na kotle niesprawdzone). PyPlumIO nie czeka na odpowiedź;
// 0xB7 przyjmujemy, gdy przyjdzie, a wynik i tak sprawdza ponowny odczyt harmonogramów (pellet.cpp).
constexpr uint8_t ECOMAX_FRAME_SET_SCHEDULE = 0x37;
constexpr uint8_t ECOMAX_FRAME_SET_SCHEDULE_RESPONSE = 0xB7;

// Zmiana jednego parametru kotła albo mieszacza albo włącz/wyłącz regulator: wysyłka jak zapytania o ustawienia (w oknie
// 0x56), czekanie na 0xB3/0xB4/0xBB, 4 s na odpowiedź, 3 próby.
class BoilerParameterWriter {
public:
  // UNCONFIRMED: harmonogram wysłany raz bez 0xB7 (bez ponawiania), wynik pokaże odczyt
  enum class Result : uint8_t { NONE, CONFIRMED, FAILED, UNCONFIRMED };

  static constexpr uint32_t TIMEOUT_MS = 4000;
  static constexpr uint8_t ATTEMPTS = 3;

  static constexpr uint8_t NO_MIXER = 0xFF;
  // zamiast numeru mieszacza: polecenie włącz/wyłącz regulator (0x3B), wartość 0/1, numer bez znaczenia
  static constexpr uint8_t CONTROL = 0xFE;
  // zamiast numeru mieszacza: włącz/wyłącz harmonogram (0x37), numer = nr harmonogramu, wartość 0/1
  static constexpr uint8_t SCHEDULE = 0xFD;

  // False, gdy poprzednia zmiana jeszcze trwa. mixer: numer od 0 albo NO_MIXER (parametr kotła).
  bool start(uint8_t index, uint8_t value, uint8_t mixer = NO_MIXER);
  // Harmonogram nr schedule: dane z buildSetScheduleData (przełącznik = enabled).
  bool startSchedule(uint8_t schedule, uint8_t enabled, const uint8_t *data, size_t length);
  bool busy() const { return pending; }
  size_t nextRequest(uint32_t nowMs, uint8_t *out, size_t outSize);
  void cancelRequest();
  // Ramka od regulatora do 0x56 albo 0x00: true, gdy to potwierdzenie 0xB3 bieżącej zmiany.
  bool onResponse(const EcomaxFrame &frame);
  void update(uint32_t nowMs);

  Result result() const { return lastResult; }
  uint8_t index() const { return parameterIndex; }
  uint8_t value() const { return parameterValue; }
  bool isMixer() const { return mixerIndex != NO_MIXER && mixerIndex != CONTROL && mixerIndex != SCHEDULE; }
  bool isSchedule() const { return mixerIndex == SCHEDULE; }
  bool isControl() const { return mixerIndex == CONTROL; }
  uint8_t mixer() const { return mixerIndex; }

private:
  uint8_t mixerIndex = NO_MIXER;
  bool pending = false;
  bool awaiting = false;
  uint8_t attempts = 0;
  uint32_t sentMs = 0;
  uint8_t parameterIndex = 0;
  uint8_t parameterValue = 0;
  Result lastResult = Result::NONE;
  uint8_t scheduleData[SET_SCHEDULE_DATA_SIZE] = {};
  size_t scheduleLength = 0;
};
