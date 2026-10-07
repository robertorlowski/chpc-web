// Ustawienia regulatora kotła ze sterownika (POST /pellet-boiler-pelux200/settings): walidacja
// surowych odpowiedzi (hex), zapis ostatniego odczytu i rozkodowanie do panelu „Ustawienia
// zaawansowane” według ecomax-parameters.ts (parametry kotła w grupach, mieszacze).
import {
  ECOMAX_PARAMETER_GROUPS, ECOMAX_PARAMETERS, EcomaxParameterDefinition, MIXER_PARAMETERS,
} from '../ecomax-parameters';
import { PelletBoilerMode, PelletBoilerParameter, PelletBoilerScheduleSwitch, PelletBoilerSettingsRaw, PelletBoilerSettingsView } from '../types';
import {
  PelletBoilerSettingsEntry, PelletBoilerSettingsModel,
} from '../models/pellet-boiler-pelux200-settings.model';
import { getDeviceInfo } from '../../../core/services/device-info.service';
import { sendMessage } from '../../../core/websocket';

const RAW_KEYS = [
  'ecomax_parameters', 'mixer_parameters', 'thermostat_parameters', 'schedules', 'regulator_data_schema',
] as const;
// dane ramki mają najwyżej 1014 B (ramka do 1024 B)
const MAX_HEX_LENGTH = 2 * 1014;
const HEX = /^(?:[0-9a-f]{2})*$/i;

// Znane klucze z napisami hex; null, gdy body nie jest obiektem, wartość nie jest poprawnym hex
// albo brak odpowiedzi z parametrami kotła (bez niej panel nie ma czego pokazać).
export function validateSettingsUpload(body: unknown): PelletBoilerSettingsRaw | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const source = body as Record<string, unknown>;
  const result: PelletBoilerSettingsRaw = {};
  for (const key of RAW_KEYS) {
    const value = source[key];
    if (value === undefined) continue;
    if (typeof value !== 'string' || value.length > MAX_HEX_LENGTH || !HEX.test(value)) return null;
    result[key] = value.toLowerCase();
  }
  return result.ecomax_parameters && result.ecomax_parameters.length >= 6 ? result : null;
}

export async function savePelletBoilerSettings(rootId: string, raw: PelletBoilerSettingsRaw) {
  const device = await getDeviceInfo(rootId);
  await PelletBoilerSettingsModel.findOneAndUpdate(
    { rootId },
    { $set: { ...raw, rootId, deviceType: device.deviceType, deviceId: device.deviceId, readAt: new Date() } },
    { upsert: true },
  );
  sendMessage('update', rootId);
}

const bytes = (hex: string) => Uint8Array.from(Buffer.from(hex, 'hex'));

// (surowa − offset) × step, zaokrąglone jak w PyPlumIO; przełącznik zostaje 0/1.
function convert(definition: EcomaxParameterDefinition | undefined, raw: number): number {
  if (!definition || definition.kind === 'switch') return raw;
  const value = (raw - (definition.offset ?? 0)) * (definition.step ?? 1);
  return Math.round(value * 1e6) / 1e6;
}

function parameter(
  index: number, triple: [number, number, number], definition: EcomaxParameterDefinition | undefined,
): PelletBoilerParameter {
  return {
    index,
    name: definition?.name ?? null,
    label: definition?.label,
    description: definition?.description,
    rating: definition?.rating,
    unit: definition?.unit,
    kind: definition?.kind,
    // krok i przesunięcie: aplikacja liczy z nich wartość surową do zlecenia zmiany
    step: definition?.kind === 'switch' ? undefined : definition?.step,
    offset: definition?.kind === 'switch' ? undefined : definition?.offset,
    value: convert(definition, triple[0]),
    min: convert(definition, triple[1]),
    max: convert(definition, triple[2]),
    raw: triple,
  };
}

// Parametr nieużywany w tym kotle (pomijany): jak w PyPlumIO is_valid_parameter — żaden bajt
// nie jest ani 0xFF, ani 0 (np. FF FF FF albo nr 117 tego kotła: FF 00 FF).
function readTriples(data: Uint8Array, offset: number, count: number) {
  const triples: ([number, number, number] | null)[] = [];
  for (let i = 0; i < count; i++) {
    const at = offset + 3 * i;
    if (at + 3 > data.length) break;
    const triple: [number, number, number] = [data[at], data[at + 1], data[at + 2]];
    triples.push(triple.some((byte) => byte !== 0xff && byte !== 0) ? triple : null);
  }
  return triples;
}

export function decodeEcomaxParameters(hex: string): PelletBoilerParameter[] {
  const data = bytes(hex);
  if (data.length < 3) return [];
  const first = data[1];
  const triples = readTriples(data, 3, data[2]);
  return triples.flatMap((triple, i) =>
    triple ? [parameter(first + i, triple, ECOMAX_PARAMETERS[first + i])] : []);
}

// Harmonogramy regulatora (odpowiedź 0xB6, jak SchedulesStructure w PyPlumIO): [?, pierwszy, liczba] +
// liczba × (nr, przełącznik 0/1, parametr 3 B, 42 B tygodnia). Tylko przełącznik — godziny ustawia się na panelu.
export const SCHEDULE_NAMES = [
  'heating', 'water_heater', 'circulation_pump', 'boiler_work', 'boiler_clean', 'hear_exchanger_clean',
  'mixer_1', 'mixer_2', 'mixer_3', 'mixer_4', 'mixer_5',
];
const SCHEDULE_LABELS: Record<string, string> = {
  heating: 'Harmonogram CO', water_heater: 'Harmonogram CWU', circulation_pump: 'Harmonogram cyrkulacji',
  boiler_work: 'Harmonogram pracy kotła', boiler_clean: 'Harmonogram czyszczenia',
  hear_exchanger_clean: 'Harmonogram czyszczenia wymiennika', mixer_1: 'Harmonogram mieszacza 1',
  mixer_2: 'Harmonogram mieszacza 2',
};
const SCHEDULE_ENTRY_SIZE = 47;

export function decodeSchedules(hex: string): PelletBoilerScheduleSwitch[] {
  const data = bytes(hex);
  if (data.length < 3) return [];
  const result: PelletBoilerScheduleSwitch[] = [];
  for (let entry = 0; entry < data[2]; entry++) {
    const at = 3 + entry * SCHEDULE_ENTRY_SIZE;
    if (at + SCHEDULE_ENTRY_SIZE > data.length) break;
    const index = data[at];
    const name = SCHEDULE_NAMES[index] ?? `schedule_${index}`;
    result.push({ index, name, label: SCHEDULE_LABELS[name] ?? `Harmonogram nr ${index}`, enabled: data[at + 1] === 1 });
  }
  return result;
}

export function decodeMixerParameters(hex: string): { mixer: number; parameters: PelletBoilerParameter[] }[] {
  const data = bytes(hex);
  if (data.length < 4) return [];
  const [, first, count, mixers] = data;
  const result: { mixer: number; parameters: PelletBoilerParameter[] }[] = [];
  for (let mixer = 0; mixer < mixers; mixer++) {
    const triples = readTriples(data, 4 + mixer * count * 3, count);
    const parameters = triples.flatMap((triple, i) =>
      triple ? [parameter(first + i, triple, MIXER_PARAMETERS[first + i])] : []);
    if (parameters.length) result.push({ mixer: mixer + 1, parameters });
  }
  return result;
}

// Tryb z odczytu ustawień kotła: minimalna temperatura kotła (nr 99) < 50 °C = pompa ciepła.
export function boilerMode(settings: PelletBoilerSettingsEntry | null): PelletBoilerMode | null {
  const minimum = settings
    ? buildSettingsView(settings).groups.flatMap((g) => g.parameters).find((p) => p.index === 99)?.raw[0]
    : undefined;
  return minimum === undefined ? null : minimum < 50 ? 'heat-pump' : 'pellet';
}

export function buildSettingsView(entry: PelletBoilerSettingsEntry): PelletBoilerSettingsView {
  const parameters = entry.ecomax_parameters ? decodeEcomaxParameters(entry.ecomax_parameters) : [];
  const groupOf = (p: PelletBoilerParameter) => (p.index < ECOMAX_PARAMETERS.length ? ECOMAX_PARAMETERS[p.index].group : 'other');
  const groups = ECOMAX_PARAMETER_GROUPS
    .map((group) => ({ ...group, parameters: parameters.filter((p) => groupOf(p) === group.key) }))
    .filter((group) => group.parameters.length > 0);
  return {
    readAt: entry.readAt,
    deviceId: entry.deviceId,
    groups,
    mixers: entry.mixer_parameters ? decodeMixerParameters(entry.mixer_parameters) : [],
    schedules: entry.schedules ? decodeSchedules(entry.schedules) : [],
  };
}

export async function getPelletBoilerSettingsView(rootId: string): Promise<PelletBoilerSettingsView | null> {
  const entry = await PelletBoilerSettingsModel.findOne({ rootId }).lean<PelletBoilerSettingsEntry>();
  return entry ? buildSettingsView(entry) : null;
}
