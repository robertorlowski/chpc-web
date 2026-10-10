// Ustawienia pieca: główne parametry regulatora ze zmianą z aplikacji (etap 2). Wartości z ostatniego
// odczytu ustawień (GET /pellet-boiler-pelux200/settings); ikona zmiany otwiera panel z opisem,
// zakresem i oceną z docs/parametry-kotla.md. Zmiana to zlecenie (POST /commands): sterownik pieca
// odbiera je w ciągu ok. 15 s, wysyła do regulatora (w każdym stanie kotła) i czyta ustawienia od
// nowa. Przełącznik „Pompa ciepła / Pellet” zleca cały zestaw z kociol-ustawienia.md, punkt 4b,
// w kolejności, w jakiej regulator go przyjmie (najpierw granice, potem zadane).
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { IconButton } from '../../../core/components/IconButton';
import { EditIcon } from '../../../core/components/icons';
import '../../../core/components/deviceEditModal.css';
import { PelletBoilerRequests } from '../api';
import {
  PelletBoilerChange, PelletBoilerCommand, PelletBoilerCurrentSchedule, PelletBoilerMode, PelletBoilerParameter,
  PelletBoilerScheduleSettings, PelletBoilerReading, PelletBoilerSettings, PelletBoilerTurnOnCheck,
} from '../types';
import { WinterCycleStatus } from './WinterCycleStatus';
import { formatDateTime, formatNumber, readingStateName, stateName, workModeName } from '../utils/boiler';
import { NOT_RESPONDING_TEXT, useLastReading } from '../utils/useLastReading';
import { useHeatPumpLinked } from '../utils/useHeatPumpLinked';

// zdarzenie okna po zleceniu zmiany: MainParameters odświeża wartości i „Ostatnie zmiany”
export const COMMANDS_CHANGED = 'pellet-boiler-commands-changed';

export type Item ={ kind: 'ecomax' | 'mixer'; mixer?: number; index: number };

// Grupa „Głównych parametrów”: na liście tylko temperatura zadana (pierwszy element), ołówek otwiera
// panel ze wszystkimi parametrami grupy. min/max: numery granic zadanej (kolejność wysyłki).
// cleanSchedule: w grupie także przełącznik harmonogramu czyszczenia (Kocioł; zlecenie schedule, firmware od 1.8.0)
// weather: mieszacz ze sterowaniem pogodowym (nr 4 Tak/Nie); krzywa (nr 5) i przesunięcie (nr 6) tylko przy „Tak”,
// zadana (nr 0) jest wtedy liczona z krzywej (decyzja użytkownika 2026-10-08)
type Section = { title: string; items: Item[]; min?: number; max?: number; cleanSchedule?: boolean; weather?: boolean };
const ecomax = (indexes: number[]): Item[] => indexes.map((index) => ({ kind: 'ecomax', index }));
const mixerItems = (mixer: number, indexes: number[]): Item[] => indexes.map((index) => ({ kind: 'mixer', mixer, index }));
const WEATHER_SWITCH = 4;
const WEATHER_FIELDS = [5, 6];
const SECTIONS: Section[] = [
  { title: 'Kocioł', items: ecomax([98, 99, 17, 101, 105]), min: 99, cleanSchedule: true },
  { title: 'CWU', items: ecomax([119, 123, 122]) },
  { title: 'Mieszacz 1 (grzejniki)', items: mixerItems(1, [0, 1, 2, 4, 5, 6]), min: 1, max: 2, weather: true },
  // mieszacz 2: regulator nie podaje nastaw (same FF), serwer zakłada zadaną 20–40 °C i zakresy mieszacza 1
  { title: 'Mieszacz 2', items: mixerItems(2, [0, 4, 5, 6]), weather: true },
];

// Mieszacz bez nastaw w odczycie ustawień (mieszacz 2: regulator podaje same FF): zadana z ostatniego
// odczytu pracy (SensorData, mixer<n>_target), bez ołówka — zmiana tylko na panelu kotła.
function ReadOnlyMixerTarget({ item, reading }: { item: Item; reading: PelletBoilerReading | null }) {
  const target = item.kind === 'mixer'
    ? reading?.[`mixer${item.mixer}_target` as keyof PelletBoilerReading]
    : undefined;
  return (
    <>
      {typeof target === 'number' && (
        <div className="boiler-main-row">
          <span className="boiler-main-label">Temperatura zadana mieszacza</span>
          <span className="boiler-parameter-value">{formatNumber(target)} °C</span>
        </div>
      )}
      <div className="boiler-hint">
        {typeof target === 'number' ? 'Z odczytu pracy kotła. ' : ''}
        Regulator nie podaje nastaw tego mieszacza — zmiana tylko na panelu kotła.
      </div>
    </>
  );
}

// Wybory zamiast liczb (kolejność według kopii ustawień; 125 niepotwierdzona na kotle).
export const CHOICES: Record<string, string[]> = {
  'ecomax:122': ['Wyłączony', 'Priorytet', 'Bez priorytetu'],
  'ecomax:125': ['Zima', 'Lato', 'Auto'],
  // sterowanie pogodowe mieszacza (nr 4): Nie / Tak (decyzja użytkownika 2026-10-08)
  'mixer:4': ['Nie', 'Tak'],
};
export const choicesOf = (item: Item, parameter: PelletBoilerParameter) =>
  CHOICES[`${item.kind}:${item.index}`] ?? (parameter.kind === 'switch' ? ['wył.', 'wł.'] : null);

// Nastawy trybów pracy przychodzą z serwera (GET /schedule-settings, pole profiles; edycja w Ustawieniach
// zaawansowanych, grupa „Pompa ciepła / Pellet”). Klucz „ecomax:<nr>” albo „mixer<n>:<nr>”.
export const PROFILE_ROWS = [
  'ecomax:99', 'ecomax:98', 'ecomax:17', 'ecomax:101', 'ecomax:105', 'ecomax:122',
  'mixer1:1', 'mixer1:2', 'mixer1:4', 'mixer1:0',
];
export const itemOfKey = (key: string): Item => {
  const [where, index] = key.split(':');
  return where === 'ecomax'
    ? { kind: 'ecomax', index: Number(index) }
    : { kind: 'mixer', mixer: Number(where.slice(5)), index: Number(index) };
};

// Kolejność, którą regulator przyjmie: granice poszerzające zakres zadanej (min w dół, max w górę),
// potem zadane (kotła nr 98, mieszacza nr 0), potem granice zawężające, na końcu reszta.
export const orderChanges = (changes: PelletBoilerChange[], settings: PelletBoilerSettings | null) => {
  const rank = (change: PelletBoilerChange) => {
    const current = findIn(settings, change)?.raw[0] ?? change.value;
    const raising = change.value > current;
    const role = change.kind === 'ecomax'
      ? ({ 99: 'min', 100: 'max', 98: 'target' } as Record<number, string>)[change.index]
      : ({ 1: 'min', 2: 'max', 0: 'target' } as Record<number, string>)[change.index];
    if (role === 'min') return raising ? 2 : 0;
    if (role === 'max') return raising ? 0 : 2;
    return role === 'target' ? 1 : 3;
  };
  return changes.map((change, i) => ({ change, i, r: rank(change) }))
    .sort((a, b) => a.r - b.r || a.i - b.i).map(({ change }) => change);
};

type Profile = { key: PelletBoilerMode; label: string; changes: PelletBoilerChange[] };
// stany „postoju” regulatora (pauza, czuwanie): zmiana trybu dozwolona z wyłączeniem regulatora
const STANDBY_STATES = [5, 6];
const PROFILE_LABEL: Record<PelletBoilerMode, string> = { 'heat-pump': 'Pompa ciepła', pellet: 'Pellet' };

const CONTROL_LABEL = (value: number) => (value ? 'Kocioł → włączony' : 'Kocioł → wyłączony');
// harmonogram czyszczenia kotła w regulatorze (nr 4 w PyPlumIO); godziny ustawia się na panelu
const CLEAN_SCHEDULE = 4;

const STATUS_TEXT: Record<PelletBoilerCommand['status'], string> = {
  pending: 'czeka na sterownik',
  sent: 'wysyłane do kotła',
  done: 'zapisane',
  error: 'błąd',
  replaced: 'zastąpione nowszą zmianą',
};

// parametr z odczytu ustawień; polecenie włącz/wyłącz (kind control) i harmonogram (schedule) nie są parametrami
const findIn = (settings: PelletBoilerSettings | null, item: { kind: string; mixer?: number; index: number }) =>
  item.kind === 'control' || item.kind === 'schedule' ? undefined
  : item.kind === 'ecomax'
    ? settings?.groups?.flatMap((group) => group.parameters).find((p) => p.index === item.index)
    : settings?.mixers?.find((m) => m.mixer === item.mixer)?.parameters.find((p) => p.index === item.index);

// wartość w jednostkach → surowa (bajt) i z powrotem
const toRaw = (parameter: PelletBoilerParameter, value: number) =>
  Math.round(value / (parameter.step ?? 1) + (parameter.offset ?? 0));
const fromRaw = (parameter: PelletBoilerParameter, raw: number) =>
  Math.round((raw - (parameter.offset ?? 0)) * (parameter.step ?? 1) * 1e6) / 1e6;

export const display = (item: Item, parameter: PelletBoilerParameter, value: number) => {
  const choices = choicesOf(item, parameter);
  if (choices) return choices[value] ?? String(value);
  return `${formatNumber(value, 2)}${parameter.unit ? ` ${parameter.unit}` : ''}`;
};

export const ratingClass = (rating?: string) => {
  const text = (rating ?? '').toLowerCase();
  if (text.startsWith('bezpieczny')) return 'boiler-rating-safe';
  if (text.startsWith('ostrożnie')) return 'boiler-rating-careful';
  if (text.startsWith('tylko serwis') || text.startsWith('nie ruszać')) return 'boiler-rating-service';
  return '';
};

const errorMessage = async (response: Response | null | undefined) => {
  try {
    return (await response?.json())?.message ?? 'Nie udało się zlecić zmiany.';
  } catch {
    return 'Nie udało się zlecić zmiany.';
  }
};

// Panel zmiany jednego parametru: opis, zakres, ocena i pole wartości.
export const EditPanel: React.FC<{
  item: Item; parameter: PelletBoilerParameter; onClose: () => void; onSent: () => void;
}> = ({ item, parameter, onClose, onSent }) => {
  const choices = choicesOf(item, parameter);
  const [value, setValue] = useState(String(parameter.value));
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  // parametr serwisowy („Tylko serwis”, „Nie ruszać”): zapis dopiero po zaznaczeniu potwierdzenia
  const service = ratingClass(parameter.rating) === 'boiler-rating-service';
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  const send = async (event: FormEvent) => {
    event.preventDefault();
    const number = Number(value.replace(',', '.'));
    if (!Number.isFinite(number) || number < parameter.min || number > parameter.max) {
      return setError(`Dozwolone: ${display(item, parameter, parameter.min)} – ${display(item, parameter, parameter.max)}.`);
    }
    setSending(true);
    const response = await PelletBoilerRequests.postCommands([{ ...item, value: toRaw(parameter, number) }]);
    setSending(false);
    if (response?.status === 201) {
      // inne panele (główne parametry, ostatnie zmiany) odświeżają się na to zdarzenie
      window.dispatchEvent(new Event(COMMANDS_CHANGED));
      return onSent();
    }
    setError(await errorMessage(response));
  };

  return (
    <div className="device-modal-backdrop" onClick={onClose}>
      <form className="device-modal boiler-edit" role="dialog" aria-modal="true" aria-labelledby="boiler-edit-title"
        onClick={(event) => event.stopPropagation()} onSubmit={send}>
        <h2 id="boiler-edit-title">{parameter.label ?? parameter.name}</h2>
        <div>Teraz: <strong>{display(item, parameter, parameter.value)}</strong>
          {' '}· zakres {display(item, parameter, parameter.min)} – {display(item, parameter, parameter.max)}</div>
        {parameter.description && <div className="boiler-parameter-description">{parameter.description}</div>}
        {parameter.rating && <div className={`boiler-parameter-rating ${ratingClass(parameter.rating)}`}>{parameter.rating}</div>}
        <label>
          <span>Nowa wartość{parameter.unit && !choices ? ` [${parameter.unit}]` : ''}</span>
          {choices ? (
            <select value={value} onChange={(event) => setValue(event.currentTarget.value)}>
              {choices.map((label, index) => index >= parameter.min && index <= parameter.max
                && <option key={label} value={String(index)}>{label}</option>)}
            </select>
          ) : (
            <input type="number" inputMode="decimal" step={parameter.step ?? 1} min={parameter.min} max={parameter.max}
              value={value} onChange={(event) => setValue(event.currentTarget.value)} autoFocus />
          )}
        </label>
        <div className="boiler-hint">
          Sterownik wyśle zmianę do regulatora w ciągu ok. 15–30 s (także przy pracującym kotle),
          a potem odczyta ustawienia od nowa.
        </div>
        {service && (
          <label className="boiler-confirm">
            <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.currentTarget.checked)} />
            Rozumiem, że to parametr serwisowy, i zmieniam go na własną odpowiedzialność.
          </label>
        )}
        {error && <p className="device-modal-error">{error}</p>}
        <div className="device-modal-actions">
          <button type="button" onClick={onClose}>Anuluj</button>
          <button type="submit" disabled={sending || (service && !confirmed)}>Zapisz</button>
        </div>
      </form>
    </div>
  );
};

// Panel grupy: wszystkie parametry grupy w jednym formularzu; wysyłane tylko zmienione, w kolejności,
// którą regulator przyjmie: najpierw granice poszerzające zakres zadanej, potem zadana, potem granice
// zawężające, na końcu reszta. Zadana sprawdzana z nowymi granicami z tego samego formularza.
const GroupEditPanel: React.FC<{
  section: Section; settings: PelletBoilerSettings; reading: PelletBoilerReading | null; onClose: () => void; onSent: () => void;
}> = ({ section, settings, reading, onClose, onSent }) => {
  const fields = section.items
    .map((item) => ({ item, parameter: findIn(settings, item) }))
    .filter((field): field is { item: Item; parameter: PelletBoilerParameter } => !!field.parameter);
  // wartości na starcie; nastawa nieznana (mieszacz 2) pusta, tylko zadana podpowiedziana z odczytu pracy kotła
  const [initial] = useState<Record<number, string>>(() => Object.fromEntries(fields.map(({ item, parameter }) => {
    if (!parameter.unknown) return [item.index, String(parameter.value)];
    const target = item.kind === 'mixer' && item.index === 0
      ? reading?.[`mixer${item.mixer}_target` as keyof PelletBoilerReading]
      : undefined;
    return [item.index, typeof target === 'number' ? String(target) : ''];
  })));
  const [values, setValues] = useState<Record<number, string>>(initial);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  // harmonogram czyszczenia (Kocioł): Tak/Nie, wysyłany po parametrach, gdy zmieniony
  const schedule = section.cleanSchedule ? settings.schedules?.find((entry) => entry.index === CLEAN_SCHEDULE) : undefined;
  const [scheduleOn, setScheduleOn] = useState(schedule?.enabled ?? false);
  const scheduleChanged = !!schedule && scheduleOn !== schedule.enabled;

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  const numberOf = (index: number) => Number((values[index] ?? '').replace(',', '.'));
  // sterowanie pogodowe: krzywa i przesunięcie tylko przy „Tak”, zadana wtedy liczona z krzywej
  const weatherOn = !!section.weather && values[WEATHER_SWITCH] === '1';
  const hidden = (index: number) => !!section.weather && WEATHER_FIELDS.includes(index) && !weatherOn;
  // nastawa nieznana (mieszacz 2): zmieniona, gdy wpisano coś innego niż na starcie
  const changed = fields.filter(({ item, parameter }) => !hidden(item.index) && (parameter.unknown
    ? (values[item.index] ?? '') !== '' && values[item.index] !== initial[item.index]
    : toRaw(parameter, numberOf(item.index)) !== parameter.raw[0]));
  const service = changed.some(({ parameter }) => ratingClass(parameter.rating) === 'boiler-rating-service');

  const send = async (event: FormEvent) => {
    event.preventDefault();
    if (changed.length === 0 && !scheduleChanged) return onClose();
    const target = section.items[0].index;
    for (const { item, parameter } of changed) {
      const number = numberOf(item.index);
      let [min, max] = [parameter.min, parameter.max];
      if (item.index === target) {
        if (section.min !== undefined && values[section.min] !== undefined) min = numberOf(section.min);
        if (section.max !== undefined && values[section.max] !== undefined) max = numberOf(section.max);
      }
      if (!Number.isFinite(number) || number < min || number > max) {
        return setError(`${parameter.label ?? parameter.name}: dozwolone ${display(item, parameter, min)} – ${display(item, parameter, max)}.`);
      }
    }
    const rank = ({ item, parameter }: (typeof changed)[number]) => {
      const raising = toRaw(parameter, numberOf(item.index)) > parameter.raw[0];
      if (item.index === section.min) return raising ? 2 : 0;
      if (item.index === section.max) return raising ? 0 : 2;
      return item.index === target ? 1 : 3;
    };
    const ordered = [...changed].sort((a, b) => rank(a) - rank(b));
    setSending(true);
    const response = await PelletBoilerRequests.postCommands([
      ...ordered.map(({ item, parameter }): PelletBoilerChange => ({ ...item, value: toRaw(parameter, numberOf(item.index)) })),
      ...(scheduleChanged ? [{ kind: 'schedule', index: CLEAN_SCHEDULE, value: scheduleOn ? 1 : 0 } as PelletBoilerChange] : []),
    ]);
    setSending(false);
    if (response?.status === 201) {
      window.dispatchEvent(new Event(COMMANDS_CHANGED));
      return onSent();
    }
    setError(await errorMessage(response));
  };

  return (
    <div className="device-modal-backdrop" onClick={onClose}>
      <form className="device-modal boiler-edit" role="dialog" aria-modal="true" aria-labelledby="boiler-group-title"
        onClick={(event) => event.stopPropagation()} onSubmit={send}>
        <h2 id="boiler-group-title">{section.title}</h2>
        {fields.map(({ item, parameter }) => {
          if (hidden(item.index)) return null;
          const choices = choicesOf(item, parameter);
          const value = values[item.index];
          const set = (next: string) => setValues({ ...values, [item.index]: next });
          const fromCurve = weatherOn && item.index === 0 && section.weather;
          return (
            <div key={item.index} className="boiler-group-field">
              <label>
                <span>
                  {parameter.label ?? parameter.name}
                  {parameter.unit && !choices ? ` [${parameter.unit}]` : ''}
                </span>
                {choices ? (
                  <select value={value} onChange={(event) => set(event.currentTarget.value)}>
                    {parameter.unknown && <option value="">— nieznane —</option>}
                    {choices.map((label, index) => index >= parameter.min && index <= parameter.max
                      && <option key={label} value={String(index)}>{label}</option>)}
                  </select>
                ) : (
                  <input type="number" inputMode="decimal" step={parameter.step ?? 1} value={value} disabled={fromCurve}
                    placeholder={parameter.unknown ? 'nieznana' : undefined}
                    onChange={(event) => set(event.currentTarget.value)} />
                )}
              </label>
              {fromCurve && <div className="boiler-hint">Przy sterowaniu pogodowym zadaną liczy regulator z krzywej.</div>}
              <details className="boiler-hint">
                <summary>zakres {display(item, parameter, parameter.min)} – {display(item, parameter, parameter.max)}</summary>
                {parameter.description && <div className="boiler-parameter-description">{parameter.description}</div>}
                {parameter.rating && <div className={`boiler-parameter-rating ${ratingClass(parameter.rating)}`}>{parameter.rating}</div>}
              </details>
            </div>
          );
        })}
        {schedule && (
          <div className="boiler-group-field">
            <label>
              <span>{schedule.label}</span>
              <select value={scheduleOn ? '1' : '0'} onChange={(event) => setScheduleOn(event.currentTarget.value === '1')}>
                <option value="1">Tak</option>
                <option value="0">Nie</option>
              </select>
            </label>
          </div>
        )}
        <div className="boiler-hint">
          Wysyłane są tylko zmienione pola. Sterownik przekaże je regulatorowi po kolei w ciągu
          ok. 15–30 s każde (także przy pracującym kotle).
        </div>
        {service && (
          <label className="boiler-confirm">
            <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.currentTarget.checked)} />
            Rozumiem, że zmieniam parametr serwisowy, na własną odpowiedzialność.
          </label>
        )}
        {error && <p className="device-modal-error">{error}</p>}
        <div className="device-modal-actions">
          <button type="button" onClick={onClose}>Anuluj</button>
          <button type="submit" disabled={sending || (service && !confirmed)}>Zapisz</button>
        </div>
      </form>
    </div>
  );
};

export const MainParameters: React.FC = () => {
  const [settings, setSettings] = useState<PelletBoilerSettings | null | undefined>(undefined);
  const [commands, setCommands] = useState<PelletBoilerCommand[]>([]);
  const [editing, setEditing] = useState<Section | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [scheduleSettings, setScheduleSettings] = useState<PelletBoilerScheduleSettings | null>(null);
  const [profileError, setProfileError] = useState('');
  const [recentOpen, setRecentOpen] = useState(false);
  // zmiana trybu przy pracującym regulatorze: najpierw wyłączenie, nastawy czekają na stan „wyłączony”
  const [profileNeedsOff, setProfileNeedsOff] = useState(false);
  const [turnOnAfter, setTurnOnAfter] = useState(true);

  const load = useCallback(() => {
    PelletBoilerRequests.getSettings().then(setSettings);
    PelletBoilerRequests.getScheduleSettings().then(setScheduleSettings);
    PelletBoilerRequests.getCommands().then((result) => setCommands(result ?? []));
  }, []);
  useEffect(() => {
    load();
    window.addEventListener(COMMANDS_CHANGED, load);
    return () => window.removeEventListener(COMMANDS_CHANGED, load);
  }, [load]);

  // zlecenia w toku: odświeżanie co 10 s (wynik i nowe wartości po ponownym odczycie ustawień)
  const inProgress = commands.some((c) => c.status === 'pending' || c.status === 'sent');
  useEffect(() => {
    if (!inProgress) return undefined;
    const timer = window.setInterval(load, 10_000);
    return () => window.clearInterval(timer);
  }, [inProgress, load]);

  // tylko zmiany, które coś zmieniają (parametr bez odczytu zostaje — serwer go odrzuci z opisem)
  const pendingChanges = (changes: PelletBoilerChange[]) => orderChanges(
    changes.filter((change) => findIn(settings ?? null, change)?.raw[0] !== change.value), settings ?? null);
  const profiles: Profile[] = (['heat-pump', 'pellet'] as PelletBoilerMode[]).map((key) => ({
    key, label: PROFILE_LABEL[key],
    changes: Object.entries(scheduleSettings?.profiles[key] ?? {}).map(([name, value]) => ({ ...itemOfKey(name), value })),
  }));

  // Tryb pracy tylko przy wyłączonym kotle: przy pracującym regulatorze zlecenie to „wyłącz”, nastawy
  // z waitOff (serwer wysyła je po odczycie ze stanem 0) i opcjonalnie „włącz” na końcu.
  const sendProfile = async () => {
    if (!profile) return;
    const changes = pendingChanges(profile.changes).map((change) => (profileNeedsOff ? { ...change, waitOff: true } : change));
    const on: PelletBoilerChange[] = turnOnAfter ? [{ kind: 'control', index: 0, value: 1, ...(profileNeedsOff ? { waitOff: true } : {}) }] : [];
    const off: PelletBoilerChange[] = profileNeedsOff ? [{ kind: 'control', index: 0, value: 0 }] : [];
    const response = await PelletBoilerRequests.postCommands([...off, ...changes, ...on]);
    if (response?.status === 201) {
      setProfile(null);
      setProfileError('');
      load();
      return;
    }
    // „włącz” rozpaliłoby kocioł w trybie pompy ciepła (serwer: 409 z turnOn): nastawy idą bez „włącz”,
    // a okno proponuje przełączenie na Pellet albo uruchomienie pompy ciepła
    const body = response?.status === 409 ? await response.json().catch(() => null) : null;
    if (body?.turnOn && on.length) {
      const retry = await PelletBoilerRequests.postCommands([...off, ...changes]);
      if (retry?.status === 201) {
        setProfile(null);
        setProfileError('');
        setTurnOnBlock({ ...body.turnOn, message: body.message });
        load();
        return;
      }
      setProfileError(await errorMessage(retry));
      return;
    }
    setProfileError(body?.message ?? await errorMessage(response));
  };

  // Sezon: Tryb LATO (nr 125), 0 Zima / 1 Lato / 2 Auto (kolejność z PyPlumIO, na kotle niepotwierdzona)
  const summer = findIn(settings ?? null, { kind: 'ecomax', index: 125 });
  const [seasonError, setSeasonError] = useState('');
  // tryb pompy ciepła: Zimą steruje cykl na serwerze (Zima przy kotle ≥ 40 °C, Lato przy < 30 °C i stojącej
  // pompie CO); przycisk zapisuje wybrany sezon (PUT /season), a stan cyklu jest w GET /schedules/current
  // Bez powiązanej pompy ciepła (definicja kotła) kocioł pracuje tylko na pellecie: bez sekcji „Tryb pracy”
  // i bez cyklu Zimy (serwer też traktuje kocioł jak Pellet).
  const heatPumpLinked = useHeatPumpLinked();
  const heatPumpMode = !!heatPumpLinked && workModeName(settings ?? null) === 'Pompa ciepła';
  const [current, setCurrent] = useState<PelletBoilerCurrentSchedule | null>(null);
  useEffect(() => { PelletBoilerRequests.getCurrentSchedule().then(setCurrent); }, [commands]);
  const wantedWinter = heatPumpMode && (current?.manualSeason === 'winter' || !!current?.winterCycle);
  // znacznik „CWU grzej peletem” (PUT /pellet-cwu); odpowiedź to nowy stan harmonogramu z fazą cyklu
  const [pelletCwuSaving, setPelletCwuSaving] = useState(false);
  const [pelletCwuError, setPelletCwuError] = useState('');
  const setPelletCwu = async (enabled: boolean) => {
    setPelletCwuSaving(true);
    try {
      setCurrent(await PelletBoilerRequests.setPelletCwu(enabled));
      setPelletCwuError('');
    } catch {
      setPelletCwuError('Nie udało się zapisać ustawienia.');
    } finally {
      setPelletCwuSaving(false);
    }
    load();
  };
  const setSeason = async (value: number, label: string) => {
    if (heatPumpMode) {
      const message = value === 0
        ? 'Przełączyć na Zimę z pompą ciepła? Kocioł przejdzie na Zimę, gdy będzie miał co najmniej 40 °C (do tego czasu pompa ciepła dostaje wymuszenie startu), a wróci na Lato poniżej 30 °C przy stojącej pompie CO.'
        : 'Przełączyć kocioł na Lato?';
      if (!window.confirm(message)) return;
      try {
        setCurrent(await PelletBoilerRequests.setSeason(value === 0 ? 'winter' : 'summer'));
        setSeasonError('');
      } catch {
        setSeasonError('Nie udało się zmienić sezonu.');
      }
      load();
      return;
    }
    if (!window.confirm(`Przełączyć kocioł na tryb: ${label}?`)) return;
    const response = await PelletBoilerRequests.postCommands([{ kind: 'ecomax', index: 125, value }]);
    setSeasonError(response?.status === 201 ? '' : await errorMessage(response));
    load();
  };

  // Regulator jak na panelu: „Włącz regulator” / „Wyłącz regulator” wysyłają zlecenie control (ramka 0x3B,
  // firmware od 1.4.0). Stan pokazuje ostatni odczyt kotła (wyłączony = tylko stan 0), nie
  // ustawienie w aplikacji. Wyłączenie zatrzymuje też harmonogram CWU, włączenie go wznawia
  // (schedule-settings.enabled; sam harmonogram regulatora nie przełącza). Przycisk jest aktywny, gdy
  // regulator albo harmonogram nie jest w żądanym stanie: kocioł włączony z panelu przy stojącym
  // harmonogramie — „Włącz regulator” tylko uruchamia harmonogram (bez zlecenia do kotła).
  // ostatni odczyt co 30 s i po zmianie listy zleceń; offline = kocioł nie przesyła danych: przyciski zmian
  // (tryb pracy, regulator, sezon, ołówki parametrów) nieaktywne, bo serwer i tak odrzuci zlecenie (409)
  const { reading: lastReading, setReading: setLastReading, responding } = useLastReading(commands);
  const offline = !responding;
  const boilerState = lastReading?.state;
  // wyłączony tylko stan 0: wygaszanie (7) bywa przy włączonym regulatorze (kocioł osiągnął temperaturę,
  // potem postój), a po „Wyłącz regulator” trwa do stanu 0 — wtedy WŁĄCZONY (Wygaszanie) też jest prawdą
  // (uwaga użytkownika 2026-10-05: „regulator jest włączony, tylko trwa wygaszanie”)
  const regulatorOn = boilerState === undefined ? undefined : boilerState !== 0;
  const controlPending = commands.find((command) => command.kind === 'control' && (command.status === 'pending' || command.status === 'sent'));
  const [workError, setWorkError] = useState('');
  // Okno po „Włącz regulator” w trybie pompy ciepła, gdy kocioł rozpaliłby się na pellecie (turn-on.service.ts
  // na serwerze): przełączenie na Pellet albo uruchomienie pompy ciepła z włączeniem kotła po nagrzaniu.
  const [turnOnBlock, setTurnOnBlock] = useState<PelletBoilerTurnOnCheck | null>(null);
  const [turnOnError, setTurnOnError] = useState('');
  const startHeatPump = async () => {
    const pending = await PelletBoilerRequests.postTurnOn('start-heat-pump') as { message?: string; since?: string } | null;
    if (!pending?.since) {
      setTurnOnError(pending?.message ?? 'Nie udało się uruchomić pompy ciepła.');
      return;
    }
    setTurnOnBlock(null);
    setTurnOnError('');
    PelletBoilerRequests.getCurrentSchedule().then(setCurrent);
  };
  const switchToPellet = () => {
    setTurnOnBlock(null);
    const pellet = profiles.find((item) => item.key === 'pellet');
    if (pellet) openProfile(pellet);
  };
  const cancelPendingTurnOn = async () => {
    await PelletBoilerRequests.postTurnOn('cancel');
    PelletBoilerRequests.getCurrentSchedule().then(setCurrent);
  };
  const setWork = async (on: boolean) => {
    if (!scheduleSettings) return;
    // regulator już w żądanym stanie (odczyt): zmienia się tylko harmonogram
    const regulatorAlready = regulatorOn === on;
    if (on && !regulatorAlready) {
      const check = await PelletBoilerRequests.getTurnOn();
      if (check?.blocked) {
        setTurnOnError('');
        setTurnOnBlock(check);
        return;
      }
    }
    const question = on
      ? (regulatorAlready
        ? 'Regulator już pracuje. Uruchomić harmonogram CWU?'
        : 'Włączyć regulator? Kocioł będzie pracował według sezonu i ustawień, harmonogram zacznie działać.')
      : (regulatorAlready
        ? 'Regulator jest już wyłączony. Zatrzymać harmonogram CWU?'
        : 'Wyłączyć regulator? Kocioł nie rozpali się (pellet przejdzie w wygaszanie), harmonogram przestanie działać.');
    if (!window.confirm(question)) return;
    try {
      if (scheduleSettings.enabled !== on) {
        setScheduleSettings(await PelletBoilerRequests.saveScheduleSettings({ ...scheduleSettings, enabled: on }));
      }
      if (!regulatorAlready) {
        const response = await PelletBoilerRequests.postCommands([{ kind: 'control', index: 0, value: on ? 1 : 0 }]);
        // 409 z turnOn: odczyt zmienił się między sprawdzeniem a zleceniem — to samo okno
        const body = response?.status === 409 ? await response.json().catch(() => null) : null;
        if (body?.turnOn) setTurnOnBlock({ ...body.turnOn, message: body.message });
        setWorkError(response?.status === 201 || body?.turnOn ? '' : body?.message ?? await errorMessage(response));
      } else {
        setWorkError('');
      }
      load();
    } catch {
      setWorkError('Nie udało się wysłać.');
    }
  };

  const modeChangePending = commands.some((command) => command.waitOff && (command.status === 'pending' || command.status === 'sent'));
  // Tryb pracy tylko przy kotle wyłączonym albo na postoju (decyzja użytkownika 2026-10-04): stan ze świeżo
  // pobranego odczytu; wyłączony (0) — od razu; postój (5 pauza, 6 czuwanie) — cały proces z wyłączeniem
  // regulatora; praca, rozpalanie, stabilizacja, nadzór, wygaszanie, alarm, praca ręczna — zablokowane.
  // Pompy ciepła przy przełączaniu na Pellet nie sprawdzamy (pompa CO sama stanie po nagrzaniu wody).
  const [modeBlocked, setModeBlocked] = useState('');
  const openProfile = async (item: Profile) => {
    setModeBlocked('');
    const changesNeeded = pendingChanges(item.changes).length > 0;
    let needsOff = false;
    if (changesNeeded) {
      const last = await PelletBoilerRequests.getLast();
      setLastReading(last ?? null);
      const state = last?.state;
      if (state === undefined) {
        setModeBlocked('Brak odczytu stanu kotła — nie można zmienić trybu.');
        return;
      }
      if (state !== 0 && !STANDBY_STATES.includes(state)) {
        setModeBlocked(`Kocioł pracuje (stan: ${stateName(state)}). Zmiana trybu możliwa, gdy kocioł jest na postoju albo wyłączony.`);
        return;
      }
      needsOff = state !== 0;
      if (needsOff && !window.confirm('Zmiana trybu pracy wymaga wyłączonego kotła. Wyłączyć regulator?')) return;
    }
    setProfileError('');
    setProfileNeedsOff(needsOff);
    setTurnOnAfter(true);
    setProfile(item);
  };

  const ready = settings && settings.readAt;
  const currentMode = workModeName(settings ?? null);
  const cleanSchedule = settings?.schedules?.find((schedule) => schedule.index === CLEAN_SCHEDULE);
  const cleanPending = commands.find((command) => command.kind === 'schedule' && (command.status === 'pending' || command.status === 'sent'));
  const shownValue = (item: Item, parameter: PelletBoilerParameter) => {
    if (!parameter.unknown) return display(item, parameter, parameter.value);
    const target = item.kind === 'mixer' && item.index === 0
      ? lastReading?.[`mixer${item.mixer}_target` as keyof PelletBoilerReading]
      : undefined;
    return typeof target === 'number' ? display(item, parameter, target) : '?';
  };
  const labelOf = (change: PelletBoilerChange) => {
    const parameter = findIn(settings ?? null, change);
    const where = change.kind === 'mixer' ? `Mieszacz ${change.mixer}: ` : '';
    return { name: `${where}${parameter?.label ?? `nr ${change.index}`}`, parameter };
  };
  const recent = commands.slice(0, 8);
  const inProgressCount = commands.filter((c) => c.status === 'pending' || c.status === 'sent').length;

  return (
    <>
      {heatPumpLinked && (
      <div className="resource">
        <h3 className="settings-section-title">Tryb pracy</h3>
        {offline && <div className="boiler-error">{NOT_RESPONDING_TEXT}</div>}
        <div className="boiler-profiles">
          {profiles.map((item) => (
            <button key={item.key} type="button" disabled={!ready || !scheduleSettings || modeChangePending || offline}
              className={currentMode === item.label ? 'boiler-profile-active' : 'boiler-profile'}
              onClick={() => openProfile(item)}>
              {item.label}
            </button>
          ))}
        </div>
        {modeChangePending && <div className="boiler-hint"><strong>Zmiana trybu czeka na wyłączenie kotła.</strong></div>}
        {modeBlocked && <div className="boiler-error">{modeBlocked}</div>}

        {/* CWU z peletu w trybie pompy ciepła (serwer: pellet-boiler-pelux200-pellet-cwu.service.ts) */}
        {current?.pelletCwu && (
          <div className="boiler-main-section">
            <label className="boiler-check">
              <input type="checkbox" checked={current.pelletCwu.enabled} disabled={pelletCwuSaving}
                onChange={(event) => setPelletCwu(event.currentTarget.checked)} />
              Grzej CWU peletem
            </label>
            <div className="boiler-hint">
              W trybie Pompa ciepła CWU grzeje kocioł według ustawień trybu Pellet:
              od {current.pelletCwu.cwuFrom ?? '…'} °C do {current.pelletCwu.cwuTo ?? '…'} °C.
            </div>
            {current.pelletCwu.phase === 'heating' && (
              <div className="boiler-hint">
                <strong>Kocioł grzeje CWU peletem</strong> od {formatDateTime(current.pelletCwu.since ?? undefined)}
                {typeof current.pelletCwu.cwuTemp === 'number' && <> (CWU {formatNumber(current.pelletCwu.cwuTemp)} °C)</>}.
              </div>
            )}
            {current.pelletCwu.phase === 'cooling' && (
              <div className="boiler-hint">
                <strong>Pompa ciepła czeka na spadek kotła poniżej 50 °C</strong>
                {typeof current.pelletCwu.boilerTemp === 'number' && <> (teraz {formatNumber(current.pelletCwu.boilerTemp)} °C)</>}.
              </div>
            )}
            {current.pelletCwu.error && <div className="boiler-error">Ostatnie grzanie CWU przerwane: {current.pelletCwu.error}.</div>}
            {pelletCwuError && <div className="boiler-error">{pelletCwuError}</div>}
          </div>
        )}
      </div>
      )}


      <div className="resource">
        <h3 className="settings-section-title">Główne parametry</h3>
        {!heatPumpLinked && offline && <div className="boiler-error">{NOT_RESPONDING_TEXT}</div>}
        {settings === undefined && <div>Wczytywanie…</div>}
        {settings !== undefined && !ready && <div>Brak odczytu ustawień — sterownik jeszcze ich nie wysłał.</div>}
        {scheduleSettings && (
          <div className="boiler-main-section">
            <div className="boiler-main-title">
              Regulator:{' '}
              {regulatorOn === undefined
                ? <span>brak odczytu</span>
                : <span className={regulatorOn ? 'boiler-state-on' : 'boiler-state-off'}>{regulatorOn ? 'WŁĄCZONY' : 'WYŁĄCZONY'}</span>}
              {boilerState !== undefined && <span className="boiler-hint"> ({readingStateName(lastReading)})</span>}
            </div>
            <div className="boiler-profiles">
              <button type="button" className="boiler-profile" disabled={(regulatorOn === true && scheduleSettings.enabled) || !!controlPending || offline}
                onClick={() => setWork(true)}>
                Włącz regulator
              </button>
              <button type="button" className="boiler-profile" disabled={(regulatorOn === false && !scheduleSettings.enabled) || !!controlPending || offline}
                onClick={() => setWork(false)}>
                Wyłącz regulator
              </button>
            </div>
            <div className="boiler-hint">
              {controlPending
                ? `${controlPending.value ? 'Włączenie' : 'Wyłączenie'} regulatora czeka na sterownik.`
                : `Harmonogram ${scheduleSettings.enabled ? 'działa' : 'nie działa'}.`}
            </div>
            {current?.pendingTurnOn && (
              <div className="boiler-hint">
                <strong>Włączenie czeka, aż kocioł osiągnie {current.pendingTurnOn.startBelow ?? '…'} °C</strong>
                {typeof lastReading?.heating_temp === 'number' && <> (teraz {formatNumber(lastReading.heating_temp)} °C)</>}
                {current.pendingTurnOn.heatPumpStarted && <>; pompa ciepła uruchomiona</>}.
              </div>
            )}
            {current?.pendingTurnOn && (
              <div className="boiler-profiles">
                <button type="button" className="boiler-profile" onClick={cancelPendingTurnOn}>Anuluj włączenie</button>
              </div>
            )}
            {workError && <div className="boiler-error">{workError}</div>}
          </div>
        )}
        {ready && (
          <div className="boiler-main-section">
            <div className="boiler-main-title">Sezon</div>
            <div className="boiler-profiles">
              {/* bez Auto (decyzja użytkownika 2026-10-04): tylko Zima i Lato */}
              {(CHOICES['ecomax:125']).slice(0, 2).map((label, value) => {
                // tryb pompy ciepła: zaznaczony sezon żądany (Zima w cyklu także wtedy, gdy kocioł czeka na Lecie)
                const active = heatPumpMode ? (value === 0) === wantedWinter : summer?.value === value;
                return (
                  <button key={label} type="button" disabled={!summer || value < summer.min || value > summer.max || offline}
                    className={active ? 'boiler-profile-active' : 'boiler-profile'}
                    onClick={() => (heatPumpMode ? !active : summer?.value !== value) && setSeason(value, label)}>
                    {label}
                  </button>
                );
              })}
            </div>
            <div className="boiler-hint">
              Lato: kocioł grzeje tylko CWU, ogrzewanie CO wyłączone.
              {summer?.value === 2 && ' Teraz kocioł jest w trybie Auto (przełączanie według temperatury zewnętrznej).'}
            </div>
            {heatPumpMode && <WinterCycleStatus cycle={current?.winterCycle} />}
            {seasonError && <div className="boiler-error">{seasonError}</div>}
          </div>
        )}
        {ready && SECTIONS.map((section) => {
          const item = section.items[0];
          const parameter = findIn(settings, item);
          return (
            <div key={section.title} className="boiler-main-section">
              <div className="boiler-main-title">{section.title}</div>
              {parameter ? (
                <div className="boiler-main-row">
                  <span className="boiler-main-label">{parameter.label ?? parameter.name}</span>
                  <span className="boiler-parameter-value">{shownValue(item, parameter)}</span>
                  <IconButton label={`Zmień: ${section.title}`} icon={<EditIcon />} disabled={offline} onClick={() => setEditing(section)} />
                </div>
              ) : (
                <ReadOnlyMixerTarget item={item} reading={lastReading} />
              )}
              {/* Harmonogram czyszczenia (od firmware 1.8.0): zmiana w panelu grupy (zlecenie schedule, ramka 0x37;
                  w regulatorze zmienia się tylko przełącznik, godziny zostają); stan z ostatniego odczytu ustawień */}
              {section.cleanSchedule && cleanSchedule && (
                <div className="boiler-main-row">
                  <span className="boiler-main-label">{cleanSchedule.label}</span>
                  <span className="boiler-parameter-value">{cleanSchedule.enabled ? 'Tak' : 'Nie'}</span>
                  <IconButton label={`Zmień: ${cleanSchedule.label}`} icon={<EditIcon />} disabled={offline} onClick={() => setEditing(section)} />
                </div>
              )}
              {section.weather && parameter && (() => {
                // sterowanie pogodowe mieszacza: Tak/Nie, przy „Tak” krzywa i przesunięcie (nastawy nieznane: „?”)
                const at = (index: number) => findIn(settings, { kind: 'mixer', mixer: item.mixer, index });
                const weather = at(WEATHER_SWITCH);
                if (!weather) return null;
                const curve = at(5);
                const shift = at(6);
                const on = !weather.unknown && weather.value === 1;
                const mixerItem = (index: number): Item => ({ kind: 'mixer', mixer: item.mixer, index });
                return (
                  <>
                    <div className="boiler-main-row">
                      <span className="boiler-main-label">Sterowanie pogodowe</span>
                      <span className="boiler-parameter-value">{weather.unknown ? '?' : on ? 'Tak' : 'Nie'}</span>
                      <IconButton label={`Zmień: ${section.title}, sterowanie pogodowe`} icon={<EditIcon />} disabled={offline} onClick={() => setEditing(section)} />
                    </div>
                    {on && curve && shift && (
                      <div className="boiler-hint">
                        Krzywa {shownValue(mixerItem(5), curve)} · przesunięcie {shownValue(mixerItem(6), shift)}
                      </div>
                    )}
                  </>
                );
              })()}
              {settings?.mixers?.find((m) => m.mixer === item.mixer)?.assumed && item.kind === 'mixer' && (
                <div className="boiler-hint">Zadana z odczytu pracy kotła. Regulator nie podaje nastaw tego mieszacza — zmiany bez potwierdzenia, sprawdź na panelu.</div>
              )}
              {section.cleanSchedule && cleanPending && (
                <div className="boiler-hint">{cleanPending.value ? 'Włączenie' : 'Wyłączenie'} harmonogramu czyszczenia czeka na sterownik.</div>
              )}
            </div>
          );
        })}
        {ready && <div className="boiler-hint">Odczyt ustawień: {formatDateTime(settings.readAt)}</div>}
      </div>

      {recent.length > 0 && (
        <div className="resource">
          {/* zwinięte domyślnie (jak Ustawienia zaawansowane); w nagłówku liczba zmian w toku */}
          <h3 className="settings-section-title">
            <button type="button" className="boiler-advanced-toggle" aria-expanded={recentOpen} onClick={() => setRecentOpen(!recentOpen)}>
              <span>Ostatnie zmiany{inProgressCount > 0 ? ` (w toku: ${inProgressCount})` : ''}</span>
              <span aria-hidden="true">{recentOpen ? '▲' : '▼'}</span>
            </button>
          </h3>
          {recentOpen && (
          <ul className="boiler-commands">
            {recent.map((command) => {
              const control = command.kind === 'control';
              const schedule = command.kind === 'schedule';
              const { name, parameter } = control ? { name: '', parameter: undefined }
                : schedule ? { name: command.label ?? `Harmonogram nr ${command.index}`, parameter: undefined }
                : labelOf(command);
              const item: Item = { kind: command.kind === 'mixer' ? 'mixer' : 'ecomax', mixer: command.mixer, index: command.index };
              const value = parameter ? display(item, parameter, fromRaw(parameter, command.value))
                : schedule ? (command.value ? 'Tak' : 'Nie') : String(command.value);
              return (
                <li key={command._id}>
                  <span>{control ? <strong>{CONTROL_LABEL(command.value)}</strong> : <>{name} → <strong>{value}</strong></>}</span>
                  <span className={`boiler-command-${command.status}`}>
                    {command.waitOff && command.status === 'pending' ? 'czeka na wyłączenie kotła' : STATUS_TEXT[command.status]}
                    {command.error ? `: ${command.error}` : ''}
                    <span className="boiler-hint"> · {formatDateTime(command.createdAt)}</span>
                  </span>
                </li>
              );
            })}
          </ul>
          )}
        </div>
      )}

      {editing && settings && (
        <GroupEditPanel section={editing} settings={settings} reading={lastReading} onClose={() => setEditing(null)}
          onSent={() => setEditing(null)} />
      )}

      {turnOnBlock && (
        <div className="device-modal-backdrop" onClick={() => setTurnOnBlock(null)}>
          <div className="device-modal boiler-edit" role="dialog" aria-modal="true" aria-labelledby="boiler-turn-on-title"
            onClick={(event) => event.stopPropagation()}>
            <h2 id="boiler-turn-on-title">Kocioł rozpali się na pellecie</h2>
            <div>{turnOnBlock.message}</div>
            <div className="boiler-hint">
              „Uruchom pompę ciepła” włącza pompę ciepła (tryb ręczny), a kocioł włączy się sam, gdy woda w nim osiągnie
              {' '}{turnOnBlock.startBelow ?? '…'} °C.
            </div>
            {turnOnError && <p className="device-modal-error">{turnOnError}</p>}
            <div className="device-modal-actions">
              <button type="button" onClick={() => setTurnOnBlock(null)}>Anuluj</button>
              <button type="button" onClick={switchToPellet}>Przełącz na Pellet</button>
              <button type="button" onClick={startHeatPump}>Uruchom pompę ciepła</button>
            </div>
          </div>
        </div>
      )}

      {profile && (
        <div className="device-modal-backdrop" onClick={() => setProfile(null)}>
          <div className="device-modal boiler-edit" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <h2>Tryb pracy: {profile.label}</h2>
            {pendingChanges(profile.changes).length === 0
              ? <div>Ustawienia kotła już odpowiadają temu trybowi.</div>
              : <div>Zostaną zlecone zmiany (w tej kolejności):</div>}
            {/* wartość zawsze pod nazwą parametru (jednakowo na telefonie i komputerze) */}
            <ul className="boiler-commands boiler-commands-stacked">
              {pendingChanges(profile.changes).map((change) => {
                const { name, parameter } = labelOf(change);
                const item: Item = { kind: change.kind === 'mixer' ? 'mixer' : 'ecomax', mixer: change.mixer, index: change.index };
                return (
                  <li key={`${change.kind}-${change.mixer ?? 0}-${change.index}`}>
                    <span>{name}</span>
                    <span>
                      {parameter ? `${display(item, parameter, parameter.value)} → ` : ''}
                      <strong>{parameter ? display(item, parameter, fromRaw(parameter, change.value)) : change.value}</strong>
                    </span>
                  </li>
                );
              })}
            </ul>
            {profileNeedsOff && pendingChanges(profile.changes).length > 0 && (
              <div className="boiler-hint">
                Najpierw zostanie wyłączony regulator; zmiany pójdą do kotła, gdy zgłosi stan „wyłączony”
                (przy paleniu pelletu po wygaszeniu).
              </div>
            )}
            {pendingChanges(profile.changes).length > 0 && (
              <label className="boiler-confirm boiler-option">
                <input type="checkbox" checked={turnOnAfter} onChange={(event) => setTurnOnAfter(event.currentTarget.checked)} />
                Po zmianie włączyć regulator
              </label>
            )}
            {profileError && <p className="device-modal-error">{profileError}</p>}
            <div className="device-modal-actions">
              <button type="button" onClick={() => setProfile(null)}>Anuluj</button>
              <button type="button" onClick={sendProfile} disabled={pendingChanges(profile.changes).length === 0}>Przełącz</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
