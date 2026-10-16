#pragma once

#include <stddef.h>
#include <stdint.h>
#include <stdlib.h>

#include <ArduinoJson.h>

// Diagnostyka magistrali RS-485 (od 1.2.5, 2026-10-14: CHPC godzinami nie odpowiadał na odczyt, a DTU na tej
// samej magistrali tak). Zawsze, w każdej telemetrii:
//   serial_unexpected_frame — ramki, na które nikt nie czekał (np. odpowiedź CHPC po timeoucie odczytu)
//                              albo nie od urządzenia, od którego czekano; dotąd były po cichu pomijane;
//   hp_late_frame           — z nich ramki wyglądające na JSON z CHPC (pierwszy bajt '{'): CHPC odpowiada,
//                              ale za późno;
//   hp_last_ok_s            — sekundy od ostatniej poprawnej odpowiedzi CHPC (-1: od startu żadnej).
// Na zlecenie z chmury (pole "diag" w odpowiedzi na hp/add, brak pola = wszystko wyłączone):
//   hp_raw       — początek ostatniej nieudanej odpowiedzi CHPC (diag_hp_raw: hex, długość, wiek);
//   bus_sniff    — początek ostatniej nieoczekiwanej ramki (diag_bus: hex, długość, wiek, czas od naszej
//                  ostatniej ramki i jej kod operacji);
//   hp_timeout_s — dłuższe czekanie na odpowiedź CHPC (3–15 s, domyślnie 3 s), żeby sprawdzić, czy CHPC
//                  odpowiada wolniej.
// Telemetria odsyła aktywne ustawienia w polu "diag", więc w chmurze widać, że sterownik je przyjął.
// Nieznane klucze "diag" są pomijane: kolejne przełączniki dochodzą bez zmiany kontraktu.
struct DiagRequest {
  bool hpRaw = false;
  bool busSniff = false;
  // 0 = domyślny timeout odczytu (SerialBus)
  uint8_t hpTimeoutS = 0;

  static constexpr uint8_t HP_TIMEOUT_MIN_S = 3;
  static constexpr uint8_t HP_TIMEOUT_MAX_S = 15;

  bool active() const { return hpRaw || busSniff || hpTimeoutS != 0; }
  bool operator==(const DiagRequest &other) const
  {
    return hpRaw == other.hpRaw && busSniff == other.busSniff && hpTimeoutS == other.hpTimeoutS;
  }
};

// Wartość przełącznika: liczba albo napis ("1"), jak w operacjach; inne typy = wyłączone.
inline int diagValue(JsonVariantConst value)
{
  if (value.is<int>()) return value.as<int>();
  if (value.is<const char *>()) return atoi(value.as<const char *>());
  return 0;
}

// Pole "diag" z odpowiedzi chmury; brak pola albo inny typ = wszystko wyłączone.
// hp_timeout_s spoza 3–15 s jest pomijany (zostaje domyślny timeout).
inline DiagRequest parseDiagRequest(JsonVariantConst response)
{
  DiagRequest request;
  JsonObjectConst diag = response["diag"].as<JsonObjectConst>();
  if (diag.isNull()) return request;
  request.hpRaw = diagValue(diag["hp_raw"]) != 0;
  request.busSniff = diagValue(diag["bus_sniff"]) != 0;
  const int timeout = diagValue(diag["hp_timeout_s"]);
  if (timeout >= DiagRequest::HP_TIMEOUT_MIN_S && timeout <= DiagRequest::HP_TIMEOUT_MAX_S) {
    request.hpTimeoutS = static_cast<uint8_t>(timeout);
  }
  return request;
}

class BusDiagnostics {
public:
  // tyle początkowych bajtów ramki trafia do zrzutu (hex = 2 znaki na bajt)
  static constexpr size_t DUMP_BYTES = 48;

  void configure(const DiagRequest &value) { current = value; }
  const DiagRequest &request() const { return current; }

  // Poprawna odpowiedź CHPC (JSON).
  void onHpResponse(unsigned long now)
  {
    lastHpOkAt = now;
    hpOkSeen = true;
  }

  // Odpowiedź na odczyt CHPC, która nie jest poprawnym JSON-em.
  void onHpInvalid(const uint8_t *data, size_t length, unsigned long now)
  {
    if (current.hpRaw) hpRaw.capture(data, length, now, 0, 0);
  }

  // Ramka, na którą nikt nie czekał albo od innego urządzenia niż oczekiwane. sinceWriteMs i lastOperation:
  // czas od naszej ostatniej ramki i jej kod (SERIAL_OPERATION).
  void onUnexpectedFrame(const uint8_t *data, size_t length, unsigned long now,
    unsigned long sinceWriteMs, uint8_t lastOperation)
  {
    unexpectedFrames++;
    if (length > 0 && data[0] == '{') lateHpFrames++;
    if (current.busSniff) bus.capture(data, length, now, sinceWriteMs, lastOperation);
  }

  uint32_t unexpectedFrameCount() const { return unexpectedFrames; }
  uint32_t lateHpFrameCount() const { return lateHpFrames; }

  // Pola diagnostyki w dokumencie telemetrii; zrzuty tylko przy włączonym przełączniku i gdy coś złapano.
  void writeTo(JsonDocument &document, unsigned long now) const
  {
    document["serial_unexpected_frame"] = unexpectedFrames;
    document["hp_late_frame"] = lateHpFrames;
    document["hp_last_ok_s"] = hpOkSeen ? static_cast<long>((now - lastHpOkAt) / 1000UL) : -1L;

    if (current.active()) {
      JsonObject diag = document["diag"].to<JsonObject>();
      diag["hp_raw"] = current.hpRaw ? 1 : 0;
      diag["bus_sniff"] = current.busSniff ? 1 : 0;
      diag["hp_timeout_s"] = current.hpTimeoutS;
    } else {
      document.remove("diag");
    }
    if (current.hpRaw && hpRaw.length) hpRaw.writeTo(document["diag_hp_raw"].to<JsonObject>(), now, false);
    else document.remove("diag_hp_raw");
    if (current.busSniff && bus.length) bus.writeTo(document["diag_bus"].to<JsonObject>(), now, true);
    else document.remove("diag_bus");
  }

private:
  struct Dump {
    uint8_t bytes[DUMP_BYTES]{};
    size_t length = 0;
    size_t stored = 0;
    unsigned long at = 0;
    unsigned long sinceWriteMs = 0;
    uint8_t lastOperation = 0;

    void capture(const uint8_t *data, size_t frameLength, unsigned long now,
      unsigned long sinceWrite, uint8_t operation)
    {
      length = frameLength;
      stored = frameLength < DUMP_BYTES ? frameLength : DUMP_BYTES;
      for (size_t i = 0; i < stored; i++) bytes[i] = data[i];
      at = now;
      sinceWriteMs = sinceWrite;
      lastOperation = operation;
    }

    void writeTo(JsonObject target, unsigned long now, bool withWrite) const
    {
      static const char digits[] = "0123456789abcdef";
      char hex[DUMP_BYTES * 2 + 1];
      for (size_t i = 0; i < stored; i++) {
        hex[2 * i] = digits[bytes[i] >> 4];
        hex[2 * i + 1] = digits[bytes[i] & 0x0F];
      }
      hex[2 * stored] = 0;
      target["len"] = length;
      target["age_s"] = (now - at) / 1000UL;
      target["hex"] = hex;
      if (withWrite) {
        target["since_write_ms"] = sinceWriteMs;
        target["op"] = lastOperation;
      }
    }
  };

  DiagRequest current;
  uint32_t unexpectedFrames = 0;
  uint32_t lateHpFrames = 0;
  unsigned long lastHpOkAt = 0;
  bool hpOkSeen = false;
  Dump hpRaw;
  Dump bus;
};
