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
  PelletBoilerChange, PelletBoilerCommand, PelletBoilerMode, PelletBoilerParameter, PelletBoilerScheduleSettings,
  PelletBoilerSettings,
} from '../types';
import { formatDateTime, formatNumber, stateName, workModeName } from '../utils/boiler';

// zdarzenie okna po zleceniu zmiany: MainParameters odświeża wartości i „Ostatnie zmiany”
export const COMMANDS_CHANGED = 'pellet-boiler-commands-changed';

export type Item ={ kind: 'ecomax' | 'mixer'; mixer?: number; index: number };

// Grupa „Głównych parametrów”: na liście tylko temperatura zadana (pierwszy element), ołówek otwiera
// panel ze wszystkimi parametrami grupy. min/max: numery granic zadanej (kolejność wysyłki).
type Section = { title: string; items: Item[]; min?: number; max?: number };
const ecomax = (indexes: number[]): Item[] => indexes.map((index) => ({ kind: 'ecomax', index }));
const mixerItems = (mixer: number): Item[] => [0, 1, 2, 4, 6].map((index) => ({ kind: 'mixer', mixer, index }));
const SECTIONS: Section[] = [
  { title: 'Kocioł', items: ecomax([98, 99, 17, 101, 105]), min: 99 },
  { title: 'CWU', items: ecomax([119, 123, 122]) },
  { title: 'Mieszacz 1 (grzejniki)', items: mixerItems(1), min: 1, max: 2 },
  { title: 'Mieszacz 2', items: mixerItems(2), min: 1, max: 2 },
];

// Wybory zamiast liczb (kolejność według kopii ustawień; 125 niepotwierdzona na kotle).
export const CHOICES: Record<string, string[]> = {
  'ecomax:122': ['Wyłączony', 'Priorytet', 'Bez priorytetu'],
  'ecomax:125': ['Zima', 'Lato', 'Auto'],
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
const PROFILE_LABEL: Record<PelletBoilerMode, string> = { 'heat-pump': 'Pompa ciepła', pellet: 'Pellet' };

const CONTROL_LABEL = (value: number) => (value ? 'Kocioł → włączony' : 'Kocioł → wyłączony');

const STATUS_TEXT: Record<PelletBoilerCommand['status'], string> = {
  pending: 'czeka na sterownik',
  sent: 'wysyłane do kotła',
  done: 'zapisane',
  error: 'błąd',
  replaced: 'zastąpione nowszą zmianą',
};

// parametr z odczytu ustawień; polecenie włącz/wyłącz (kind control) nie jest parametrem
const findIn = (settings: PelletBoilerSettings | null, item: { kind: string; mixer?: number; index: number }) =>
  item.kind === 'control' ? undefined
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
  const [value, setValue] = useState(String(parameter.value).replace('.', ','));
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
  section: Section; settings: PelletBoilerSettings; onClose: () => void; onSent: () => void;
}> = ({ section, settings, onClose, onSent }) => {
  const fields = section.items
    .map((item) => ({ item, parameter: findIn(settings, item) }))
    .filter((field): field is { item: Item; parameter: PelletBoilerParameter } => !!field.parameter);
  const [values, setValues] = useState<Record<number, string>>(
    () => Object.fromEntries(fields.map(({ item, parameter }) => [item.index, String(parameter.value).replace('.', ',')])));
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  const numberOf = (index: number) => Number((values[index] ?? '').replace(',', '.'));
  const changed = fields.filter(({ item, parameter }) => toRaw(parameter, numberOf(item.index)) !== parameter.raw[0]);
  const service = changed.some(({ parameter }) => ratingClass(parameter.rating) === 'boiler-rating-service');

  const send = async (event: FormEvent) => {
    event.preventDefault();
    if (changed.length === 0) return onClose();
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
    const response = await PelletBoilerRequests.postCommands(
      ordered.map(({ item, parameter }) => ({ ...item, value: toRaw(parameter, numberOf(item.index)) })));
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
          const choices = choicesOf(item, parameter);
          const value = values[item.index];
          const set = (next: string) => setValues({ ...values, [item.index]: next });
          return (
            <div key={item.index} className="boiler-group-field">
              <label>
                <span>
                  {parameter.label ?? parameter.name}
                  {parameter.unit && !choices ? ` [${parameter.unit}]` : ''}
                </span>
                {choices ? (
                  <select value={value} onChange={(event) => set(event.currentTarget.value)}>
                    {choices.map((label, index) => index >= parameter.min && index <= parameter.max
                      && <option key={label} value={String(index)}>{label}</option>)}
                  </select>
                ) : (
                  <input type="number" inputMode="decimal" step={parameter.step ?? 1} value={value}
                    onChange={(event) => set(event.currentTarget.value)} />
                )}
              </label>
              <details className="boiler-hint">
                <summary>zakres {display(item, parameter, parameter.min)} – {display(item, parameter, parameter.max)}</summary>
                {parameter.description && <div className="boiler-parameter-description">{parameter.description}</div>}
                {parameter.rating && <div className={`boiler-parameter-rating ${ratingClass(parameter.rating)}`}>{parameter.rating}</div>}
              </details>
            </div>
          );
        })}
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

  const sendProfile = async () => {
    if (!profile) return;
    const response = await PelletBoilerRequests.postCommands(pendingChanges(profile.changes));
    if (response?.status === 201) {
      setProfile(null);
      setProfileError('');
      load();
    } else {
      setProfileError(await errorMessage(response));
    }
  };

  // Sezon: Tryb LATO (nr 125), 0 Zima / 1 Lato / 2 Auto (kolejność z PyPlumIO, na kotle niepotwierdzona)
  const summer = findIn(settings ?? null, { kind: 'ecomax', index: 125 });
  const [seasonError, setSeasonError] = useState('');
  const setSeason = async (value: number, label: string) => {
    if (!window.confirm(`Przełączyć kocioł na tryb: ${label}?`)) return;
    const response = await PelletBoilerRequests.postCommands([{ kind: 'ecomax', index: 125, value }]);
    setSeasonError(response?.status === 201 ? '' : await errorMessage(response));
    load();
  };

  // Regulator jak na panelu: „Włącz regulator” / „Wyłącz regulator” wysyłają zlecenie control (ramka 0x3B,
  // firmware od 1.4.0). Stan pokazuje ostatni odczyt kotła (wyłączony = stan 0 albo 7, wygaszanie), nie
  // ustawienie w aplikacji. Wyłączenie zatrzymuje też harmonogram, włączenie go wznawia
  // (schedule-settings.enabled); zapis ustawień idzie przed zleceniem, żeby zlecenie serwera przy tym
  // zapisie zostało zastąpione naszym (createCommands: ta sama pozycja oczekująca = replaced).
  const [boilerState, setBoilerState] = useState<number | undefined>(undefined);
  useEffect(() => { PelletBoilerRequests.getLast().then((last) => setBoilerState(last?.state)); }, [commands]);
  const regulatorOn = boilerState === undefined ? undefined : boilerState !== 0 && boilerState !== 7;
  const controlPending = commands.find((command) => command.kind === 'control' && (command.status === 'pending' || command.status === 'sent'));
  const [workError, setWorkError] = useState('');
  const setWork = async (on: boolean) => {
    if (!scheduleSettings) return;
    const question = on
      ? 'Włączyć regulator? Kocioł będzie pracował według sezonu i ustawień, harmonogram zacznie działać.'
      : 'Wyłączyć regulator? Kocioł nie rozpali się (pellet przejdzie w wygaszanie), harmonogram przestanie działać.';
    if (!window.confirm(question)) return;
    try {
      if (scheduleSettings.enabled !== on) {
        setScheduleSettings(await PelletBoilerRequests.saveScheduleSettings({ ...scheduleSettings, enabled: on }));
      }
      const response = await PelletBoilerRequests.postCommands([{ kind: 'control', index: 0, value: on ? 1 : 0 }]);
      setWorkError(response?.status === 201 ? '' : await errorMessage(response));
      load();
    } catch {
      setWorkError('Nie udało się wysłać.');
    }
  };

  const ready = settings && settings.readAt;
  const currentMode = workModeName(settings ?? null);
  const labelOf = (change: PelletBoilerChange) => {
    const parameter = findIn(settings ?? null, change);
    const where = change.kind === 'mixer' ? `Mieszacz ${change.mixer}: ` : '';
    return { name: `${where}${parameter?.label ?? `nr ${change.index}`}`, parameter };
  };
  const recent = commands.slice(0, 8);

  return (
    <>
      <div className="resource">
        <h3 className="settings-section-title">Tryb pracy</h3>
        <div className="boiler-profiles">
          {profiles.map((item) => (
            <button key={item.key} type="button" disabled={!ready || !scheduleSettings}
              className={currentMode === item.label ? 'boiler-profile-active' : 'boiler-profile'}
              onClick={() => { setProfileError(''); setProfile(item); }}>
              {item.label}
            </button>
          ))}
        </div>
        <div className="boiler-hint">
          Obecny: <strong>{currentMode}</strong> (z minimalnej temperatury kotła). Przełączenie zleca nastawy
          trybu z Ustawień zaawansowanych (grupa „Pompa ciepła / Pellet”); CWU ustawia harmonogram trybu.
        </div>

      </div>

      <div className="resource">
        <h3 className="settings-section-title">Główne parametry</h3>
        {settings === undefined && <div>Wczytywanie…</div>}
        {settings !== undefined && !ready && <div>Brak odczytu ustawień — sterownik jeszcze ich nie wysłał.</div>}
        {scheduleSettings && (
          <div className="boiler-main-section">
            <div className="boiler-main-title">
              Regulator:{' '}
              {regulatorOn === undefined
                ? <span>brak odczytu</span>
                : <span className={regulatorOn ? 'boiler-state-on' : 'boiler-state-off'}>{regulatorOn ? 'WŁĄCZONY' : 'WYŁĄCZONY'}</span>}
              {boilerState !== undefined && <span className="boiler-hint"> ({stateName(boilerState)})</span>}
            </div>
            <div className="boiler-profiles">
              <button type="button" className="boiler-profile" disabled={regulatorOn === true || !!controlPending} onClick={() => setWork(true)}>
                Włącz regulator
              </button>
              <button type="button" className="boiler-profile" disabled={regulatorOn === false || !!controlPending} onClick={() => setWork(false)}>
                Wyłącz regulator
              </button>
            </div>
            <div className="boiler-hint">
              {controlPending
                ? `${controlPending.value ? 'Włączenie' : 'Wyłączenie'} regulatora czeka na sterownik.`
                : `Harmonogram ${scheduleSettings.enabled ? 'działa' : 'nie działa'}.`}
            </div>
            {workError && <div className="boiler-error">{workError}</div>}
          </div>
        )}
        {ready && (
          <div className="boiler-main-section">
            <div className="boiler-main-title">Sezon</div>
            <div className="boiler-profiles">
              {/* bez Auto (decyzja użytkownika 2026-10-04): tylko Zima i Lato */}
              {(CHOICES['ecomax:125']).slice(0, 2).map((label, value) => (
                <button key={label} type="button" disabled={!summer || value < summer.min || value > summer.max}
                  className={summer?.value === value ? 'boiler-profile-active' : 'boiler-profile'}
                  onClick={() => summer?.value !== value && setSeason(value, label)}>
                  {label}
                </button>
              ))}
            </div>
            <div className="boiler-hint">
              Lato: kocioł grzeje tylko CWU, ogrzewanie CO wyłączone.
              {summer?.value === 2 && ' Teraz kocioł jest w trybie Auto (przełączanie według temperatury zewnętrznej).'}
            </div>
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
                  <span className="boiler-parameter-value">{display(item, parameter, parameter.value)}</span>
                  <IconButton label={`Zmień: ${section.title}`} icon={<EditIcon />} onClick={() => setEditing(section)} />
                </div>
              ) : (
                <div className="boiler-hint">Regulator nie podaje nastaw tego mieszacza — zmiana tylko na panelu kotła.</div>
              )}
            </div>
          );
        })}
        {ready && <div className="boiler-hint">Odczyt ustawień: {formatDateTime(settings.readAt)}</div>}
      </div>

      {recent.length > 0 && (
        <div className="resource">
          <h3 className="settings-section-title">Ostatnie zmiany</h3>
          <ul className="boiler-commands">
            {recent.map((command) => {
              const control = command.kind === 'control';
              const { name, parameter } = control ? { name: '', parameter: undefined } : labelOf(command);
              const item: Item = { kind: command.kind === 'mixer' ? 'mixer' : 'ecomax', mixer: command.mixer, index: command.index };
              const value = parameter ? display(item, parameter, fromRaw(parameter, command.value)) : String(command.value);
              return (
                <li key={command._id}>
                  <span>{control ? <strong>{CONTROL_LABEL(command.value)}</strong> : <>{name} → <strong>{value}</strong></>}</span>
                  <span className={`boiler-command-${command.status}`}>
                    {STATUS_TEXT[command.status]}{command.error ? `: ${command.error}` : ''}
                    <span className="boiler-hint"> · {formatDateTime(command.createdAt)}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {editing && settings && (
        <GroupEditPanel section={editing} settings={settings} onClose={() => setEditing(null)}
          onSent={() => setEditing(null)} />
      )}

      {profile && (
        <div className="device-modal-backdrop" onClick={() => setProfile(null)}>
          <div className="device-modal boiler-edit" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <h2>Tryb pracy: {profile.label}</h2>
            {pendingChanges(profile.changes).length === 0
              ? <div>Ustawienia kotła już odpowiadają temu trybowi.</div>
              : <div>Zostaną zlecone zmiany (w tej kolejności):</div>}
            <ul className="boiler-commands">
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
