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
import { PelletBoilerChange, PelletBoilerCommand, PelletBoilerParameter, PelletBoilerSettings } from '../types';
import { formatDateTime, formatNumber, workModeName } from '../utils/boiler';

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

// Zestawy z kociol-ustawienia.md, punkt 4b (wartości surowe = °C; kolejność ma znaczenie).
const PROFILES: { key: string; label: string; changes: PelletBoilerChange[] }[] = [
  {
    key: 'heat-pump', label: 'Pompa ciepła', changes: [
      { kind: 'ecomax', index: 99, value: 30 }, { kind: 'ecomax', index: 98, value: 30 },
      { kind: 'ecomax', index: 17, value: 20 }, { kind: 'ecomax', index: 101, value: 30 },
      { kind: 'ecomax', index: 105, value: 5 }, { kind: 'ecomax', index: 119, value: 40 },
      { kind: 'ecomax', index: 123, value: 5 }, { kind: 'ecomax', index: 122, value: 1 },
      { kind: 'mixer', mixer: 1, index: 1, value: 30 }, { kind: 'mixer', mixer: 1, index: 2, value: 50 },
      { kind: 'mixer', mixer: 1, index: 4, value: 0 }, { kind: 'mixer', mixer: 1, index: 0, value: 35 },
    ],
  },
  {
    key: 'pellet', label: 'Pellet', changes: [
      { kind: 'ecomax', index: 98, value: 67 }, { kind: 'ecomax', index: 99, value: 65 },
      { kind: 'ecomax', index: 17, value: 10 }, { kind: 'ecomax', index: 101, value: 50 },
      { kind: 'ecomax', index: 105, value: 5 }, { kind: 'ecomax', index: 119, value: 50 },
      { kind: 'ecomax', index: 123, value: 15 }, { kind: 'ecomax', index: 122, value: 2 },
      { kind: 'mixer', mixer: 1, index: 2, value: 50 }, { kind: 'mixer', mixer: 1, index: 1, value: 40 },
      { kind: 'mixer', mixer: 1, index: 4, value: 1 },
    ],
  },
];

const STATUS_TEXT: Record<PelletBoilerCommand['status'], string> = {
  pending: 'czeka na sterownik',
  sent: 'wysyłane do kotła',
  done: 'zapisane',
  error: 'błąd',
  replaced: 'zastąpione nowszą zmianą',
};

const findIn = (settings: PelletBoilerSettings | null, item: Item) => item.kind === 'ecomax'
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
  const [profile, setProfile] = useState<(typeof PROFILES)[number] | null>(null);
  const [profileError, setProfileError] = useState('');

  const load = useCallback(() => {
    PelletBoilerRequests.getSettings().then(setSettings);
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
  const pendingChanges = (changes: PelletBoilerChange[]) =>
    changes.filter((change) => findIn(settings ?? null, change)?.raw[0] !== change.value);

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
          {PROFILES.map((item) => (
            <button key={item.key} type="button" disabled={!ready}
              className={currentMode === item.label ? 'boiler-profile-active' : 'boiler-profile'}
              onClick={() => { setProfileError(''); setProfile(item); }}>
              {item.label}
            </button>
          ))}
        </div>
        <div className="boiler-hint">
          Obecny: <strong>{currentMode}</strong> (z minimalnej temperatury kotła). Przełączenie zleca cały
          zestaw ustawień z dokumentacji kotła (punkt 4b).
        </div>

      </div>

      <div className="resource">
        <h3 className="settings-section-title">Główne parametry</h3>
        {settings === undefined && <div>Wczytywanie…</div>}
        {settings !== undefined && !ready && <div>Brak odczytu ustawień — sterownik jeszcze ich nie wysłał.</div>}
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
              const { name, parameter } = labelOf(command);
              const item: Item = { kind: command.kind, mixer: command.mixer, index: command.index };
              const value = parameter ? display(item, parameter, fromRaw(parameter, command.value)) : String(command.value);
              return (
                <li key={command._id}>
                  <span>{name} → <strong>{value}</strong></span>
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
                const item: Item = { kind: change.kind, mixer: change.mixer, index: change.index };
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
