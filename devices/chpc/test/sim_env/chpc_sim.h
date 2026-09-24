// Symulacja firmware CHPC na PC: firmware (src/CHPC_firmware.ino) dołączony bez zmian,
// sprzęt zastąpiony atrapami z tego katalogu. Każdy katalog test/test_* to osobny proces,
// więc zmienne globalne firmware startują od zera; testy w jednym katalogu tworzą scenariusz.
#pragma once

#include <Arduino.h>


#include <map>
#include <string>

// Prototypy funkcji firmware użytych przed definicją (w Arduino IDE/PlatformIO dopisuje je konwersja .ino).
void StatsSerial(void);
void CheckIsInvalidCRCAddr(unsigned char *addr);
void eevise(void);

#include "../../src/CHPC_firmware.ino"

namespace chpc {

// ------------------------------------------------------------------ piny (BOARD_TYPE_G)
constexpr uint8_t PIN_COMPRESSOR = RELAY_HEATPUMP;       // 8
constexpr uint8_t PIN_HOT_PUMP = RELAY_HOTSIDE_CIRCLE;   // 7
constexpr uint8_t PIN_COLD_PUMP = RELAY_COLDSIDE_CIRCLE; // 10
constexpr uint8_t PIN_SUMP_HEATER = RELAY_SUMP_HEATER;   // 11

inline bool compressor() { return sim::pins[PIN_COMPRESSOR]; }
inline bool hotPump() { return sim::pins[PIN_HOT_PUMP]; }
inline bool coldPump() { return sim::pins[PIN_COLD_PUMP]; }
inline bool sumpHeater() { return sim::pins[PIN_SUMP_HEATER]; }

// Moc widziana przez przekładnik: sprężarka + ewentualny pobór przy wyłączonej (sklejony przekaźnik).
inline double compressorWatts = 1200.0;
inline double offWatts = 0.0;
inline void useDefaultPower() {
  sim::power_w = [] { return sim::pins[PIN_COMPRESSOR] ? compressorWatts : offWatts; };
}

// ------------------------------------------------------------------ czujniki
inline void makeAddr(uint8_t id, uint8_t *addr) {
  const uint8_t raw[7] = {0x28, id, 0x00, 0x00, 0x00, 0x00, 0x01};
  memcpy(addr, raw, 7);
  addr[7] = OneWire::crc8(addr, 7);
}

inline SimSensor *sensor(const std::string &name) {
  for (SimSensor &s : sim::sensors) if (s.name == name) return &s;
  return nullptr;
}

inline void setTemp(const std::string &name, double t) { sensor(name)->temp = t; }
inline void connectAll(bool connected = true) { for (SimSensor &s : sim::sensors) s.connected = connected; }

// Instalacja jak u użytkownika: Tae, Tbe, Ttarget, Tsump, Tbc podłączone; Tci/Tco niepodłączone.
inline void defaultWorld() {
  sim::sensors.clear();
  const char *names[] = {"Tae", "Tbe", "Ttarget", "Tsump", "Tbc"};
  const double temps[] = {5.0, 2.0, 30.0, 20.0, 40.0};
  for (int k = 0; k < 5; k++) {
    SimSensor s{names[k], {0}, temps[k], false};
    makeAddr((uint8_t)(0xA0 + k), s.addr);
    sim::sensors.push_back(s);
  }
  sim::flow_adc = 0;
}

// ------------------------------------------------------------------ czas
constexpr uint32_t LOOP_US = 100;  // czas jednego przebiegu loop() w symulacji

// stepUs: czas jednego przebiegu loop(); przy długich postojach można go zwiększyć,
// bo pomiar mocy (RMS z 2960 próbek) potrzebuje gęstych próbek tylko przy pracy sprężarki.
inline void runMs(uint64_t ms, uint32_t stepUs = LOOP_US) {
  const uint64_t end = sim::now_us + ms * 1000;
  while (sim::now_us < end) {
    loop();
    sim::now_us += stepUs;
  }
}

// Czeka (w czasie symulacji) aż warunek będzie spełniony; zwraca czas oczekiwania w ms albo -1.
template <typename Pred>
inline long waitUntil(Pred pred, uint64_t maxMs, uint32_t stepUs = LOOP_US) {
  const uint64_t start = sim::now_us;
  const uint64_t end = start + maxMs * 1000;
  while (sim::now_us < end) {
    if (pred()) return (long)((sim::now_us - start) / 1000);
    loop();
    sim::now_us += stepUs;
  }
  return pred() ? (long)((sim::now_us - start) / 1000) : -1;
}

// ------------------------------------------------------------------ wykrywanie czujników (pierwszy start)
// Odpowiada na komunikaty FindAddr() tak jak człowiek: podłącza czujnik, gdy firmware prosi
// "Insert X", odłącza po "OK! Remove X", a brakujący pomija przyciskiem ">".
inline void discoveryHook() {
  static size_t seen = 0;
  static size_t index = 0;
  static bool buttonHeld = false;
  const char *order[] = {"Tae", "Tbe", "Ttarget", "Tsump", "Tci", "Tco", "Thi", "Tho", "Tbc", "Tac", "Touter", "Tcwu"};
  if (buttonHeld) { sim::inputs[A3] = 0; buttonHeld = false; }
  std::string fresh = sim::tx.substr(seen);
  seen = sim::tx.size();
  if (index >= 12) return;
  const std::string name = order[index];
  SimSensor *s = sensor(name);
  if (fresh.find("OK! Remove " + name) != std::string::npos) {
    if (s) s->connected = false;
    index++;
  } else if (fresh.find("Skipped " + name) != std::string::npos) {
    index++;
  } else if (fresh.find("Press > to skip") != std::string::npos || fresh.find("Insert " + name) != std::string::npos) {
    if (s) s->connected = true;
    else { sim::inputs[A3] = 1; buttonHeld = true; }
  }
}

// Na prawdziwym procesorze restart zeruje zmienne globalne; w symulacji robimy to ręcznie
// dla tych, od których zależy setup() (EEPROM, czujniki, stany wyjść, liczniki błędów).
inline void resetGlobalsLikeReboot() {
  eeprom_addr = 0;
  used_sensors = 0;
  for (st_tsens &s : sensors) { memset(s.addr, 0, 8); s.e = false; s.T = 0; }
  heatpump_state = hotside_circle_state = coldside_circle_state = sump_heater_state = frost_protect = 0;
  hot_pomp_on = cold_pomp_on = sump_heater_on = false;
  start_force = 0;
  error_count = 0; err_last = 0; err_seq = 0; errorcode = ERR_OK; relay_fault = false;
  millis_prev = millis_last_heatpump_on = millis_last_heatpump_off = 0;
  millis_displ_update = millis_notification = millis_lasteesave = 0;
  millis_eev_last_close = millis_eev_last_on = millis_eev_last_step = 0;
  _1st_start_sleeped = 0; first_full_open = true;
  EEV_cur_pos = 0; EEV_apulses = 0; EEV_fast = 0; EEV_adonotcare = 0;
  sim::boot_us = sim::now_us;
}

inline void boot() {
  sim::on_delay = discoveryHook;
  setup();
  sim::on_delay = nullptr;
  connectAll();
}

// Typowy start scenariusza: świat jak u użytkownika, wykrycie czujników, przerwa startowa za nami.
inline void startAfterPowerOnPause() {
  defaultWorld();
  useDefaultPower();
  boot();
  runMs(POWERON_PAUSE + 2000, 1000);
}

inline void addSensor(const std::string &name, uint8_t id, double temp) {
  SimSensor s{name, {0}, temp, false};
  makeAddr(id, s.addr);
  sim::sensors.push_back(s);
}

// ------------------------------------------------------------------ RS-485 (jak co)
inline void sendFrame(uint8_t cmd, uint8_t d1 = 0, uint8_t d2 = 0) {
  const uint8_t f[5] = {0x41, cmd, d1, d2, 0xFF};
  for (uint8_t b : f) sim::rx.push_back(b);
}

// Zapytanie 0x01; zwraca linię JSON albo "" gdy brak odpowiedzi w timeoutMs.
// latencyUs: czas od wysłania do końca odpowiedzi (czas wirtualny).
inline std::string query(uint32_t timeoutMs = 3000, uint64_t *latencyUs = nullptr) {
  sim::tx.clear();
  sendFrame(0x01);
  const uint64_t start = sim::now_us;
  const uint64_t end = start + (uint64_t)timeoutMs * 1000;
  while (sim::now_us < end) {
    loop();
    sim::now_us += LOOP_US;
    size_t open = sim::tx.find("{\"Tbe\"");
    if (open != std::string::npos) {
      size_t close = sim::tx.find("}\r\n", open);
      if (close != std::string::npos) {
        if (latencyUs) *latencyUs = sim::now_us - start;
        return sim::tx.substr(open, close - open + 1);
      }
    }
  }
  return "";
}

// Wartość klucza z płaskiego JSON (liczba w cudzysłowie albo bez).
inline double jsonNumber(const std::string &json, const std::string &key) {
  const std::string k = "\"" + key + "\":";
  size_t p = json.find(k);
  if (p == std::string::npos) return NAN;
  p += k.size();
  if (json[p] == '"') p++;
  return atof(json.c_str() + p);
}

inline bool jsonHas(const std::string &json, const std::string &key) {
  return json.find("\"" + key + "\":") != std::string::npos;
}

}  // namespace chpc
