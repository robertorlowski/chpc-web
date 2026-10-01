#pragma once

#include <Arduino.h>
#include <ecomax_frame.hpp>

// Pasywny odbiór magistrali ecoMAX na osobnym UART2 (nie dotyka Serial/UART0
// ani SerialBus). Etap 1: nic nie nadajemy, DE+RE transceivera na stałe LOW.
class EcomaxBus {
public:
  void begin();
  // Wołane w loop(); pobiera z UART2 do kilkuset bajtów i dekoduje ramki.
  void tick();
  bool hasReading() const { return hasData; }
  // Ostatni poprawny odczyt młodszy niż maxAgeMs.
  bool fresh(unsigned long maxAgeMs) const;
  const EcomaxSensorData &reading() const { return latest; }
  uint32_t frameCount() const { return frames; }
  uint32_t rejectedCount() const { return parser.rejectedCount(); }

private:
  EcomaxFrameParser parser;
  EcomaxSensorData latest;
  bool hasData = false;
  unsigned long receivedAt = 0;
  uint32_t frames = 0;
};
