#pragma once

#include <cstddef>
#include <cstdint>

// Ramki magistrali ecoMAX (piec Pellux 200) i dekoder SensorData (typ 0x35).
// Bez zależności od Arduino, żeby dało się testować w `pio test -e native`.
//
// UWAGA: format pochodzi z biblioteki PyPlumIO i NIE był weryfikowany na
// sprzęcie. Parser jest defensywny: sprawdza każdą granicę, odrzuca ramki
// niespójne (długość, 0x16, BCC) i nigdy nie czyta poza buforem.

constexpr uint8_t ECOMAX_START_BYTE = 0x68;
constexpr uint8_t ECOMAX_END_BYTE = 0x16;
constexpr size_t ECOMAX_HEADER_SIZE = 7;
constexpr size_t ECOMAX_MIN_FRAME = 10;
constexpr size_t ECOMAX_MAX_FRAME = 512;

constexpr uint8_t ECOMAX_ADDRESS_ECOMAX = 0x45;
constexpr uint8_t ECOMAX_FRAME_SENSOR_DATA = 0x35;

// Poprawna ramka; `data` wskazuje bufor parsera i jest ważne do następnego
// wywołania next() albo feed().
struct EcomaxFrame {
  uint8_t recipient = 0;
  uint8_t sender = 0;
  uint8_t senderType = 0;
  uint8_t version = 0;
  uint8_t type = 0;
  const uint8_t *data = nullptr;
  size_t dataLength = 0;
};

// Strumieniowy parser: śmieci przed ramką i ramki z błędem są pomijane
// (resynchronizacja na kolejnym 0x68).
class EcomaxFrameParser {
public:
  void feed(uint8_t byte);
  // Zwraca kolejną poprawną ramkę z dotychczas odebranych bajtów.
  bool next(EcomaxFrame &frame);
  uint32_t rejectedCount() const { return rejected; }

private:
  void drop(size_t count);

  uint8_t buffer[ECOMAX_MAX_FRAME] = {};
  size_t size = 0;
  size_t pendingDrop = 0;
  uint32_t rejected = 0;
};

constexpr uint8_t ECOMAX_TEMPERATURE_COUNT = 9;

struct EcomaxTemperature {
  bool present = false;
  float value = 0.0f;
};

struct EcomaxU8 {
  bool present = false;
  uint8_t value = 0;
};

struct EcomaxFloat {
  bool present = false;
  float value = 0.0f;
};

// Pola z flagą `present`: ramka urwana w środku daje tylko to, co zdążono
// poprawnie odczytać.
struct EcomaxSensorData {
  bool valid = false;  // przeczytano przynajmniej state i outputs
  uint8_t state = 0;
  uint32_t outputs = 0;
  // Kolejność: heating, feeder, water_heater, outside, return, exhaust,
  // optical, upper_buffer, lower_buffer.
  EcomaxTemperature temperatures[ECOMAX_TEMPERATURE_COUNT];
  EcomaxU8 heatingTarget, heatingStatus, waterHeaterTarget, waterHeaterStatus;
  EcomaxU8 fuelLevel;
  EcomaxFloat fanPower;
  EcomaxU8 boilerLoad;
  EcomaxFloat boilerPower, fuelConsumption;
};

// Bity `outputs`.
constexpr uint32_t ECOMAX_OUT_FAN = 1u << 0;
constexpr uint32_t ECOMAX_OUT_FEEDER = 1u << 1;
constexpr uint32_t ECOMAX_OUT_HEATING_PUMP = 1u << 2;
constexpr uint32_t ECOMAX_OUT_WATER_HEATER_PUMP = 1u << 3;
constexpr uint32_t ECOMAX_OUT_CIRCULATION_PUMP = 1u << 4;
constexpr uint32_t ECOMAX_OUT_LIGHTER = 1u << 5;
constexpr uint32_t ECOMAX_OUT_ALARM = 1u << 6;

// `data` to bajty po bajcie typu ramki (bez BCC i 0x16). False, gdy nie da się
// odczytać nawet state i outputs.
bool decodeSensorData(const uint8_t *data, size_t length,
  EcomaxSensorData &out);

// True dla ramki SensorData wysłanej przez ecoMAX.
bool isSensorDataFrame(const EcomaxFrame &frame);
