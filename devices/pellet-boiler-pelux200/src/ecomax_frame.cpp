// Parser ramek ecoMAX i dekoder SensorData. Format z biblioteki PyPlumIO,
// niezweryfikowany na sprzęcie (patrz ecomax_frame.hpp).
#include <ecomax_frame.hpp>

#include <cmath>
#include <cstring>

namespace {
// Czytnik z kontrolą granic: po przekroczeniu końca zwraca false i nie rusza bufora.
class Reader {
public:
  Reader(const uint8_t *data, size_t length) : data(data), length(length) {}

  bool u8(uint8_t &value)
  {
    if (position >= length) return false;
    value = data[position++];
    return true;
  }

  bool u32(uint32_t &value)
  {
    if (length - position < 4) return false;
    value = static_cast<uint32_t>(data[position])
      | static_cast<uint32_t>(data[position + 1]) << 8
      | static_cast<uint32_t>(data[position + 2]) << 16
      | static_cast<uint32_t>(data[position + 3]) << 24;
    position += 4;
    return true;
  }

  // float32 IEEE little-endian; NaN i nieskończoność to brak wartości.
  bool f32(EcomaxFloat &out)
  {
    uint32_t raw;
    if (!u32(raw)) return false;
    float value;
    std::memcpy(&value, &raw, sizeof(value));
    out.present = std::isfinite(value);
    out.value = out.present ? value : 0.0f;
    return true;
  }

  // uint8, 0xFF = brak.
  bool optionalU8(EcomaxU8 &out)
  {
    uint8_t raw;
    if (!u8(raw)) return false;
    out.present = raw != 0xFF;
    out.value = out.present ? raw : 0;
    return true;
  }

  bool skip(size_t count)
  {
    if (length - position < count) return false;
    position += count;
    return true;
  }

private:
  const uint8_t *data;
  size_t length;
  size_t position = 0;
};
}

void EcomaxFrameParser::drop(size_t count)
{
  if (count >= size) {
    size = 0;
    return;
  }
  std::memmove(buffer, buffer + count, size - count);
  size -= count;
}

void EcomaxFrameParser::feed(uint8_t byte)
{
  if (pendingDrop > 0) {
    drop(pendingDrop);
    pendingDrop = 0;
  }
  // Ramka mieści się w buforze, więc pełny bufor bez ramki to śmieci:
  // gubimy najstarszy bajt.
  if (size == sizeof(buffer)) drop(1);
  buffer[size++] = byte;
}

bool EcomaxFrameParser::next(EcomaxFrame &frame)
{
  if (pendingDrop > 0) {
    drop(pendingDrop);
    pendingDrop = 0;
  }

  while (size > 0) {
    if (buffer[0] != ECOMAX_START_BYTE) {
      // Wszystko do następnego 0x68 to śmieci.
      size_t skip = 1;
      while (skip < size && buffer[skip] != ECOMAX_START_BYTE) skip++;
      drop(skip);
      continue;
    }
    if (size < 3) return false;

    size_t length = static_cast<size_t>(buffer[1])
      | static_cast<size_t>(buffer[2]) << 8;
    if (length < ECOMAX_MIN_FRAME || length > ECOMAX_MAX_FRAME) {
      rejected++;
      drop(1);
      continue;
    }
    if (size < length) return false;

    uint8_t bcc = 0;
    for (size_t i = 0; i < length - 2; i++) bcc ^= buffer[i];
    if (buffer[length - 1] != ECOMAX_END_BYTE || buffer[length - 2] != bcc) {
      rejected++;
      drop(1);
      continue;
    }

    frame.recipient = buffer[3];
    frame.sender = buffer[4];
    frame.senderType = buffer[5];
    frame.version = buffer[6];
    frame.type = buffer[7];
    frame.data = buffer + 8;
    frame.dataLength = length - 10;  // bez nagłówka, typu, BCC i 0x16
    pendingDrop = length;
    return true;
  }
  return false;
}

bool isSensorDataFrame(const EcomaxFrame &frame)
{
  return frame.type == ECOMAX_FRAME_SENSOR_DATA
    && frame.sender == ECOMAX_ADDRESS_ECOMAX;
}

bool decodeSensorData(const uint8_t *data, size_t length, EcomaxSensorData &out)
{
  out = EcomaxSensorData();
  if (data == nullptr) return false;
  Reader reader(data, length);

  // SensorDataMessage w PyPlumIO: najpierw FrameVersionsStructure (liczba wpisów i po 3 bajty:
  // typ ramki + uint16 wersji), dopiero potem dane czujników (sprawdzone z kodem PyPlumIO 2026-10-03).
  uint8_t versions;
  if (!reader.u8(versions) || !reader.skip(static_cast<size_t>(versions) * 3)) return false;

  uint32_t ignored;
  if (!reader.u8(out.state) || !reader.u32(out.outputs)) return false;
  out.valid = true;
  if (!reader.u32(ignored)) return true;  // output_flags, pomijane

  uint8_t count;
  if (!reader.u8(count)) return true;
  for (uint8_t i = 0; i < count; i++) {
    uint8_t index;
    EcomaxFloat value;
    if (!reader.u8(index) || !reader.f32(value)) return true;
    if (index < ECOMAX_TEMPERATURE_COUNT && value.present) {
      out.temperatures[index].present = true;
      out.temperatures[index].value = value.value;
    }
  }

  if (!reader.optionalU8(out.heatingTarget)
    || !reader.optionalU8(out.heatingStatus)
    || !reader.optionalU8(out.waterHeaterTarget)
    || !reader.optionalU8(out.waterHeaterStatus)) return true;

  // Założenie (niezweryfikowane): bajt licznika alertów jest osobny, a po nim
  // następuje dokładnie tyle bajtów alertów.
  uint8_t alerts;
  if (!reader.u8(alerts) || !reader.skip(alerts)) return true;

  uint8_t fuel;
  if (!reader.u8(fuel)) return true;
  if (fuel != 0xFF) {
    int level = fuel > 100 ? fuel - 101 : fuel;
    if (level <= 100) {
      out.fuelLevel.present = true;
      out.fuelLevel.value = static_cast<uint8_t>(level);
    }
  }

  if (!reader.skip(1)) return true;  // transmission
  if (!reader.f32(out.fanPower)) return true;
  if (!reader.optionalU8(out.boilerLoad)) return true;
  if (!reader.f32(out.boilerPower)) return true;
  if (!reader.f32(out.fuelConsumption)) return true;

  // Dalej kolejność jak w PyPlumIO (structures/sensor_data.py): termostat, wersje modułów,
  // sonda lambda, czujniki termostatów, czujniki mieszaczy.
  if (!reader.skip(1)) return true;  // thermostat
  for (uint8_t module = 0; module < 6; module++) {  // A, B, C, ecoLAMBDA, ecoSTER, panel
    uint8_t first;
    if (!reader.u8(first)) return true;
    if (first == 0xFF) continue;
    if (!reader.skip(module == 0 ? 4 : 2)) return true;  // wersja 3 B, moduł A + 2 B producenta
  }
  uint8_t lambda;
  if (!reader.u8(lambda)) return true;
  if (lambda != 0xFF && !reader.skip(3)) return true;  // zadana + uint16 poziomu
  uint8_t contacts;
  if (!reader.u8(contacts)) return true;
  if (contacts != 0xFF) {
    uint8_t thermostats;
    if (!reader.u8(thermostats) || !reader.skip(static_cast<size_t>(thermostats) * 9)) return true;
  }

  uint8_t mixers;
  if (!reader.u8(mixers)) return true;
  for (uint8_t i = 0; i < mixers; i++) {
    EcomaxFloat temperature;
    uint8_t target, unknown, status;
    if (!reader.f32(temperature) || !reader.u8(target) || !reader.u8(unknown)
      || !reader.u8(status) || !reader.skip(1)) return true;
    if (i >= ECOMAX_MIXER_MAX || !temperature.present) continue;
    out.mixers[i].present = true;
    out.mixers[i].temperature = temperature.value;
    out.mixers[i].target = target;
    out.mixers[i].status = status;
  }
  return true;
}
