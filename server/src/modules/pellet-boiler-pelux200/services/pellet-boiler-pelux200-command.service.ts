// Zmiana parametrów regulatora kotła z aplikacji (etap 2). Aplikacja zleca zmiany (createCommands),
// sterownik pieca co kilkanaście sekund odbiera najstarsze oczekujące (takeNextCommand), wysyła je
// do regulatora i odsyła wynik (finishCommand). Wartość jest surowa (bajt z ramki), sprawdzana
// z zakresem min–max z ostatniego odczytu ustawień — regulator i tak odrzuci wartość spoza niego,
// a sterownik sprawdza to jeszcze raz na świeżym odczycie. Zapis w każdym stanie kotła
// (decyzja użytkownika 2026-10-04, jak fabryczny ecoNET300).
import { Types } from 'mongoose';
import { PelletBoilerCommandModel } from '../models/pellet-boiler-pelux200-command.model';
import { PelletBoilerSettingsEntry, PelletBoilerSettingsModel } from '../models/pellet-boiler-pelux200-settings.model';
import { PelletBoilerCommandChange, PelletBoilerCommandEntry, PelletBoilerParameter } from '../types';
import { buildSettingsView } from './pellet-boiler-pelux200-settings.service';
import { sendMessage } from '../../../core/websocket';

// najwięcej zmian w jednym zleceniu (przełącznik trybu pracy ma kilka)
const MAX_CHANGES = 16;
// zlecenie wysłane do sterownika bez wyniku przez tyle czasu wraca do kolejki (np. restart płytki)
export const SENT_TIMEOUT_MS = 3 * 60 * 1000;
// historia pokazywana w aplikacji
const RECENT_LIMIT = 20;

export class CommandError extends Error {}

const isInteger = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;

function findParameter(entry: PelletBoilerSettingsEntry, change: PelletBoilerCommandChange): PelletBoilerParameter | undefined {
  const view = buildSettingsView(entry);
  if (change.kind === 'ecomax') {
    return view.groups.flatMap((group) => group.parameters).find((p) => p.index === change.index);
  }
  return view.mixers.find((m) => m.mixer === change.mixer)?.parameters.find((p) => p.index === change.index);
}

// Sprawdza i zapisuje zmiany w podanej kolejności (kolejność ma znaczenie, np. minimum przed
// zadaną). Wcześniejsze oczekujące zlecenie tego samego parametru dostaje status „replaced”.
export async function createCommands(rootId: string, body: unknown): Promise<PelletBoilerCommandEntry[]> {
  const changes = (body as { changes?: unknown })?.changes;
  if (!Array.isArray(changes) || changes.length === 0 || changes.length > MAX_CHANGES) {
    throw new CommandError(`changes: od 1 do ${MAX_CHANGES} zmian`);
  }
  const settings = await PelletBoilerSettingsModel.findOne({ rootId }).lean<PelletBoilerSettingsEntry>();

  const valid: (PelletBoilerCommandChange & { previous: number; label?: string })[] = [];
  // Zakres zadanej zależy od innego parametru: zadana kotła (98) od min/max kotła (99/100),
  // zadana mieszacza (0) od jego min/max (1/2). Gdy zlecenie zmienia też granicę (wcześniej
  // w kolejności), zadana jest sprawdzana z nową granicą — regulator dostaje granicę pierwszą.
  const planned = (kind: string, mixer: number | undefined, index: number) =>
    valid.find((c) => c.kind === kind && c.mixer === mixer && c.index === index)?.value;
  const bounds = (change: PelletBoilerCommandChange, range: [number, number]): [number, number] => {
    const limits = change.kind === 'ecomax' ? (change.index === 98 ? [99, 100] : null) : (change.index === 0 ? [1, 2] : null);
    if (!limits) return range;
    const [minIndex, maxIndex] = limits;
    return [planned(change.kind, change.mixer, minIndex) ?? range[0], planned(change.kind, change.mixer, maxIndex) ?? range[1]];
  };
  for (const raw of changes as Record<string, unknown>[]) {
    const kind = raw?.kind;
    // włącz (1) / wyłącz (0) regulator (ramka 0x3B, firmware od 1.4.0): bez zakresu z odczytu ustawień
    if (kind === 'control') {
      if (raw.value !== 0 && raw.value !== 1) throw new CommandError('control: value 0 (wyłącz) albo 1 (włącz)');
      valid.push({ kind, index: 0, value: raw.value, previous: 1 - raw.value, label: raw.value ? 'Włącz kocioł' : 'Wyłącz kocioł' });
      continue;
    }
    if (kind !== 'ecomax' && kind !== 'mixer') throw new CommandError('kind: ecomax, mixer albo control');
    if (!settings) throw new CommandError('Brak odczytu ustawień kotła — sterownik jeszcze ich nie wysłał.');
    if (!isInteger(raw.index, 0, 255) || !isInteger(raw.value, 0, 255)) throw new CommandError('index i value: liczby 0–255');
    if (kind === 'mixer' && !isInteger(raw.mixer, 1, 5)) throw new CommandError('mixer: numer 1–5');
    const change: PelletBoilerCommandChange = {
      kind, index: raw.index, value: raw.value, ...(kind === 'mixer' ? { mixer: raw.mixer as number } : {}),
    };
    const parameter = findParameter(settings, change);
    if (!parameter) throw new CommandError(`Parametr ${kind} nr ${change.index} nie występuje w odczycie ustawień kotła.`);
    const [min, max] = bounds(change, [parameter.raw[1], parameter.raw[2]]);
    if (change.value < min || change.value > max) {
      throw new CommandError(`${parameter.label ?? parameter.name ?? change.index}: wartość poza zakresem regulatora.`);
    }
    valid.push({ ...change, previous: parameter.raw[0], label: parameter.label ?? parameter.name ?? undefined });
  }

  const created: PelletBoilerCommandEntry[] = [];
  for (const change of valid) {
    await PelletBoilerCommandModel.updateMany(
      { rootId, kind: change.kind, mixer: change.mixer, index: change.index, status: 'pending' },
      { $set: { status: 'replaced', doneAt: new Date() } },
    );
    const doc = await PelletBoilerCommandModel.create({ rootId, ...change, status: 'pending' });
    created.push(doc.toObject());
  }
  sendMessage('update', rootId);
  return created;
}

export const listRecentCommands = (rootId: string) =>
  PelletBoilerCommandModel.find({ rootId }).sort({ createdAt: -1 }).limit(RECENT_LIMIT).lean<PelletBoilerCommandEntry[]>();

// Dla sterownika: najstarsze oczekujące albo wysłane bez wyniku dłużej niż SENT_TIMEOUT_MS
// (oznaczane jako wysłane). null, gdy nic nie czeka.
export async function takeNextCommand(rootId: string, now = new Date()) {
  const stale = new Date(now.getTime() - SENT_TIMEOUT_MS);
  return PelletBoilerCommandModel.findOneAndUpdate(
    { rootId, $or: [{ status: 'pending' }, { status: 'sent', sentAt: { $lt: stale } }] },
    { $set: { status: 'sent', sentAt: now } },
    { sort: { createdAt: 1 }, new: true },
  ).lean<PelletBoilerCommandEntry>();
}

// Wynik od sterownika: ok = regulator potwierdził (0xB3/0xB4); inaczej błąd z opisem.
export async function finishCommand(rootId: string, body: unknown) {
  const { id, ok, error } = (body ?? {}) as { id?: unknown; ok?: unknown; error?: unknown };
  if (typeof id !== 'string' || !Types.ObjectId.isValid(id) || typeof ok !== 'boolean') {
    throw new CommandError('id (napis) i ok (boolean) są wymagane');
  }
  const updated = await PelletBoilerCommandModel.findOneAndUpdate(
    { _id: id, rootId, status: 'sent' },
    { $set: { status: ok ? 'done' : 'error', doneAt: new Date(), ...(ok ? {} : { error: String(error ?? 'błąd') }) } },
    { new: true },
  ).lean<PelletBoilerCommandEntry>();
  if (updated) sendMessage('update', rootId);
  return updated;
}
