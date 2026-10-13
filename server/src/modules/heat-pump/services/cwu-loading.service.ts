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
import { noteOperationChange } from './hp-operation-log.service';
import { systemMeta } from '../../../core/services/operation-log.service';
import { OperationMeta } from '../../../core/types';

// Dziennik operacji: dlaczego kocioł zmienił operację pompy (stan po zmianie).
function loadingMeta(entry: CwuLoadingEntry | null, now: Date): OperationMeta {
  if (isBlocked(entry, now)) {
    return systemMeta('Kocioł: CWU z peletu', 'Kocioł grzeje CWU peletem — pompa wstrzymana do ostygnięcia kotła (gorąca woda w skraplaczu zatrzymałaby sprężarkę).');
  }
  if (isActive(entry, now)) {
    return systemMeta('Kocioł: ładowanie CWU', 'Ładowanie CWU w kotle: pompa grzeje 47–49 °C (kocioł ma CWU najwyżej 45 °C).');
  }
  return systemMeta('Kocioł', entry && !isFresh(entry, now)
    ? 'Brak zgłoszenia od kotła przez 15 min — koniec ładowania CWU, pompa wraca do harmonogramu.'
    : 'Koniec ładowania CWU w kotle — pompa wraca do harmonogramu.');
}

export const CWU_LOADING_OPERATION: OperationEntry = { co_min: '47', co_max: '49', cwu_min: '47', cwu_max: '49' };
// CWU z peletu w kotle (moduł kotła, pellet-cwu.service.ts): od rozpalenia do ostygnięcia kotła poniżej BOILER_BLOCK_FROM
// pompa jest wyłączona — gorąca woda z kotła w skraplaczu zatrzymałaby sprężarkę błędem Tho. Nadpisanie
// wygrywa z ładowaniem i ręcznymi polami; po nim wraca harmonogram (work_mode i wymuszenie).
export const PELLET_BLOCK_OPERATION: OperationEntry = { work_mode: 'OFF', force: '0' };
export const CWU_LOADING_TTL_MS = 15 * 60 * 1000;
// Wstrzymanie przy gorącym kotle (zasada z 2026-10-10, liczy moduł kotła): pompa stoi, gdy kocioł się pali albo ma
// co najmniej BOILER_BLOCK_FROM, i rusza poniżej BOILER_BLOCK_FROM − BOILER_BLOCK_HYSTERESIS (52 / 50 °C; do 2026-10-13
// 50 / 48 °C i przez chwilę pole w Ustawieniach pompy). Kocioł dostaje próg w odpowiedzi na PUT /hp/cwu-loading (blockFrom).
// Próg = najwyższa temperatura, do której pompa może grzać (50 °C: aplikacja, serwer PUMP_TEMPERATURE_MAX, co i CHPC
// T_SETPOINT_MAX), + 2 °C, żeby pompa nie zatrzymała się na wodzie, którą sama nagrzała.
// UWAGA: podniesienie maksymalnej temperatury pompy powyżej 50 °C wymaga podniesienia BOILER_BLOCK_FROM (maks. + 2 °C)
// i wartości zapasowych w module kotła (HOT_BOILER_FROM, PELLET_CWU_PUMP_BLOCK_BELOW).
export const BOILER_BLOCK_FROM = 52;
export const BOILER_BLOCK_HYSTERESIS = 2;

export type CwuLoadingStatus = {
  active: boolean;
  since: Date | null;
  /** pompa ciepła wyłączona (tryb OFF): ładowanie trwa, ale pompa nie grzeje */
  pumpOff: boolean;
  /** pompa wstrzymana na czas CWU z peletu w kotle */
  pelletBlock: boolean;
  /** próg wstrzymania przy gorącym kotle [°C] i temperatura, poniżej której pompa rusza */
  blockFrom: number;
  resumeBelow: number;
};

const isFresh = (entry: CwuLoadingEntry | null, now: Date) =>
  !!entry && now.getTime() - new Date(entry.refreshedAt).getTime() < CWU_LOADING_TTL_MS;
const isActive = (entry: CwuLoadingEntry | null, now: Date) => !!entry?.active && isFresh(entry, now);
const isBlocked = (entry: CwuLoadingEntry | null, now: Date) => !!entry?.pelletBlock && isFresh(entry, now);

// Nadpisanie operacji: wstrzymanie (CWU z peletu) przed ładowaniem CWU.
const overrideOf = (entry: CwuLoadingEntry | null, now: Date) =>
  isBlocked(entry, now) ? PELLET_BLOCK_OPERATION : isActive(entry, now) ? CWU_LOADING_OPERATION : undefined;

const statusOf = (rootId: string, entry: CwuLoadingEntry | null, now: Date): CwuLoadingStatus => {
  const active = isActive(entry, now);
  return {
    active, since: active && entry?.since ? new Date(entry.since) : null,
    pumpOff: getEffectiveWorkMode(rootId) === 'OFF', pelletBlock: isBlocked(entry, now),
    blockFrom: BOILER_BLOCK_FROM, resumeBelow: BOILER_BLOCK_FROM - BOILER_BLOCK_HYSTERESIS,
  };
};

// Zgłoszenie od kotła; zwraca true, gdy zmienił się stan (wtedy kontroler budzi sterownik co).
// pelletBlock: CWU z peletu — pompa wstrzymana (brak pola = bez zmiany).
export async function setCwuLoading(rootId: string, active: boolean, since: Date | undefined, now = new Date(), pelletBlock?: boolean) {
  const before = await CwuLoadingModel.findOne({ rootId }).lean<CwuLoadingEntry>();
  const wasActive = isActive(before, now);
  const wasBlocked = isBlocked(before, now);
  const start = active ? (wasActive && before?.since ? before.since : since ?? now) : undefined;
  await CwuLoadingModel.updateOne(
    { rootId },
    {
      $set: { active, refreshedAt: now, ...(start ? { since: start } : {}), ...(pelletBlock !== undefined ? { pelletBlock } : {}) },
      ...(start ? {} : { $unset: { since: 1 } }),
    },
    { upsert: true },
  );
  const entry = await CwuLoadingModel.findOne({ rootId }).lean<CwuLoadingEntry>();
  setCwuLoadingOperation(rootId, overrideOf(entry, now));
  await noteOperationChange(rootId, loadingMeta(entry, now));
  return { changed: wasActive !== active || wasBlocked !== isBlocked(entry, now), status: statusOf(rootId, entry, now) };
}

// Pompa CO kotła (zgłaszana razem z ładowaniem CWU): co od 1.2.0 nie liczy wtedy COP (cop_pause,
// controller-contract.service.ts). Tylko w pamięci; bez zgłoszenia przez CWU_LOADING_TTL_MS = nie pracuje.
const boilerCoPump = new Map<string, { active: boolean; at: number }>();

export function setBoilerCoPump(rootId: string, active: boolean, now = new Date()) {
  boilerCoPump.set(rootId, { active, at: now.getTime() });
}

export function getBoilerCoPump(rootId: string, now = new Date()): boolean {
  const entry = boilerCoPump.get(rootId);
  return !!entry && entry.active && now.getTime() - entry.at < CWU_LOADING_TTL_MS;
}

// Stan dla ekranu głównego pompy (GET /hp/cwu-loading).
export async function getCwuLoading(rootId: string, now = new Date()) {
  return statusOf(rootId, await CwuLoadingModel.findOne({ rootId }).lean<CwuLoadingEntry>(), now);
}

// Scheduler pompy co minutę: nadpisanie w pamięci zgodne z bazą (po restarcie serwera) i wygaszenie
// ładowania bez odświeżenia od kotła.
export async function syncCwuLoading(rootId: string, now = new Date()) {
  const entry = await CwuLoadingModel.findOne({ rootId }).lean<CwuLoadingEntry>();
  setCwuLoadingOperation(rootId, overrideOf(entry, now));
  // wygaśnięcie bez zgłoszenia od kotła (scheduler zaraz potem liczy operację, różnica już będzie zapisana)
  await noteOperationChange(rootId, loadingMeta(entry, now));
  return isActive(entry, now);
}
