// Ładowanie CWU w kotle zasilanym przez pompę ciepła (kocioł w trybie „Pompa ciepła” jest rozdzielaczem
// jej ciepła). Kocioł ma CWU najwyżej 45 °C, więc na czas ładowania woda z pompy musi być cieplejsza: pompa
// dostaje CO i CWU 47–49 °C (nadpisanie nad harmonogramem i ręcznymi polami, operation.service.ts). Po
// ładowaniu nadpisanie znika i pompa wraca do harmonogramu albo ustawień domyślnych.
// Moduł kotła nie importuje tego kodu: zgłasza stan przez API (PUT /hp/cwu-loading, kontroler
// cwu-loading.controller.ts) co minutę i przy każdym odczycie kotła; bez zgłoszenia przez
// CWU_LOADING_TTL_MS ładowanie wygasa (np. kocioł bez łączności), żeby pompa nie została na 47–49 °C.
import { CwuLoadingEntry, CwuLoadingModel } from '../models/cwu-loading.model';
import { OperationEntry } from '../types';
import { getEffectiveWorkMode, setCwuLoadingOperation } from './operation.service';

export const CWU_LOADING_OPERATION: OperationEntry = { co_min: '47', co_max: '49', cwu_min: '47', cwu_max: '49' };
export const CWU_LOADING_TTL_MS = 15 * 60 * 1000;

export type CwuLoadingStatus = {
  active: boolean;
  since: Date | null;
  /** pompa ciepła wyłączona (tryb OFF): ładowanie trwa, ale pompa nie grzeje */
  pumpOff: boolean;
};

const isActive = (entry: CwuLoadingEntry | null, now: Date) =>
  !!entry?.active && now.getTime() - new Date(entry.refreshedAt).getTime() < CWU_LOADING_TTL_MS;

const statusOf = (rootId: string, entry: CwuLoadingEntry | null, now: Date): CwuLoadingStatus => {
  const active = isActive(entry, now);
  return { active, since: active && entry?.since ? new Date(entry.since) : null, pumpOff: getEffectiveWorkMode(rootId) === 'OFF' };
};

// Zgłoszenie od kotła; zwraca true, gdy zmienił się stan (wtedy kontroler budzi sterownik co).
export async function setCwuLoading(rootId: string, active: boolean, since: Date | undefined, now = new Date()) {
  const before = await CwuLoadingModel.findOne({ rootId }).lean<CwuLoadingEntry>();
  const wasActive = isActive(before, now);
  const start = active ? (wasActive && before?.since ? before.since : since ?? now) : undefined;
  await CwuLoadingModel.updateOne(
    { rootId },
    { $set: { active, refreshedAt: now, ...(start ? { since: start } : {}) }, ...(start ? {} : { $unset: { since: 1 } }) },
    { upsert: true },
  );
  setCwuLoadingOperation(rootId, active ? CWU_LOADING_OPERATION : undefined);
  const entry = await CwuLoadingModel.findOne({ rootId }).lean<CwuLoadingEntry>();
  return { changed: wasActive !== active, status: statusOf(rootId, entry, now) };
}

// Stan dla ekranu głównego pompy (GET /hp/cwu-loading).
export async function getCwuLoading(rootId: string, now = new Date()) {
  return statusOf(rootId, await CwuLoadingModel.findOne({ rootId }).lean<CwuLoadingEntry>(), now);
}

// Scheduler pompy co minutę: nadpisanie w pamięci zgodne z bazą (po restarcie serwera) i wygaszenie
// ładowania bez odświeżenia od kotła.
export async function syncCwuLoading(rootId: string, now = new Date()) {
  const active = isActive(await CwuLoadingModel.findOne({ rootId }).lean<CwuLoadingEntry>(), now);
  setCwuLoadingOperation(rootId, active ? CWU_LOADING_OPERATION : undefined);
  return active;
}
