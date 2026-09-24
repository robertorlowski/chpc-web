// Atrapa środowiska Arduino do symulacji firmware CHPC na PC (pio test -e native).
// Czas jest wirtualny: delay() nie czeka, tylko przesuwa zegar i wywołuje hak świata symulacji.
#pragma once

#include <math.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>

#include <cmath>
#include <deque>
#include <functional>
#include <string>
#include <vector>

typedef uint8_t byte;
typedef bool boolean;

#define HIGH 1
#define LOW 0
#define INPUT 0
#define OUTPUT 1
#define DEC 10
#define HEX 16

#define A0 14
#define A1 15
#define A2 16
#define A3 17
#define A4 18
#define A5 19
#define A6 20
#define A7 21

#define bitRead(value, bit) (((value) >> (bit)) & 0x01)
#define bitSet(value, bit) ((value) |= (1UL << (bit)))
#define bitClear(value, bit) ((value) &= ~(1UL << (bit)))
#define bitWrite(value, bit, bitvalue) ((bitvalue) ? bitSet(value, bit) : bitClear(value, bit))
#define lowByte(w) ((uint8_t)((w) & 0xff))
#define highByte(w) ((uint8_t)((w) >> 8))
inline uint16_t word(uint8_t h, uint8_t l) { return (uint16_t)((h << 8) | l); }

// rejestry ADC używane przez ReadVcc(): 1126400 / 225 = 5006 mV
#define _BV(bit) (1 << (bit))
#define bit_is_set(sfr, bit) (0)
#define REFS0 6
#define MUX0 0
#define MUX1 1
#define MUX2 2
#define MUX3 3
#define MUX4 4
#define MUX5 5
#define ADSC 6
inline uint8_t ADMUX = 0;
inline uint8_t ADCSRA = 0;
inline uint8_t ADCL = 225;
inline uint8_t ADCH = 0;
inline void cli() {}
inline void sei() {}

class __FlashStringHelper;
#define F(s) (reinterpret_cast<const __FlashStringHelper *>(s))

// ---------------------------------------------------------------- String
class String {
public:
  String(const char *c = "") : s(c ? c : "") {}
  String(const std::string &v) : s(v) {}
  String(const __FlashStringHelper *f) : s(reinterpret_cast<const char *>(f)) {}
  explicit String(char c) : s(1, c) {}
  String(unsigned char v, unsigned char base = 10) : s(fmtU(v, base)) {}
  String(int v, unsigned char base = 10) : s(fmtS(v, base)) {}
  String(unsigned int v, unsigned char base = 10) : s(fmtU(v, base)) {}
  String(long v, unsigned char base = 10) : s(fmtS(v, base)) {}
  String(unsigned long v, unsigned char base = 10) : s(fmtU(v, base)) {}
  String(float v, unsigned char decimals = 2) : s(fmtD(v, decimals)) {}
  String(double v, unsigned char decimals = 2) : s(fmtD(v, decimals)) {}

  const char *c_str() const { return s.c_str(); }
  unsigned int length() const { return (unsigned int)s.size(); }
  void reserve(unsigned int n) { s.reserve(n); }
  char &operator[](unsigned int i) { if (i >= s.size()) { static char z = 0; z = 0; return z; } return s[i]; }
  char operator[](unsigned int i) const { return i < s.size() ? s[i] : 0; }
  bool startsWith(const String &p) const { return s.rfind(p.s, 0) == 0; }
  int indexOf(const String &p) const { size_t r = s.find(p.s); return r == std::string::npos ? -1 : (int)r; }

  String &operator=(const char *c) { s = c ? c : ""; return *this; }
  String &operator+=(const String &o) { s += o.s; return *this; }
  String &operator+=(const char *c) { s += c; return *this; }
  String &operator+=(char c) { s += c; return *this; }
  bool concat(const String &o) { s += o.s; return true; }
  bool concat(const char *c) { s += c; return true; }
  bool concat(char c) { s += c; return true; }
  bool operator==(const String &o) const { return s == o.s; }
  bool operator==(const char *c) const { return s == c; }
  bool operator!=(const String &o) const { return s != o.s; }
  bool operator!=(const char *c) const { return s != c; }

  friend String operator+(const String &a, const String &b) { return String(a.s + b.s); }
  friend String operator+(const String &a, const char *b) { return String(a.s + b); }
  friend String operator+(const char *a, const String &b) { return String(std::string(a) + b.s); }

  std::string s;

private:
  static std::string fmtU(unsigned long v, unsigned char base) {
    if (v == 0) return "0";
    std::string r;
    while (v) { int d = (int)(v % base); r.insert(r.begin(), (char)(d < 10 ? '0' + d : 'a' + d - 10)); v /= base; }
    return r;
  }
  static std::string fmtS(long v, unsigned char base) {
    if (base == 10 && v < 0) return "-" + fmtU((unsigned long)(-v), 10);
    return fmtU((unsigned long)v, base);
  }
  static std::string fmtD(double v, unsigned char decimals) {
    char buf[64];
    snprintf(buf, sizeof(buf), "%.*f", (int)decimals, v);
    return buf;
  }
};

// ---------------------------------------------------------------- Print
class Print {
public:
  virtual ~Print() {}
  virtual void out(const std::string &text) = 0;
  void print(const char *c) { out(c); }
  void print(const String &v) { out(v.s); }
  void print(const __FlashStringHelper *f) { out(reinterpret_cast<const char *>(f)); }
  void print(char c) { out(std::string(1, c)); }
  void print(unsigned char v, int base = DEC) { out(String(v, (unsigned char)base).s); }
  void print(int v, int base = DEC) { out(String(v, (unsigned char)base).s); }
  void print(unsigned int v, int base = DEC) { out(String(v, (unsigned char)base).s); }
  void print(long v, int base = DEC) { out(String(v, (unsigned char)base).s); }
  void print(unsigned long v, int base = DEC) { out(String(v, (unsigned char)base).s); }
  void print(double v, int digits = 2) { out(String(v, (unsigned char)digits).s); }
  void println() { out("\r\n"); }
  template <typename T> void println(const T &v) { print(v); println(); }
  template <typename T> void println(const T &v, int base) { print(v, base); println(); }
};

// ---------------------------------------------------------------- świat symulacji
struct SimRestart {};

struct SimSensor {
  std::string name;
  uint8_t addr[8];
  double temp;
  bool connected;
};

namespace sim {
inline uint64_t now_us = 0;
inline uint64_t boot_us = 0;  // chwila ostatniego (symulowanego) restartu: millis() liczy od niej
inline uint8_t pins[32] = {0};    // stan wyjść (digitalWrite)
inline uint8_t inputs[32] = {0};  // stan wejść cyfrowych (przyciski)
inline int flow_adc = 0;          // A7: > 818 (4 V) = brak przepływu
inline std::function<double()> power_w = [] { return pins[8] ? 1200.0 : 0.0; };  // moc widziana przez przekładnik
inline std::vector<SimSensor> sensors;
inline std::deque<uint8_t> rx;  // bajty RS-485 do sterownika
inline std::string tx;          // bajty RS-485 ze sterownika
inline std::string lcd[2];
inline std::string lcdLog;     // wszystko, co wypisano na LCD (komunikaty szybko nadpisuje rotacja ekranów)
inline unsigned long buzzer_count = 0;
inline std::function<void()> on_delay;  // hak świata wołany po każdym delay()
inline bool in_hook = false;
inline void hook() {
  if (on_delay && !in_hook) { in_hook = true; on_delay(); in_hook = false; }
}
}  // namespace sim

inline unsigned long millis() { return (unsigned long)((sim::now_us - sim::boot_us) / 1000); }
inline unsigned long micros() { return (unsigned long)sim::now_us; }
inline void delay(unsigned long ms) { sim::now_us += (uint64_t)ms * 1000; sim::hook(); }
inline void delayMicroseconds(unsigned int us) { sim::now_us += us; }
inline void pinMode(uint8_t, uint8_t) {}
inline void digitalWrite(uint8_t pin, uint8_t v) { sim::pins[pin] = v ? 1 : 0; }
inline int digitalRead(uint8_t pin) { return sim::inputs[pin]; }
inline void tone(uint8_t, unsigned int, unsigned long = 0) { sim::buzzer_count++; }
inline void noTone(uint8_t) {}
[[noreturn]] inline void simRestart() { throw SimRestart{}; }

// Przekładnik prądowy: sinusoida 50 Hz wokół 512 dobrana tak, by firmware
// (I_RATIO = 96 * Vcc / 1024, W = Irms * 230 - 120) policzył zadaną moc.
inline int analogRead(uint8_t pin) {
  if (pin == A7) return sim::flow_adc;
  if (pin != A6) return 0;
  const double ratio = 96.0 * (5006 / 1000.0) / 1024.0;
  const double watts = sim::power_w();
  const double irmsCounts = ((watts + 120.0) / 230.0) / ratio;
  const double phase = 2.0 * M_PI * 50.0 * (double)sim::now_us / 1e6;
  long v = lround(512.0 + irmsCounts * sqrt(2.0) * sin(phase));
  return v < 0 ? 0 : v > 1023 ? 1023 : (int)v;
}

class HardwareSerial : public Print {
public:
  void begin(unsigned long) {}
  int available() { return (int)sim::rx.size(); }
  int read() { if (sim::rx.empty()) return -1; int b = sim::rx.front(); sim::rx.pop_front(); return b; }
  void flush() {}
  void out(const std::string &text) override { sim::tx += text; }
};
inline HardwareSerial Serial;
