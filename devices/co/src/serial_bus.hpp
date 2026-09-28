#pragma once

#include <Arduino.h>
#include <HardwareSerial.h>
#include <command_sink.hpp>

// Kolejka i transmisja na magistrali RS-485 (Serial, 9600 8N1, półdupleks).
// Na magistrali są CHPC (0x41), DTU (0x69) i `co` (0x10); nadawanie zaczyna
// tylko `co`. SerialBus wysyła jedną ramkę naraz, czeka na odpowiedź odczytu
// i składa odebrane bajty w ramki. Treść odpowiedzi rozdziela main.cpp.

// Na jaką odpowiedź czeka magistrala po ostatnim zapytaniu.
enum class PendingRead : uint8_t {
  NONE,
  HP,
  PV_PART_1,
  PV_PART_2
};

class SerialBus : public CommandSink {
public:
  // Sized to hold a whole inverter response; the frame buffer in main.cpp
  // must match, so both take it from here.
  static constexpr size_t RX_BUFFER_SIZE = 2048;

  explicit SerialBus(HardwareSerial &serial);

  void begin(uint32_t baud);
  // Wysyła następną ramkę z kolejki, gdy minęła przerwa i nic nie czeka
  // na odpowiedź; zwalnia oczekiwanie po timeoucie.
  void tick();

  // Dodanie komendy usuwa z kolejki oczekującą komendę tego samego ustawienia
  // (np. force ON zastępuje force OFF), więc idzie tylko najnowsza wartość.
  bool enqueue(SERIAL_OPERATION operation, double value = 0.0) override;
  bool enqueuePriority(SERIAL_OPERATION operation, double value = 0.0) override;
  // Drugie zapytanie PV: przed zwykłymi komendami, żeby odczyt DTU nie
  // rozjechał się w czasie.
  bool enqueueFollowUp(SERIAL_OPERATION operation, double value = 0.0);
  // Usuwa z kolejki wszystko poza odczytami (zmiana trybu przyciskiem).
  void cancelControlCommands();

  // Zwraca kompletną ramkę po 5 ms ciszy albo 0, gdy ramka jeszcze trwa.
  size_t readFrame(uint8_t *buffer, size_t capacity);
  bool validateModbusFrame(const uint8_t *buffer, size_t length) const;
  PendingRead pendingRead() const;
  // Nic nie czeka w kolejce, na odpowiedź ani w buforze odbioru; tylko wtedy
  // main.cpp wykonuje blokujące HTTP/NTP.
  bool isIdle() const;
  // Wołane przez main.cpp po obsłużeniu odpowiedzi; odblokowuje kolejkę.
  void completeRead();
  // True once after a command that changes the pump (anything but a read)
  // has gone out, so the caller can check its effect soon.
  bool takeControlCommandWritten();
  uint32_t queueOverflowCount() const;
  uint32_t readTimeoutCount() const;
  uint32_t receiveOverflowCount() const;

private:
  struct Command {
    SERIAL_OPERATION operation;
    double value;
  };

  // Kolejka jest jedną tablicą w trzech częściach, w tej kolejności:
  // bezpieczeństwo/akcje, kontynuacja odczytu PV, zwykłe komendy.
  enum class QueueClass : uint8_t {
    SAFETY,
    FOLLOW_UP,
    NORMAL
  };

  static constexpr size_t QUEUE_SIZE = 32;
  // Minimalny odstęp między kolejnymi transmisjami `co`, liczony bez delay():
  // CHPC obsługuje magistralę raz na obieg swojej pętli, a dwie ramki zbyt
  // blisko siebie trafiłyby do jednego odczytu i zostały odrzucone.
  static constexpr unsigned long COMMAND_GAP_MS = 500;
  // Brak odpowiedzi na odczyt przez 3 s zwalnia magistralę (licznik
  // serial_read_timeout); następny odczyt CHPC zgłasza wtedy heatPumpLost().
  static constexpr unsigned long READ_TIMEOUT_MS = 3000;
  // 5 ms bez bajtu = koniec ramki (przy 9600 b/s bajt trwa ok. 1 ms).
  static constexpr unsigned long FRAME_GAP_MS = 5;

  HardwareSerial &serial;
  Command queue[QUEUE_SIZE];
  size_t queueCount = 0;
  size_t safetyCount = 0;
  size_t followUpCount = 0;
  uint8_t receiveBuffer[RX_BUFFER_SIZE]{};
  size_t receiveLength = 0;
  unsigned long lastWriteAt = 0;
  unsigned long pendingSince = 0;
  unsigned long lastByteAt = 0;
  bool hasWritten = false;
  bool controlCommandWritten = false;
  bool discardingReceiveFrame = false;
  PendingRead pending = PendingRead::NONE;
  uint32_t queueOverflows = 0;
  uint32_t readTimeouts = 0;
  uint32_t receiveOverflows = 0;

  bool enqueueCommand(const Command &command, QueueClass queueClass);
  bool popFront(Command &command);
  void removeAt(size_t index);
  int commandKey(SERIAL_OPERATION operation) const;
  void writeCommand(const Command &command);
  PendingRead readTypeFor(SERIAL_OPERATION operation) const;
  bool isReadOperation(SERIAL_OPERATION operation) const;
};
