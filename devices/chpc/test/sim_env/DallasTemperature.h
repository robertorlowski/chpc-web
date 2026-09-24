// Atrapa DallasTemperature: czujniki z sim::sensors; odłączony czujnik zwraca -127,
// odczyt zaokrąglony do rozdzielczości 12 bit (1/16 °C) jak w DS18B20.
#pragma once
#include <Arduino.h>
#include <OneWire.h>

typedef uint8_t DeviceAddress[8];

class DallasTemperature {
public:
  explicit DallasTemperature(OneWire *) {}
  void begin() {}
  void setWaitForConversion(bool) {}
  void requestTemperatures() {}
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
      if (s.connected && memcmp(s.addr, addr, 8) == 0) return (float)(std::round(s.temp * 16.0) / 16.0);
    return -127.0f;
  }
};
