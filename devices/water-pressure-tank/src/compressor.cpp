#include <compressor.hpp>

void Compressor::start(uint32_t nowMs, uint16_t seconds)
{
  runSeconds = seconds;
  nextSeconds = seconds;
  hasStarted = true;
  isRunning = seconds > 0;
  firstStartMs = nowMs;
  currentStartMs = nowMs;
  endMs = isRunning ? 0 : nowMs;
}

void Compressor::restart(uint32_t nowMs)
{
  if (!hasStarted) {
    start(nowMs, nextSeconds);
    return;
  }
  restartCount++;
  runSeconds = nextSeconds;
  isRunning = runSeconds > 0;
  currentStartMs = nowMs;
  endMs = isRunning ? 0 : nowMs;
}

bool Compressor::update(uint32_t nowMs)
{
  if (!isRunning) return false;
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

int32_t Compressor::lastEndS() const
{
  return hasStarted && !isRunning ? static_cast<int32_t>(endMs / 1000) : -1;
}
