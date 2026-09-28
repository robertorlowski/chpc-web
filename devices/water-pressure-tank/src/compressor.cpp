// Implementacja Compressor. Czasy w ms od startu sterownika (millis()).
#include <compressor.hpp>

void Compressor::start(uint32_t nowMs, uint16_t seconds)
{
  runSeconds = seconds;
  nextSeconds = seconds;
  hasStarted = true;
  isRunning = seconds > 0;
  firstStartMs = nowMs;
  currentStartMs = nowMs;
  // czas 0 s: start i koniec w tej samej chwili, raport ma oba czasy
  endMs = isRunning ? 0 : nowMs;
}

void Compressor::restart(uint32_t nowMs)
{
  // W sterowniku start() jest zawsze w setup(), więc restart przed startem
  // zdarza się tylko w testach; działa wtedy jak pierwszy start.
  if (!hasStarted) {
    start(nowMs, nextSeconds);
    return;
  }
  restartCount++;
  // firstStartMs zostaje: raport ma pierwsze włączenie i ostatnie wyłączenie
  runSeconds = nextSeconds;
  isRunning = runSeconds > 0;
  currentStartMs = nowMs;
  endMs = isRunning ? 0 : nowMs;
}

bool Compressor::update(uint32_t nowMs)
{
  if (!isRunning) return false;
  // różnica bez znaku jest odporna na przepełnienie millis()
  if (nowMs - currentStartMs < static_cast<uint32_t>(runSeconds) * 1000UL) return false;
  isRunning = false;
  endMs = nowMs;
  return true;
}

uint32_t Compressor::remainingMs(uint32_t nowMs) const
{
  if (!isRunning) return 0;
  uint32_t elapsed = nowMs - currentStartMs;
  uint32_t total = static_cast<uint32_t>(runSeconds) * 1000UL;
  return elapsed >= total ? 0 : total - elapsed;
}

int32_t Compressor::firstStartS() const
{
  return hasStarted ? static_cast<int32_t>(firstStartMs / 1000) : -1;
}

// -1 także w trakcie pracy: serwer dostaje compressorEndS dopiero po wyłączeniu.
int32_t Compressor::lastEndS() const
{
  return hasStarted && !isRunning ? static_cast<int32_t>(endMs / 1000) : -1;
}
