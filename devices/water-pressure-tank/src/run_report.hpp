#pragma once

#include <cstddef>
#include <cstdint>
#include <string>

// Stan jednego uruchomienia pompy w czasach względnych (sekundy od startu
// sterownika). Serwer zamienia je na daty według swojego zegara.
struct RunRecord {
  uint32_t runId = 0;
  uint32_t pumpRunS = 0;
  int32_t compressorStartS = -1;
  int32_t compressorEndS = -1;
  uint16_t restarts = 0;
  // Co najmniej jedna wiadomość na żywo doszła do chmury: serwer ma
  // uruchomienie i sam wyznacza koniec pracy pompy, więc nie trafia do kolejki.
  bool delivered = false;
};

// JSON dla POST /api/water-pressure-tank/add.
std::string buildRunReport(const RunRecord &run, bool queued);

// Pamięć trwała (NVS w sterowniku, atrapa w testach).
class BlobStore {
public:
  virtual ~BlobStore() = default;
  // Zwraca liczbę odczytanych bajtów (0, gdy brak klucza).
  virtual size_t read(const char *key, void *data, size_t size) = 0;
  virtual bool write(const char *key, const void *data, size_t size) = 0;
};

// Uruchomienia, podczas których nie było sieci. Wysyłane przy kolejnym starcie
// z siecią, najstarsze pierwsze; przy braku miejsca wypada najstarsze.
class RunQueue {
public:
  static constexpr size_t CAPACITY = 40;

  void load(BlobStore &store);
  bool save(BlobStore &store) const;
  void push(const RunRecord &run);
  bool empty() const { return count == 0; }
  size_t size() const { return count; }
  const RunRecord &front() const { return runs[0]; }
  void pop();

private:
  RunRecord runs[CAPACITY];
  size_t count = 0;
};

// Przy starcie: uruchomienie z poprzedniego startu, które nie doszło do chmury,
// trafia do kolejki. Zwraca true, gdy coś dodano.
bool queuePreviousRun(BlobStore &store, RunQueue &queue);

constexpr const char *KEY_CURRENT_RUN = "run_current";
constexpr const char *KEY_RUN_QUEUE = "run_queue";
