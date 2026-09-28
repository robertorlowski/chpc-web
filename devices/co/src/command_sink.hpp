#pragma once

#include <domain_types.hpp>

// Interfejs kolejki komend RS-485 widziany przez OperationController.
// Na urządzeniu implementuje go SerialBus, w testach RecordingSink, dzięki
// czemu kontroler kompiluje się bez Arduino (pio test -e native, most E2E).
class CommandSink {
public:
  virtual ~CommandSink() = default;
  // Zwraca false, gdy kolejka jest pełna; kontroler ponawia wtedy komendę.
  virtual bool enqueue(SERIAL_OPERATION operation, double value = 0.0) = 0;
  // Komenda bezpieczeństwa lub akcja serwisowa, wysyłana przed zwykłymi.
  virtual bool enqueuePriority(SERIAL_OPERATION operation, double value = 0.0) = 0;
};
