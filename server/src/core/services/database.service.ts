// Zajętość bazy MongoDB dla stopki strony /devices (GET /api/devices/db-stats). Produkcja to Atlas M0
// z limitem 512 MB na dane i indeksy; limitu planu nie da się odczytać z bazy, dlatego jest stałą
// (decyzja użytkownika 2026-10-04: „Atlas M0, limit 512 MB”). Zajętość = dataSize + indexSize z db.stats(),
// a „działa” = odpowiedź na ping (z czasem odpowiedzi).
import mongoose from 'mongoose';

export const DATABASE_LIMIT_BYTES = 512 * 1024 * 1024;

export type DatabaseStats = {
  ok: boolean;
  usedBytes: number;
  dataBytes: number;
  indexBytes: number;
  limitBytes: number;
  collections: number;
  documents: number;
  pingMs: number;
};

export async function getDatabaseStats(): Promise<DatabaseStats> {
  const db = mongoose.connection.db;
  if (!db || mongoose.connection.readyState !== 1) throw new Error('Brak połączenia z bazą danych.');
  const started = Date.now();
  const ping = await db.command({ ping: 1 });
  const pingMs = Date.now() - started;
  const stats = await db.stats();
  const dataBytes = Number(stats.dataSize ?? 0);
  const indexBytes = Number(stats.indexSize ?? 0);
  return {
    ok: ping?.ok === 1,
    usedBytes: dataBytes + indexBytes,
    dataBytes,
    indexBytes,
    limitBytes: DATABASE_LIMIT_BYTES,
    collections: Number(stats.collections ?? 0),
    documents: Number(stats.objects ?? 0),
    pingMs,
  };
}
