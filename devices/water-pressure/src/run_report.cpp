#include <run_report.hpp>

#include <ArduinoJson.h>

std::string buildRunReport(const RunRecord &run, bool queued)
{
  JsonDocument document;
  document["runId"] = run.runId;
  document["pumpRunS"] = run.pumpRunS;
  if (run.compressorStartS >= 0) document["compressorStartS"] = run.compressorStartS;
  if (run.compressorEndS >= 0) document["compressorEndS"] = run.compressorEndS;
  document["restarts"] = run.restarts;
  if (queued) document["queued"] = true;

  std::string text;
  serializeJson(document, text);
  return text;
}

namespace {
// Nagłówek zapisu: bez niego (np. inny układ po aktualizacji) kolejka jest pusta.
struct QueueBlob {
  uint16_t version = 1;
  uint16_t count = 0;
  RunRecord runs[RunQueue::CAPACITY];
};
}

void RunQueue::load(BlobStore &store)
{
  QueueBlob blob;
  count = 0;
  if (store.read(KEY_RUN_QUEUE, &blob, sizeof(blob)) != sizeof(blob)) return;
  if (blob.version != 1 || blob.count > CAPACITY) return;
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
  if (previous.delivered || previous.runId == 0) return false;
  queue.push(previous);
  // zapisany rekord oznaczony jako obsłużony, żeby nie trafił do kolejki drugi raz
  previous.delivered = true;
  store.write(KEY_CURRENT_RUN, &previous, sizeof(previous));
  return true;
}
