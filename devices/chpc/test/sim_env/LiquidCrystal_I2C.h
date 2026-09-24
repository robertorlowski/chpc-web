// Atrapa LCD 16x2 po I2C: zapamiętuje tekst obu linii (sim::lcd).
#pragma once
#include <Arduino.h>

class LiquidCrystal_I2C : public Print {
public:
  LiquidCrystal_I2C(uint8_t, uint8_t, uint8_t) {}
  void init() { clear(); }
  void begin(uint8_t, uint8_t) {}
  void backlight() {}
  void clear() { sim::lcd[0].clear(); sim::lcd[1].clear(); row = 0; col = 0; }
  void setCursor(uint8_t c, uint8_t r) { col = c; row = r > 1 ? 1 : r; }
  void out(const std::string &text) override {
    std::string &line = sim::lcd[row];
    if (line.size() < col) line.resize(col, ' ');
    line.replace(col, text.size(), text);
    col += (uint8_t)text.size();
  }
private:
  uint8_t row = 0, col = 0;
};
