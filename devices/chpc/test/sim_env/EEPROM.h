// Atrapa EEPROM (1 KB, czysta pamięć = 0xFF jak w nowym ATmega328P).
#pragma once
#include <Arduino.h>

struct EEPROMClass {
  uint8_t mem[1024];
  EEPROMClass() { memset(mem, 0xFF, sizeof(mem)); }
  uint8_t read(int addr) { return mem[addr & 1023]; }
  void write(int addr, uint8_t v) { mem[addr & 1023] = v; }
  void clear() { memset(mem, 0xFF, sizeof(mem)); }
};
inline EEPROMClass EEPROM;
