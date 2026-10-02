// Implementacja run_report.hpp: JSON wysyłki i kolejka uruchomień w NVS.
#include <run_report.hpp>

#include <ArduinoJson.h>

std::string buildRunReport(const RunRecord &run, bool queued)
{
  JsonDocument document;
  document["runId"] = run.runId;
  document["pumpRunS"] = run.pumpRunS;
  // pola opcjonalne: brak klucza = jeszcze nie było
  if (run.compressorStartS >= 0) document["compressorStartS"] = run.compressorStartS;
  if (run.compressorEndS >= 0) document["compressorEndS"] = run.compressorEndS;
  document["restarts"] = run.restarts;
  if (run.manualCompressorS > 0) document["manualCompressorS"] = run.manualCompressorS;
  if (queued) document["queued"] = true;

  std::string text;
  serializeJson(document, text);
  return text;
}

namespace {
// Nagłówek zapisu: bez niego (np. inny układ po aktualizacji) kolejka jest pusta.
// Wersja 2: RunRecord z manualCompressorS (1.3.0).
struct QueueBlob {
  uint16_t version = 2;
  uint16_t count = 0;
  RunRecord runs[RunQueue::CAPACITY];
};
}

void RunQueue::load(BlobStore &store)
{
  QueueBlob blob;
  count = 0;
  if (store.read(KEY_RUN_QUEUE, &blob, sizeof(blob)) != sizeof(blob)) return;
  // count spoza zakresu = uszkodzony zapis; kolejka zostaje pusta
  if (blob.version != 2 || blob.count > CAPACITY) return;
  count = blob.count;
  for (size_t index = 0; index < count; index++) runs[index] = blob.runs[index];
}

bool RunQueue::save(BlobStore &store) const
{
  QueueBlob blob;
  blob.count = static_cast<uint16_t>(count);
  for (size_t index = 0; index < count; index++) blob.runs[index] = runs[index];
  return store.write(KEY_RUN_QUEUE, &blob, sizeof(blob));
}

void RunQueue::push(const RunRecord &run)
{
  // pełna kolejka: wypada najstarsze uruchomienie
  if (count == CAPACITY) pop();
  runs[count++] = run;
}

void RunQueue::pop()
{
  if (count == 0) return;
  for (size_t index = 1; index < count; index++) runs[index - 1] = runs[index];
  count--;
}

bool queuePreviousRun(BlobStore &store, RunQueue &queue)
{
  RunRecord previous;
  if (store.read(KEY_CURRENT_RUN, &previous, sizeof(previous)) != sizeof(previous)) return false;
  // delivered: serwer zna uruchomienie i sam wyznaczył koniec pracy pompy;
  // runId 0: pusty rekord (sterownik nadaje numery od 1 wzwyż)
  if (previous.delivered || previous.runId == 0) return false;
  queue.push(previous);
  // zapisany rekord oznaczony jako obsłużony, żeby nie trafił do kolejki drugi raz
  previous.delivered = true;
  store.write(KEY_CURRENT_RUN, &previous, sizeof(previous));
  return true;
}
