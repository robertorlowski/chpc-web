// Atrapa DallasTemperature: czujniki z sim::sensors; odłączony czujnik zwraca -127,
// odczyt zaokrąglony do rozdzielczości 12 bit (1/16 °C) jak w DS18B20.
// Po włączeniu zasilania (sim::powerOnSensor/powerOnSensors) DS18B20 zwraca 85 °C, dopóki nie
// zakończy pierwszego pomiaru (750 ms od requestTemperatures).
#pragma once
#include <Arduino.h>
#include <OneWire.h>

typedef uint8_t DeviceAddress[8];

namespace sim {
inline void powerOnSensor(SimSensor &s) { s.ready_us = UINT64_MAX; }
inline void powerOnSensors() { for (SimSensor &s : sensors) powerOnSensor(s); }
}  // namespace sim

class DallasTemperature {
  bool wait = true;

public:
  explicit DallasTemperature(OneWire *) {}
  void begin() {}
  void setWaitForConversion(bool w) { wait = w; }
  void requestTemperatures() {
    for (SimSensor &s : sim::sensors)
      if (s.connected && s.ready_us == UINT64_MAX) s.ready_us = sim::now_us + 750000;
    if (wait) delay(750);
  }
  bool getAddress(uint8_t *addr, uint8_t index) {
    uint8_t n = 0;
    for (const SimSensor &s : sim::sensors) {
      if (!s.connected) continue;
      if (n++ == index) { memcpy(addr, s.addr, 8); return true; }
    }
    return false;
  }
  float getTempC(const uint8_t *addr) {
    for (const SimSensor &s : sim::sensors)
      if (s.connected && memcmp(s.addr, addr, 8) == 0) {
        if (sim::now_us < s.ready_us) return 85.0f;
        return (float)(std::round(s.temp * 16.0) / 16.0);
      }
    return -127.0f;
  }
};
