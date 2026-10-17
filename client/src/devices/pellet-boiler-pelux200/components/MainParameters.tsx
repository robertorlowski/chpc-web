// Ustawienia pieca, lewa kolumna w układzie „Instrument” (#s-boiler-ustawienia): trzy karty.
// „Tryb pracy”: przełącznik Pompa ciepła / Pellet (zleca cały zestaw nastaw z kociol-ustawienia.md, punkt 4b,
// w kolejności, w jakiej regulator go przyjmie: najpierw granice, potem zadane), przełącznik sezonu Zima / Lato
// (nr 125; w trybie pompy ciepła przez cykl Zimy na serwerze) i znacznik „CWU - grzanie peletem”.
// „Główne parametry”: regulator (włącz / wyłącz, stan z ostatniego odczytu) i lista nastaw z ostatniego odczytu
// ustawień (GET /pellet-boiler-pelux200/settings); ołówek otwiera okno całej grupy (kocioł: 98, 99, 17, 101, 105;
// CWU: 119, 123, 122; mieszacz: 0, 1, 2, 4, 5, 6) z opisem, zakresem i oceną z docs/parametry-kotla.md. Zmiana to
// zlecenie (POST /commands): sterownik pieca odbiera je w ciągu ok. 15 s, wysyła do regulatora (w każdym stanie kotła)
// i czyta ustawienia od nowa. „Ostatnie zmiany”: ostatnie zlecenia ze statusem (pełny dziennik w zakładce Operacje).
// Okna (zmiana parametru, grupa, tryb pracy, „Uwaga” przy włączaniu) to components/ui.tsx Modal.
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { InfoTip, TipParagraph } from '../../../core/components/InfoTip';
import { PelletBoilerRequests } from '../api';
import {
  PelletBoilerChange, PelletBoilerCommand, PelletBoilerCurrentSchedule, PelletBoilerMode, PelletBoilerParameter,
  PelletBoilerScheduleSettings, PelletBoilerReading, PelletBoilerSettings, PelletBoilerTurnOnCheck,
} from '../types';
import { WinterCycleStatus } from './WinterCycleStatus';
import { IconBtn, Modal, Segmented, hourMinute } from './ui';
import { formatDateTime, formatNumber, heatPumpDataMissing, readingStateName, stateName, workModeName } from '../utils/boiler';
import { NOT_RESPONDING_TEXT, useLastReading } from '../utils/useLastReading';
import { useHeatPumpLinked } from '../utils/useHeatPumpLinked';

// zdarzenie okna po zleceniu zmiany: MainParameters odświeża wartości i liczbę zmian w toku
export const COMMANDS_CHANGED = 'pellet-boiler-commands-changed';

export type Item = { kind: 'ecomax' | 'mixer'; mixer?: number; index: number };

// Grupa „Głównych parametrów”: na liście tylko temperatura zadana (pierwszy element), ołówek otwiera
// okno ze wszystkimi parametrami grupy. min/max: numery granic zadanej (kolejność wysyłki).
// cleanSchedule: w grupie także przełącznik harmonogramu czyszczenia (Kocioł; zlecenie schedule, firmware od 1.8.0)
// weather: mieszacz ze sterowaniem pogodowym (nr 4 Tak/Nie); krzywa (nr 5) i przesunięcie (nr 6) tylko przy „Tak”,
// zadana (nr 0) jest wtedy liczona z krzywej (decyzja użytkownika 2026-10-08)
// extra: parametr kotła pokazany na liście pod zadaną (CWU: tryb pracy pompy CWU nr 122, „Wyłączony” na czerwono)
type Section = { title: string; items: Item[]; min?: number; max?: number; cleanSchedule?: boolean; weather?: boolean; extra?: number };
const ecomax = (indexes: number[]): Item[] => indexes.map((index) => ({ kind: 'ecomax', index }));
const mixerItems = (mixer: number, indexes: number[]): Item[] => indexes.map((index) => ({ kind: 'mixer', mixer, index }));
const WEATHER_SWITCH = 4;
const WEATHER_FIELDS = [5, 6];
const SECTIONS: Section[] = [
  { title: 'Kocioł', items: ecomax([98, 99, 17, 101, 105]), min: 99, cleanSchedule: true },
  { title: 'CWU', items: ecomax([119, 123, 122]), extra: 122 },
  { title: 'Mieszacz 1', items: mixerItems(1, [0, 1, 2, 4, 5, 6]), min: 1, max: 2, weather: true },
  // mieszacz 2: regulator nie podaje nastaw (same FF), serwer zakłada zadaną 20–40 °C i zakresy mieszacza 1
  { title: 'Mieszacz 2', items: mixerItems(2, [0, 4, 5, 6]), weather: true },
];

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
const MODE_OPTIONS = (['heat-pump', 'pellet'] as PelletBoilerMode[]).map((key) => ({ value: key, label: PROFILE_LABEL[key] }));
type SeasonKey = 'winter' | 'summer';
// liczba zleceń pokazywanych w „Ostatnich zmianach” (pełny dziennik w zakładce Operacje)
const RECENT_COMMANDS = 5;
const STATUS_CHIP: Record<PelletBoilerCommand['status'], { label: string; chip: string }> = {
  pending: { label: 'czeka', chip: 'chip-warn' }, sent: { label: 'wysłane', chip: 'chip-warn' }, done: { label: 'wykonane', chip: 'chip-ok' },
  error: { label: 'błąd', chip: 'chip-err' }, replaced: { label: 'zastąpione', chip: 'chip-off' },
};

// harmonogram czyszczenia kotła w regulatorze (nr 4 w PyPlumIO); godziny ustawia się na panelu
const CLEAN_SCHEDULE = 4;

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
// „60–68 °C” do podpisu pod nazwą parametru
const rangeText = (item: Item, parameter: PelletBoilerParameter) =>
  `${display(item, parameter, parameter.min)} – ${display(item, parameter, parameter.max)}`;

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

// Opis i ocena parametru w dymku „i”.
const ParameterTip: React.FC<{ parameter: PelletBoilerParameter; children?: React.ReactNode }> = ({ parameter, children }) => (
  (parameter.description || parameter.rating || children) ? (
    <InfoTip label="Opis parametru">
      {parameter.description && <TipParagraph>{parameter.description}</TipParagraph>}
      {parameter.rating && <span className={`boiler-parameter-rating ${ratingClass(parameter.rating)}`}>{parameter.rating}</span>}
      {children}
    </InfoTip>
  ) : null
);

// Pole parametru w oknie (.form-grid): etykieta z numerem i zakresem, lista wyboru albo liczba z jednostką.
const ParameterField: React.FC<{
  item: Item; parameter: PelletBoilerParameter; value: string; onChange: (value: string) => void; disabled?: boolean; autoFocus?: boolean;
  note?: React.ReactNode;
}> = ({ item, parameter, value, onChange, disabled, autoFocus, note }) => {
  const choices = choicesOf(item, parameter);
  const id = `boiler-field-${item.kind}-${item.mixer ?? 0}-${item.index}`;
  return (
    <>
      <label htmlFor={id}>
        {parameter.label ?? parameter.name}
        <ParameterTip parameter={parameter} />
        <small>nr {parameter.index} · {rangeText(item, parameter)}{note && <> · {note}</>}</small>
      </label>
      <div className="range-inputs">
        {choices ? (
          <select id={id} value={value} disabled={disabled} onChange={(event) => onChange(event.currentTarget.value)}>
            {parameter.unknown && <option value="">— nieznane —</option>}
            {choices.map((label, index) => index >= parameter.min && index <= parameter.max
              && <option key={label} value={String(index)}>{label}</option>)}
          </select>
        ) : (
          <>
            <input id={id} type="number" inputMode="decimal" step={parameter.step ?? 1} value={value} disabled={disabled} autoFocus={autoFocus}
              placeholder={parameter.unknown ? 'nieznana' : undefined} onChange={(event) => onChange(event.currentTarget.value)} />
            {parameter.unit && <span className="unit-txt">{parameter.unit}</span>}
          </>
        )}
      </div>
    </>
  );
};

const ServiceConfirm: React.FC<{ checked: boolean; onChange: (checked: boolean) => void }> = ({ checked, onChange }) => (
  <label className="check boiler-confirm">
    <input type="checkbox" checked={checked} onChange={(event) => onChange(event.currentTarget.checked)} />
    <span>Rozumiem, że to parametr serwisowy, i zmieniam go na własną odpowiedzialność.</span>
  </label>
);

// Okno zmiany jednego parametru (Ustawienia zaawansowane): opis, zakres, ocena i pole wartości.
// reason: „dlaczego” w dzienniku operacji
export const EditPanel: React.FC<{
  item: Item; parameter: PelletBoilerParameter; reason: string; onClose: () => void; onSent: () => void;
}> = ({ item, parameter, reason, onClose, onSent }) => {
  const [value, setValue] = useState(String(parameter.value));
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  // parametr serwisowy („Tylko serwis”, „Nie ruszać”): zapis dopiero po zaznaczeniu potwierdzenia
  const service = ratingClass(parameter.rating) === 'boiler-rating-service';
  const [confirmed, setConfirmed] = useState(false);

  const send = async (event: FormEvent) => {
    event.preventDefault();
    const number = Number(value.replace(',', '.'));
    if (!Number.isFinite(number) || number < parameter.min || number > parameter.max) {
      return setError(`Dozwolone: ${rangeText(item, parameter)}.`);
    }
    setSending(true);
    const response = await PelletBoilerRequests.postCommands([{ ...item, value: toRaw(parameter, number) }], reason);
    setSending(false);
    if (response?.status === 201) {
      // inne panele (główne parametry, zmiany w toku) odświeżają się na to zdarzenie
      window.dispatchEvent(new Event(COMMANDS_CHANGED));
      return onSent();
    }
    setError(await errorMessage(response));
  };

  return (
    <Modal title={parameter.label ?? parameter.name} onClose={onClose} onSubmit={send}
      footer={<>
        <button type="button" className="btn" onClick={onClose}>Anuluj</button>
        <button type="submit" className="btn btn-primary" disabled={sending || (service && !confirmed)}>Zapisz</button>
      </>}>
      <div className="form-grid">
        <ParameterField item={item} parameter={parameter} value={value} onChange={setValue} autoFocus
          note={<>teraz {display(item, parameter, parameter.value)}</>} />
      </div>
      {service && <ServiceConfirm checked={confirmed} onChange={setConfirmed} />}
      <p className="help">
        Zmiana trafia do sterownika pieca od razu i zwykle w kilka sekund do regulatora (także przy pracującym kotle); potem sterownik
        odczytuje ustawienia od nowa. Gdy kocioł nie przesyła danych, zmiany nie da się zlecić.
      </p>
      {error && <p className="help danger-text">{error}</p>}
    </Modal>
  );
};

// Okno grupy: wszystkie parametry grupy w jednym formularzu; wysyłane tylko zmienione, w kolejności,
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
    ], `Zmiana w „Główne parametry”, ${section.title}.`);
    setSending(false);
    if (response?.status === 201) {
      window.dispatchEvent(new Event(COMMANDS_CHANGED));
      return onSent();
    }
    setError(await errorMessage(response));
  };

  return (
    <Modal title={`Grupa: ${section.title.toLowerCase()}`} onClose={onClose} onSubmit={send}
      footer={<>
        <button type="button" className="btn" onClick={onClose}>Anuluj</button>
        <button type="submit" className="btn btn-primary" disabled={sending || (service && !confirmed)}>Zapisz</button>
      </>}>
      <div className="form-grid">
        {fields.map(({ item, parameter }) => {
          if (hidden(item.index)) return null;
          const fromCurve = weatherOn && item.index === 0 && section.weather;
          return (
            <ParameterField key={item.index} item={item} parameter={parameter} value={values[item.index]} disabled={!!fromCurve}
              onChange={(next) => setValues({ ...values, [item.index]: next })}
              note={fromCurve ? 'zadaną liczy regulator z krzywej' : undefined} />
          );
        })}
        {schedule && (
          <>
            <label htmlFor="boiler-field-clean">{schedule.label}<small>godziny czyszczenia ustawia się na panelu kotła</small></label>
            <div className="range-inputs">
              <select id="boiler-field-clean" value={scheduleOn ? '1' : '0'} onChange={(event) => setScheduleOn(event.currentTarget.value === '1')}>
                <option value="1">Tak</option>
                <option value="0">Nie</option>
              </select>
            </div>
          </>
        )}
      </div>
      {service && <ServiceConfirm checked={confirmed} onChange={setConfirmed} />}
      <p className="help">
        Wysyłane są tylko zmienione pola, po kolei: granice poszerzające zakres przed zadaną, zawężające po niej; każde następne po
        potwierdzeniu poprzedniego przez regulator i ponownym odczycie ustawień (zwykle kilka sekund na pole). Zapis działa w każdym stanie kotła.
      </p>
      {error && <p className="help danger-text">{error}</p>}
    </Modal>
  );
};

// Wiersz listy „Głównych parametrów” (.params): nazwa z podpisem, wartość (z chipem) i ołówek.
const ParamRow: React.FC<{
  name: React.ReactNode; note?: React.ReactNode; value: React.ReactNode; chip?: React.ReactNode; off?: boolean;
  onEdit?: () => void; editLabel: string; disabled?: boolean;
}> = ({ name, note, value, chip, off, onEdit, editLabel, disabled }) => (
  <li>
    <span className="param-name">{name}{note && <small>{note}</small>}</span>
    <span className={`param-val${off ? ' danger-text' : ''}`}>{value}{chip}</span>
    <IconBtn name="edit" label={editLabel} disabled={disabled || !onEdit} onClick={onEdit} />
  </li>
);

// onReady: wołane raz, gdy są dane potrzebne do narysowania (Ustawienia rysują stronę w całości, bez mrugania)
export const MainParameters: React.FC<{ onReady?: () => void }> = ({ onReady }) => {
  const [settings, setSettings] = useState<PelletBoilerSettings | null | undefined>(undefined);
  const [commands, setCommands] = useState<PelletBoilerCommand[]>([]);
  const [editing, setEditing] = useState<Section | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [scheduleSettings, setScheduleSettings] = useState<PelletBoilerScheduleSettings | null>(null);
  const [profileError, setProfileError] = useState('');
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
    const reason = `Przycisk „${profile.label}” w „Tryb pracy”${profileNeedsOff ? ' — najpierw wyłączenie regulatora, nastawy po stanie „wyłączony”' : ''}.`;
    const response = await PelletBoilerRequests.postCommands([...off, ...changes, ...on], reason);
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
      const retry = await PelletBoilerRequests.postCommands([...off, ...changes], `${reason} Bez włączenia: kocioł rozpaliłby się na pellecie.`);
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
  // tryb pompy ciepła: Zimą steruje cykl na serwerze (Zima przy kotle ≥ max pompy ciepła − 3 °C, Lato przy < 30 °C i stojącej
  // pompie CO); przełącznik zapisuje wybrany sezon (PUT /season), a stan cyklu jest w GET /schedules/current
  // Bez powiązanej pompy ciepła (definicja kotła) kocioł pracuje tylko na pellecie: bez przełącznika trybu
  // i bez cyklu Zimy (serwer też traktuje kocioł jak Pellet).
  const heatPumpLinked = useHeatPumpLinked();
  const [current, setCurrent] = useState<PelletBoilerCurrentSchedule | null>(null);
  const heatPumpMode = !!heatPumpLinked && workModeName(settings ?? null, current?.pelletCwu) === 'Pompa ciepła';
  useEffect(() => { PelletBoilerRequests.getCurrentSchedule().then(setCurrent); }, [commands]);
  const wantedWinter = heatPumpMode && (current?.manualSeason === 'winter' || !!current?.winterCycle);
  const loaded = settings !== undefined && scheduleSettings !== null && current !== null && heatPumpLinked !== undefined;
  useEffect(() => { if (loaded) onReady?.(); }, [loaded, onReady]);
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
        ? 'Przełączyć na Zimę z pompą ciepła? Kocioł przejdzie na Zimę, gdy kocioł albo woda w pompie ciepła osiągnie temperaturę, do której grzeje pompa, minus 3 °C (do tego czasu pompa ciepła dostaje wymuszenie startu), a wróci na Lato poniżej 30 °C przy stojącej pompie CO.'
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
    const response = await PelletBoilerRequests.postCommands([{ kind: 'ecomax', index: 125, value }], `Przycisk ${label} w „Sezon”.`);
    setSeasonError(response?.status === 201 ? '' : await errorMessage(response));
    load();
  };
  // zaznaczony sezon: w trybie pompy ciepła sezon żądany (Zima w cyklu także wtedy, gdy kocioł czeka na Lecie),
  // inaczej wartość nr 125 z odczytu (Auto = nic)
  const seasonValue: SeasonKey | null = heatPumpMode ? (wantedWinter ? 'winter' : 'summer')
    : summer?.value === 0 ? 'winter' : summer?.value === 1 ? 'summer' : null;

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
        const response = await PelletBoilerRequests.postCommands([{ kind: 'control', index: 0, value: on ? 1 : 0 }],
          `Przycisk „${on ? 'Włącz' : 'Wyłącz'} regulator” w „Praca kotła”${on ? ' — harmonogram zaczyna działać' : ' — harmonogram zatrzymany'}.`);
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
  const currentMode = workModeName(settings ?? null, current?.pelletCwu);
  const modeValue: PelletBoilerMode | null = currentMode === 'Pompa ciepła' ? 'heat-pump' : currentMode === 'Pellet' ? 'pellet' : null;
  // CWU wyłączone w regulatorze (nr 122 = 0): „CWU - grzanie peletem” nie wystartuje (serwer, noc 12/13.10)
  const cwuOffInBoiler = findIn(settings ?? null, { kind: 'ecomax', index: 122 })?.value === 0;
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
  // opis zlecenia w „Ostatnich zmianach”: „Zadana CWU nr 119: 55 → 50”, „Włącz regulator”, „Czyszczenie: Tak”
  const commandText = (command: PelletBoilerCommand) => {
    if (command.kind === 'control') return command.value ? 'Włącz regulator' : 'Wyłącz regulator';
    if (command.kind === 'schedule') return `Harmonogram czyszczenia: ${command.value ? 'Tak' : 'Nie'}`;
    const { name, parameter } = labelOf(command);
    const item: Item = { kind: command.kind, mixer: command.mixer, index: command.index };
    const value = parameter ? display(item, parameter, fromRaw(parameter, command.value)) : String(command.value);
    const previous = parameter && typeof command.previous === 'number' ? `${display(item, parameter, fromRaw(parameter, command.previous))} → ` : '';
    return `${command.label ?? name} nr ${command.index}: ${previous}${value}`;
  };
  const recent = commands.slice(0, RECENT_COMMANDS);
  // zmiana w toku dla wiersza listy: chip „czeka” przy parametrze grupy
  const pendingFor = (section: Section) => commands.find((command) => (command.status === 'pending' || command.status === 'sent')
    && section.items.some((item) => item.kind === command.kind && item.index === command.index && (item.kind !== 'mixer' || item.mixer === command.mixer)));
  const waitChip = <span className="chip chip-warn">czeka</span>;

  return (
    <>
      <section className="card">
        <header className="card-head"><h2>Tryb pracy</h2><span className="card-hint">{heatPumpLinked ? 'zestawy nastaw · wysyłane tylko różnice' : 'sezon = parametr nr 125'}</span></header>
        {offline && <p className="help danger-text">{NOT_RESPONDING_TEXT}</p>}
        {heatPumpLinked && (
          <>
            <Segmented name="boiler-work-mode" label="Tryb pracy kotła" value={modeValue} options={MODE_OPTIONS}
              disabled={!ready || !scheduleSettings || modeChangePending || offline}
              onChange={(mode) => { const item = profiles.find((entry) => entry.key === mode); if (item && mode !== modeValue) openProfile(item); }} />
            {modeChangePending && <p className="help"><strong>Zmiana trybu czeka na wyłączenie kotła.</strong></p>}
            {modeBlocked && <p className="help danger-text">{modeBlocked}</p>}
          </>
        )}
        {/* bez Auto (decyzja użytkownika 2026-10-04): tylko Zima i Lato; opcja poza zakresem parametru nieaktywna */}
        <Segmented name="boiler-season" label="Sezon" value={seasonValue} disabled={!summer || offline}
          options={[
            { value: 'winter' as SeasonKey, label: 'Zima', disabled: !!summer && (0 < summer.min || 0 > summer.max) },
            { value: 'summer' as SeasonKey, label: 'Lato', disabled: !!summer && (1 < summer.min || 1 > summer.max) },
          ]}
          onChange={(season) => {
            const value = season === 'winter' ? 0 : 1;
            if (heatPumpMode ? season !== seasonValue : summer?.value !== value) setSeason(value, season === 'winter' ? 'Zima' : 'Lato');
          }} />
        <p className="help">
          {heatPumpLinked && '„Pompa ciepła”: kocioł tylko dogrzewa, „Pellet”: kocioł grzeje sam (nastawy trybów w Ustawieniach zaawansowanych). '}
          Sezon = parametr nr 125: Lato — kocioł grzeje tylko CWU, Zima — także CO.
          {heatPumpMode && (
            <InfoTip>
              <TipParagraph>
                Zima z pompą ciepła: kocioł przechodzi na Zimę, gdy kocioł albo woda w pompie ciepła osiągnie
                {typeof current?.winterCycle?.winterFrom === 'number'
                  ? ` ${formatNumber(current.winterCycle.winterFrom)} °C (temperatura, do której grzeje pompa, minus 3 °C)`
                  : ' temperaturę, do której grzeje pompa, minus 3 °C'}; do tego czasu pompa ciepła dostaje wymuszenie startu.
                Na Lato wraca poniżej 30 °C przy stojącej pompie CO.
              </TipParagraph>
              <TipParagraph>
                Razem z Latem zadana mieszacza 1 spada do minimum. Na Zimie wraca, gdy woda w pompie po spadku poniżej
                minimalnej zadanej pompy wróci do niej, utrzyma temperaturę przez 15 min albo wzrośnie o 5 °C.
              </TipParagraph>
              <TipParagraph>
                Wybór przełącznikiem działa do najbliższego początku albo końca wpisu sezonu w Harmonogramie, potem sezon
                ustawia harmonogram. Wybór sezonu, który harmonogram ustawia teraz, wraca do harmonogramu.
              </TipParagraph>
            </InfoTip>
          )}
        </p>
        {summer?.value === 2 && <p className="help">Teraz kocioł jest w trybie Auto (przełączanie według temperatury zewnętrznej).</p>}
        {heatPumpMode && <WinterCycleStatus cycle={current?.winterCycle} />}
        {/* sezon z przełącznika: do kiedy, potem harmonogram (wybór sezonu z harmonogramu wraca do niego) */}
        {heatPumpMode && current?.manualSeason && (
          <p className="help">
            Ustawienie ręczne: {current.manualSeason === 'winter' ? 'Zima' : 'Lato'}
            {current.manualSeasonUntil
              ? ` do ${hourMinute(current.manualSeasonUntil)}, potem zgodnie z harmonogramem`
              : ', do zmiany sezonu w harmonogramie'}
          </p>
        )}
        {seasonError && <p className="help danger-text">{seasonError}</p>}

        {/* CWU z peletu w trybie pompy ciepła (serwer: pellet-boiler-pelux200-pellet-cwu.service.ts);
            tylko w trybie Pompa ciepła, w trybie Pellet wyszarzony (kocioł i tak grzeje CWU peletem) */}
        {heatPumpLinked && current?.pelletCwu && (
          <>
            <label className={`check${heatPumpMode ? '' : ' boiler-check-disabled'}`}>
              <input type="checkbox" checked={current.pelletCwu.enabled} disabled={pelletCwuSaving || !heatPumpMode}
                onChange={(event) => setPelletCwu(event.currentTarget.checked)} />
              <span>
                CWU - grzanie peletem
                <InfoTip>
                  <TipParagraph>
                    W trybie Pompa ciepła CWU grzeje kocioł peletem według ustawień trybu Pellet:
                    od {current.pelletCwu.cwuFrom ?? '…'} °C do {current.pelletCwu.cwuTo ?? '…'} °C (Harmonogram, tryb Pellet).
                    Gdy zadana CWU w kotle jest niższa niż „do”, grzanie kończy się na zadanej.
                    Grzanie zaczyna się tylko przy włączonym regulatorze i włączonym CWU w kotle.
                  </TipParagraph>
                  <TipParagraph>
                    Na czas grzania kocioł dostaje nastawy trybu Pellet (zadana, minimum i histereza kotła, start pompy CO),
                    a potem nastawy trybu Pompa ciepła. Tryb pracy zostaje „Pompa ciepła”.
                  </TipParagraph>
                  <TipParagraph>
                    Pompa ciepła stoi, gdy kocioł się rozpala lub pali albo ma co najmniej {current.hotBoilerFrom ?? 52} °C,
                    i rusza, gdy kocioł spadnie poniżej {(current.hotBoilerFrom ?? 52) - 2} °C.
                    W trybie Pellet znacznik jest nieaktywny.
                  </TipParagraph>
                </InfoTip>
              </span>
              <small>w trybie Pompa ciepła CWU grzeje kocioł peletem według ustawień trybu Pellet</small>
            </label>
            {current.pelletCwu.enabled && heatPumpMode && cwuOffInBoiler && (
              <p className="help danger-text">CWU w kotle jest wyłączone – grzanie peletem nie wystartuje. Włącz CWU w Głównych parametrach.</p>
            )}
            {current.pelletCwu.phase === 'heating' && (
              <p className="help">
                <strong>Kocioł grzeje CWU peletem</strong> od {formatDateTime(current.pelletCwu.since ?? undefined)}
                {typeof current.pelletCwu.cwuTemp === 'number' && <> (CWU {formatNumber(current.pelletCwu.cwuTemp)} °C)</>}
                {typeof current.pelletCwu.cwuEnd === 'number' && <>, do {formatNumber(current.pelletCwu.cwuEnd)} °C</>}.
              </p>
            )}
            {current.pelletCwu.phase === 'cooling' && (
              <p className="help">
                <strong>Pompa ciepła czeka na spadek kotła poniżej 50 °C</strong>
                {typeof current.pelletCwu.boilerTemp === 'number' && <> (teraz {formatNumber(current.pelletCwu.boilerTemp)} °C)</>}.
              </p>
            )}
            {current.pelletCwu.error && <p className="help danger-text">Ostatnie grzanie CWU przerwane: {current.pelletCwu.error}.</p>}
            {pelletCwuError && <p className="help danger-text">{pelletCwuError}</p>}
          </>
        )}
      </section>

      <section className="card">
        <header className="card-head">
          <h2>Główne parametry</h2>
          {ready && <span className="card-hint">odczyt {hourMinute(settings.readAt)}</span>}
        </header>
        {!heatPumpLinked && offline && <p className="help danger-text">{NOT_RESPONDING_TEXT}</p>}
        {settings === undefined && <span className="help">Wczytywanie…</span>}
        {settings !== undefined && !ready && <span className="help">Brak odczytu ustawień — sterownik jeszcze ich nie wysłał.</span>}
        {scheduleSettings && (
          <>
            <div className="form-row">
              <span className="t-name">
                Regulator{' '}
                {regulatorOn === undefined
                  ? <span className="chip chip-off">brak odczytu</span>
                  : <span className={`chip ${regulatorOn ? 'chip-ok' : 'chip-off'}`}>{regulatorOn ? 'włączony' : 'wyłączony'}</span>}
                <small>
                  {boilerState !== undefined && <>stan: {readingStateName(lastReading)}{heatPumpDataMissing(lastReading, heatPumpMode) ? ', brak danych z pompy ciepła' : ''} · </>}
                  {controlPending
                    ? `${controlPending.value ? 'włączenie' : 'wyłączenie'} regulatora czeka na sterownik`
                    : `harmonogram ${scheduleSettings.enabled ? 'działa' : 'nie działa'}`}
                </small>
              </span>
              <span className="boiler-btn-row">
                <button type="button" className="btn btn-ghost btn-sm" disabled={(regulatorOn === true && scheduleSettings.enabled) || !!controlPending || offline}
                  onClick={() => setWork(true)}>Włącz regulator</button>
                <button type="button" className="btn btn-ghost btn-sm" disabled={(regulatorOn === false && !scheduleSettings.enabled) || !!controlPending || offline}
                  onClick={() => setWork(false)}>Wyłącz regulator</button>
              </span>
            </div>
            {current?.pendingTurnOn && (
              <div className="form-row">
                <span className="t-name">
                  Włączenie czeka, aż kocioł osiągnie {current.pendingTurnOn.startBelow ?? '…'} °C
                  <small>
                    {typeof lastReading?.heating_temp === 'number' && <>teraz {formatNumber(lastReading.heating_temp)} °C</>}
                    {current.pendingTurnOn.heatPumpStarted && <>; pompa ciepła uruchomiona</>}
                  </small>
                </span>
                <button type="button" className="btn btn-ghost btn-sm" onClick={cancelPendingTurnOn}>Anuluj włączenie</button>
              </div>
            )}
            {workError && <p className="help danger-text">{workError}</p>}
          </>
        )}
        {ready && (
          <ul className="params">
            {SECTIONS.map((section) => {
              const item = section.items[0];
              const parameter = findIn(settings, item);
              const pending = pendingFor(section);
              const mixerAssumed = item.kind === 'mixer' && settings.mixers?.find((m) => m.mixer === item.mixer)?.assumed;
              const rows: React.ReactNode[] = [];
              if (parameter) {
                rows.push(
                  <ParamRow key={`${section.title}-target`} name={`${section.title} · ${parameter.label ?? parameter.name}`}
                    note={<>nr {parameter.index} · {rangeText(item, parameter)}{mixerAssumed && ' · zadana z odczytu pracy kotła'}</>}
                    value={shownValue(item, parameter)} chip={pending && waitChip} disabled={offline}
                    editLabel={`Zmień grupę ${section.title.toLowerCase()}`} onEdit={() => setEditing(section)} />,
                );
              } else {
                // mieszacz bez nastaw w odczycie ustawień (regulator podaje same FF): zadana z odczytu pracy, bez ołówka
                const target = item.kind === 'mixer' ? lastReading?.[`mixer${item.mixer}_target` as keyof PelletBoilerReading] : undefined;
                rows.push(
                  <ParamRow key={`${section.title}-readonly`} name={`${section.title} · zadana`} note="brak nastaw w odczycie · zmiana tylko na panelu kotła"
                    value={typeof target === 'number' ? `${formatNumber(target)} °C` : '—'} editLabel="Zmień" />,
                );
              }
              if (section.extra !== undefined) {
                const extraItem: Item = { kind: 'ecomax', index: section.extra };
                const extra = findIn(settings, extraItem);
                if (extra) {
                  const off = section.extra === 122 && !extra.unknown && extra.value === 0;
                  rows.push(
                    <ParamRow key={`${section.title}-extra`} name={`${section.title} · ${extra.label ?? extra.name}`}
                      note={<>nr {extra.index}</>} value={shownValue(extraItem, extra)} off={off} disabled={offline}
                      editLabel={`Zmień grupę ${section.title.toLowerCase()}`} onEdit={() => setEditing(section)} />,
                  );
                }
              }
              // Harmonogram czyszczenia (od firmware 1.8.0): zmiana w oknie grupy (zlecenie schedule, ramka 0x37;
              // w regulatorze zmienia się tylko przełącznik, godziny zostają); stan z ostatniego odczytu ustawień
              if (section.cleanSchedule && cleanSchedule) {
                rows.push(
                  <ParamRow key={`${section.title}-clean`} name={`${section.title} · ${cleanSchedule.label}`}
                    note="godziny ustawia się na panelu kotła" value={cleanSchedule.enabled ? 'Tak' : 'Nie'} chip={cleanPending && waitChip}
                    disabled={offline} editLabel={`Zmień: ${cleanSchedule.label}`} onEdit={() => setEditing(section)} />,
                );
              }
              if (section.weather && parameter) {
                // sterowanie pogodowe mieszacza: Tak/Nie, przy „Tak” krzywa i przesunięcie (nastawy nieznane: „?”)
                const at = (index: number) => findIn(settings, { kind: 'mixer', mixer: item.mixer, index });
                const weather = at(WEATHER_SWITCH);
                const curve = at(5);
                const shift = at(6);
                if (weather) {
                  const on = !weather.unknown && weather.value === 1;
                  const mixerItem = (index: number): Item => ({ kind: 'mixer', mixer: item.mixer, index });
                  rows.push(
                    <ParamRow key={`${section.title}-weather`} name={`${section.title} · sterowanie pogodowe`}
                      note={on && curve && shift ? <>krzywa {shownValue(mixerItem(5), curve)} · przesunięcie {shownValue(mixerItem(6), shift)}</> : <>nr {WEATHER_SWITCH}</>}
                      value={weather.unknown ? '?' : on ? 'Tak' : 'Nie'} disabled={offline}
                      editLabel={`Zmień grupę ${section.title.toLowerCase()}`} onEdit={() => setEditing(section)} />,
                  );
                }
              }
              return rows;
            })}
          </ul>
        )}
        {ready && (
          <p className="help">
            Ołówek otwiera okno całej grupy (kocioł: 98, 99, 17, 101, 105; CWU: 119, 123, 122; mieszacz: 0, 1, 2, 4, 5, 6).
            Odczyt ustawień: {formatDateTime(settings.readAt)}.
          </p>
        )}
      </section>

      <section className="card">
        <header className="card-head">
          <h2>Ostatnie zmiany</h2>
          <span className="card-hint">{inProgress ? 'odświeżane co 10 s' : ''}{inProgress && ' · '}<Link to="/operations" className="link">Operacje</Link></span>
        </header>
        {recent.length === 0 && <span className="help">Brak zleceń.</span>}
        {recent.length > 0 && (
          <ul className="people">
            {recent.map((command) => (
              <li key={command._id}>
                <span className="person">
                  <strong>{commandText(command)}</strong>
                  <small>
                    {hourMinute(command.createdAt)}
                    {command.status === 'done' && command.doneAt && ` · wykonane ${hourMinute(command.doneAt)}`}
                    {command.status === 'error' && command.error && ` · ${command.error}`}
                    {command.status === 'sent' && ' · wysłane do sterownika'}
                  </small>
                </span>
                <span className={`chip ${STATUS_CHIP[command.status].chip}`}>{STATUS_CHIP[command.status].label}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {editing && settings && (
        <GroupEditPanel section={editing} settings={settings} reading={lastReading} onClose={() => setEditing(null)}
          onSent={() => setEditing(null)} />
      )}

      {turnOnBlock && (
        <Modal title="Uwaga" onClose={() => setTurnOnBlock(null)} small
          footer={<>
            <button type="button" className="btn" onClick={() => setTurnOnBlock(null)}>Anuluj</button>
            <button type="button" className="btn btn-ghost" onClick={switchToPellet}>Przełącz na Pellet</button>
            <button type="button" className="btn btn-primary" onClick={startHeatPump}>Uruchom pompę ciepła</button>
          </>}>
          <p>Zbyt niska temperatura kotła — wymagane jest uruchomienie pompy ciepła lub przełączenie trybu pracy na Pellet.</p>
          {turnOnError && <p className="help danger-text">{turnOnError}</p>}
        </Modal>
      )}

      {profile && (
        <Modal title={`Tryb pracy: ${profile.label}`} onClose={() => setProfile(null)}
          footer={<>
            <button type="button" className="btn" onClick={() => setProfile(null)}>Anuluj</button>
            <button type="button" className="btn btn-primary" onClick={sendProfile} disabled={pendingChanges(profile.changes).length === 0}>Przełącz</button>
          </>}>
          {pendingChanges(profile.changes).length === 0
            ? <p>Ustawienia kotła już odpowiadają temu trybowi.</p>
            : <p>Zostaną zlecone zmiany (w tej kolejności):</p>}
          <ul className="params">
            {pendingChanges(profile.changes).map((change) => {
              const { name, parameter } = labelOf(change);
              const item: Item = { kind: change.kind === 'mixer' ? 'mixer' : 'ecomax', mixer: change.mixer, index: change.index };
              return (
                <li key={`${change.kind}-${change.mixer ?? 0}-${change.index}`}>
                  <span className="param-name">{name}<small>nr {change.index}</small></span>
                  <span className="param-val">
                    {parameter && <span className="boiler-prev">{display(item, parameter, parameter.value)} → </span>}
                    {parameter ? display(item, parameter, fromRaw(parameter, change.value)) : change.value}
                  </span>
                </li>
              );
            })}
          </ul>
          {profileNeedsOff && pendingChanges(profile.changes).length > 0 && (
            <p className="help">
              Najpierw zostanie wyłączony regulator; zmiany pójdą do kotła, gdy zgłosi stan „wyłączony”
              (przy paleniu pelletu po wygaszeniu).
            </p>
          )}
          {pendingChanges(profile.changes).length > 0 && (
            <label className="check">
              <input type="checkbox" checked={turnOnAfter} onChange={(event) => setTurnOnAfter(event.currentTarget.checked)} />
              <span>Po zmianie włączyć regulator</span>
            </label>
          )}
          {profileError && <p className="help danger-text">{profileError}</p>}
        </Modal>
      )}
    </>
  );
};
