// UART2 z magistralą ecoMAX, tylko odbiór (etap 1).
#include <ecomax_bus.hpp>

#include <hardware_config.hpp>

namespace {
// Bajtów na jedno wywołanie tick(), żeby nie zagłodzić reszty pętli.
constexpr size_t MAX_BYTES_PER_TICK = 512;
// Bufor sterownika UART: HTTP do chmury blokuje pętlę na kilka sekund, a dane
// nadal spływają; nadmiar jest gubiony, parser się resynchronizuje.
constexpr size_t RX_BUFFER_BYTES = 2048;
}

void EcomaxBus::begin()
{
  // DE i RE razem na LOW: transceiver tylko odbiera.
  pinMode(ECOMAX_DE_RE_PIN, OUTPUT);
  digitalWrite(ECOMAX_DE_RE_PIN, LOW);
  Serial2.setRxBufferSize(RX_BUFFER_BYTES);
  // TX = -1: nie przypisujemy pinu nadawczego (GPIO17 zostaje nietknięty).
  Serial2.begin(ECOMAX_BAUD, SERIAL_8N1, ECOMAX_RX_PIN, -1);
}

void EcomaxBus::tick()
{
  size_t budget = MAX_BYTES_PER_TICK;
  while (budget > 0 && Serial2.available() > 0) {
    int byte = Serial2.read();
    if (byte < 0) break;
    budget--;
    parser.feed(static_cast<uint8_t>(byte));

    EcomaxFrame frame;
    while (parser.next(frame)) {
      if (!isSensorDataFrame(frame)) continue;
      EcomaxSensorData decoded;
      if (!decodeSensorData(frame.data, frame.dataLength, decoded)) continue;
      latest = decoded;
      hasData = true;
      receivedAt = millis();
      frames++;
    }
  }
}

bool EcomaxBus::fresh(unsigned long maxAgeMs) const
{
  return hasData && millis() - receivedAt < maxAgeMs;
}
