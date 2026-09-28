// Logika czasu pracy kompresora bez zależności od Arduino (testowana w
// test/test_logic). Używa jej water-pressure-tank.cpp: start w setup(),
// update() w loop(), restart() z przycisku na stronie / (POST /restart).
#pragma once

#include <cstdint>

// Czas pracy kompresora. Sterownik żyje tylko w czasie pracy pompy, więc
// wszystkie czasy są liczone od jego startu (millis). Kompresor startuje raz;
// ponowne uruchomienie ręczne liczy się od nowa, a do raportu trafia pierwsze
// włączenie i ostatnie wyłączenie.
class Compressor {
public:
  void start(uint32_t nowMs, uint16_t seconds);
  void restart(uint32_t nowMs);
  // Nowy czas działa od następnego włączenia (także ponownego); bieżąca
  // praca kończy się po starym czasie.
  void setSeconds(uint16_t seconds) { nextSeconds = seconds; }
  // Zwraca true, gdy właśnie się wyłączył.
  bool update(uint32_t nowMs);

  bool running() const { return isRunning; }
  bool started() const { return hasStarted; }
  uint16_t seconds() const { return runSeconds; }
  uint16_t restarts() const { return restartCount; }
  uint32_t remainingMs(uint32_t nowMs) const;
  // sekundy od startu sterownika; -1, gdy jeszcze nie było
  int32_t firstStartS() const;
  int32_t lastEndS() const;

private:
  bool hasStarted = false;
  bool isRunning = false;
  uint16_t runSeconds = 0;
  uint16_t nextSeconds = 0;
  uint16_t restartCount = 0;
  uint32_t firstStartMs = 0;
  uint32_t currentStartMs = 0;
  uint32_t endMs = 0;
};
