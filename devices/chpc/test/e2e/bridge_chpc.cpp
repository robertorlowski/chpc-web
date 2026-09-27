// Strona CHPC mostu: firmware z atrapami sprzętu (test/sim_env), sterowany przez bridge_api.h.
#include <chpc_sim.h>

#include "bridge_api.h"

using namespace chpc;

void chpcBoot() {
  defaultWorld();
  addSensor("Tho", 0xA5, 32.0);
  useDefaultPower();
  boot();
}

std::string chpcRun(uint64_t ms) {
  try {
    runMs(ms, ms > 60000 ? 1000 : LOOP_US);
  } catch (const SimRestart &) {
    // restart programowy (0x11): na procesorze setup() od nowa, w symulacji tak samo
    resetGlobalsLikeReboot();
    sim::rx.clear();
    setup();
    return "restart";
  }
  return "";
}

std::string chpcPoll() {
  try {
    return query(3000);
  } catch (const SimRestart &) {
    resetGlobalsLikeReboot();
    sim::rx.clear();
    setup();
    return query(3000);
  }
}

void chpcSend(const uint8_t *frame, size_t length) {
  for (size_t k = 0; k < length; k++) sim::rx.push_back(frame[k]);
}

void chpcSetTemp(const std::string &name, double value) {
  if (SimSensor *s = sensor(name)) s->temp = value;
}

void chpcConnect(const std::string &name, bool connected) {
  if (SimSensor *s = sensor(name)) s->connected = connected;
}

void chpcSetPower(double onWatts, double idleWatts) {
  compressorWatts = onWatts;
  offWatts = idleWatts;
}

void chpcSetFlow(bool flowOk) { sim::flow_adc = flowOk ? 0 : 1023; }

std::string chpcState() {
  char buf[256];
  snprintf(buf, sizeof(buf),
           "{\"compressor\":%d,\"hotPump\":%d,\"coldPump\":%d,\"sumpHeater\":%d,\"errorCount\":%u,\"eevPos\":%d,\"millis\":%lu}",
           compressor(), hotPump(), coldPump(), sumpHeater(), error_count, EEV_cur_pos, millis());
  return buf;
}

std::string chpcLcd() { return sim::lcd[0] + " | " + sim::lcd[1]; }
