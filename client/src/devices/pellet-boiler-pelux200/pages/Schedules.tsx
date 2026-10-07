// Zakładka Harmonogram kotła (/schedules): w oknach godzin tryb pracy Lato / Zima (nr 125, od 2026-10-04;
// wpis może działać tylko przy temperaturze zewnętrznej poniżej progu) i CWU od–do; osobne listy i osobne
// wartości poza harmonogramem dla trybu „Pompa ciepła” i „Pellet” (dni jak w pompie ciepła; okno przez
// północ należy do dnia startu). W grupie trybu kolejno: wpisy trybu pracy, wpisy CWU, „Poza harmonogramem”.
// Działa lista trybu, w którym kocioł jest teraz (z odczytu ustawień). Serwer co minutę wylicza stan i przy
// jego zmianie zleca kotłowi jednym zleceniem sezon (nr 125), zadaną CWU (nr 119 = do) i histerezę
// (nr 123 = do − od). Harmonogram działa po „Włącz regulator” w Ustawieniach; włączania i wyłączania
// kotła w harmonogramie nie ma (usunięte 2026-10-04). Czerwona kreska: wpis albo ustawienie domyślne, które
// działa teraz (GET /schedules/current, odświeżane co minutę; tam też temperatura zewnętrzna z czujnika kotła).
// Wiersz wpisu w dwóch liniach: dzień pogrubiony, pod nim godziny i ustawienie. Wygląd z harmonogramów pompy.
import '../../heat-pump/pages/Schedules/style.css';
import './style.css';
import { FormEvent, useEffect, useState } from 'react';
import { WeekDay } from '../../../core/types';
import Notification, { useSaveNotice } from '../../../core/components/Notification';
import { IconButton } from '../../../core/components/IconButton';
import { EditIcon, PlusIcon, TrashIcon } from '../../../core/components/icons';
import { PelletBoilerRequests } from '../api';
import { WinterCycleStatus } from '../components/WinterCycleStatus';
import {
  PelletBoilerCurrentSchedule, PelletBoilerMode, PelletBoilerSchedule, PelletBoilerScheduleSettings, PelletBoilerSeason,
} from '../types';

const weekDays = [
  ['Poniedziałek', WeekDay.MONDAY], ['Wtorek', WeekDay.TUESDAY], ['Środa', WeekDay.WEDNESDAY],
  ['Czwartek', WeekDay.THURSDAY], ['Piątek', WeekDay.FRIDAY], ['Sobota', WeekDay.SATURDAY], ['Niedziela', WeekDay.SUNDAY],
] as const;
const dayOptions = [
  ['Każdy dzień', WeekDay.ANY_DAY],
  ['Dni robocze (poniedziałek–piątek)', WeekDay.WORKDAYS],
  ['Dni wolne (weekendy i święta)', WeekDay.DAYS_OFF],
  ...weekDays,
] as const;
export const MODE_LABEL: Record<PelletBoilerMode, string> = { 'heat-pump': 'Pompa ciepła', pellet: 'Pellet' };
const MODES: PelletBoilerMode[] = ['heat-pump', 'pellet'];
const SEASON_LABEL: Record<PelletBoilerSeason, string> = { winter: 'Zima', summer: 'Lato' };
const SEASONS: PelletBoilerSeason[] = ['summer', 'winter'];
// tryb pompy ciepła: CWU najwyżej 45 °C (wyżej pompa ciepła nie dogrzeje); serwer sprawdza to samo
const cwuMax = (mode: PelletBoilerMode) => (mode === 'heat-pump' ? 45 : 80);

const formatDay = (schedule: PelletBoilerSchedule) => {
  if (schedule.date) return new Date(schedule.date).toLocaleDateString('pl-PL', { timeZone: 'Europe/Warsaw' });
  if (schedule.dayOfWeek === WeekDay.ANY_DAY) return 'Każdy dzień';
  if (schedule.dayOfWeek === WeekDay.WORKDAYS) return 'Dni robocze';
  if (schedule.dayOfWeek === WeekDay.DAYS_OFF) return 'Dni wolne';
  return weekDays.find(([, value]) => value === schedule.dayOfWeek)?.[0] ?? '---';
};
// „40–43 °C (zadana 43, histereza 3)”
const cwuText = (from: number, to: number) => `${from}–${to} °C (zadana ${to}, histereza ${to - from})`;

const emptyForm = {
  type: 'cwu' as 'cwu' | 'season', mode: 'heat-pump' as PelletBoilerMode, enabled: true,
  dayOfWeek: String(WeekDay.ANY_DAY), date: '', startTime: '', endTime: '', cwuFrom: '40', cwuTo: '43',
  season: 'winter' as PelletBoilerSeason, coldEnabled: false, coldBelow: '6',
};

// Lato / Zima jako dwa przyciski (wygląd jak przełącznik sezonu w Ustawieniach)
const SeasonChoice: React.FC<{ value?: PelletBoilerSeason; onChange: (season: PelletBoilerSeason) => void }> = ({ value, onChange }) => (
  <div className="boiler-profiles">
    {SEASONS.map((season) => (
      <button key={season} type="button" className={value === season ? 'boiler-profile-active' : 'boiler-profile'}
        onClick={() => onChange(season)}>
        {SEASON_LABEL[season]}
      </button>
    ))}
  </div>
);

export const PelletBoilerSchedules: React.FC = () => {
  const [settings, setSettings] = useState<PelletBoilerScheduleSettings | null>(null);
  const [current, setCurrent] = useState<PelletBoilerCurrentSchedule | null>(null);
  const [schedules, setSchedules] = useState<PelletBoilerSchedule[] | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [useDate, setUseDate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [settingsError, setSettingsError] = useState('');
  // przyciski zapisu nieaktywne w trakcie zapisu i dopóki widać komunikat (useSaveNotice)
  const { notice, showNotice, run, busy } = useSaveNotice();

  const loadCurrent = () => PelletBoilerRequests.getCurrentSchedule().then(setCurrent);
  const loadAll = () => {
    PelletBoilerRequests.getScheduleSettings().then(setSettings);
    PelletBoilerRequests.getSchedules().then((result) => setSchedules(result ?? []));
    loadCurrent();
  };
  useEffect(() => {
    loadAll();
    const timer = window.setInterval(loadCurrent, 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  // Pola CWU „Poza harmonogramem” trzymają wpisany tekst (cwuDrafts), a liczbę do ustawień biorą tylko
  // z niepustego wpisu: dawniej Number('') = 0 i pola nie dało się wyczyścić (uwaga użytkownika 2026-10-05).
  const [cwuDrafts, setCwuDrafts] = useState<Record<string, string>>({});
  const draftKey = (mode: PelletBoilerMode, field: 'cwuFrom' | 'cwuTo') => `${mode}.${field}`;
  const cwuInput = (mode: PelletBoilerMode, field: 'cwuFrom' | 'cwuTo') =>
    cwuDrafts[draftKey(mode, field)] ?? String(settings?.defaults[mode][field] ?? '');
  const setDefault = (mode: PelletBoilerMode, field: 'cwuFrom' | 'cwuTo' | 'season', value: string) => {
    if (!settings) return;
    if (field !== 'season') {
      setCwuDrafts((old) => ({ ...old, [draftKey(mode, field)]: value }));
      if (value.trim() === '' || !Number.isFinite(Number(value))) return;
    }
    setSettings({
      ...settings,
      defaults: {
        ...settings.defaults,
        [mode]: { ...settings.defaults[mode], [field]: field === 'season' ? value : Number(value) },
      },
    });
  };

  const saveSettings = async (event: FormEvent) => {
    event.preventDefault();
    if (!settings) return;
    if (Object.values(cwuDrafts).some((value) => value.trim() === '')) {
      return setSettingsError('CWU: wpisz temperaturę „od” i „do”.');
    }
    if (MODES.some((mode) => settings.defaults[mode].cwuFrom >= settings.defaults[mode].cwuTo)) {
      return setSettingsError('CWU: „od” musi być mniejsze niż „do”.');
    }
    if (settings.defaults['heat-pump'].cwuTo > cwuMax('heat-pump')) {
      return setSettingsError(`Pompa ciepła: CWU najwyżej ${cwuMax('heat-pump')} °C.`);
    }
    await run(async () => { try {
      setSettings(await PelletBoilerRequests.saveScheduleSettings(settings));
      setCwuDrafts({});
      setSettingsError('');
      loadCurrent();
      showNotice('Ustawienia harmonogramu zapisane.');
    } catch {
      setSettingsError('Nie udało się zapisać (CWU od–do: 10–80 °C, liczby całkowite).');
    } });
  };

  const resetForm = () => {
    setForm(emptyForm);
    setUseDate(false);
    setEditingId(null);
    setShowForm(false);
  };
  const update = (field: keyof typeof form, value: string | boolean) => setForm((old) => ({ ...old, [field]: value }));
  const openForm = (mode: PelletBoilerMode, type: 'cwu' | 'season') => {
    setForm({ ...emptyForm, mode, type, ...(type === 'season' ? { startTime: '22:00', endTime: '06:00' } : {}) });
    setUseDate(false);
    setEditingId(null);
    setShowForm(true);
    setError('');
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    const when = {
      mode: form.mode, enabled: form.enabled,
      ...(useDate ? { date: form.date } : { dayOfWeek: Number(form.dayOfWeek) as WeekDay }),
      startTime: form.startTime, endTime: form.endTime,
    };
    let payload: PelletBoilerSchedule;
    if (form.type === 'season') {
      const cold = Number(form.coldBelow);
      if (form.coldEnabled && (!Number.isInteger(cold) || cold < -30 || cold > 30)) {
        return setError('Próg temperatury: liczba całkowita −30…30 °C.');
      }
      payload = { ...when, type: 'season', season: form.season, coldBelow: form.coldEnabled ? cold : null };
    } else {
      if (Number(form.cwuFrom) >= Number(form.cwuTo)) return setError('CWU: „od” musi być mniejsze niż „do”.');
      if (Number(form.cwuTo) > cwuMax(form.mode)) return setError(`Pompa ciepła: CWU najwyżej ${cwuMax(form.mode)} °C.`);
      payload = { ...when, type: 'cwu', cwuFrom: Number(form.cwuFrom), cwuTo: Number(form.cwuTo) };
    }
    setSaving(true);
    try {
      if (editingId) await PelletBoilerRequests.updateSchedule(editingId, payload);
      else await PelletBoilerRequests.createSchedule(payload);
      resetForm();
      loadAll();
      showNotice('Harmonogram zapisany.');
    } catch {
      setError('Nie udało się zapisać harmonogramu.');
    } finally {
      setSaving(false);
    }
  };

  const edit = (schedule: PelletBoilerSchedule) => {
    const hasCold = schedule.coldBelow !== undefined && schedule.coldBelow !== null;
    setForm({
      type: schedule.type ?? 'cwu', mode: schedule.mode, enabled: schedule.enabled,
      dayOfWeek: String(schedule.dayOfWeek ?? WeekDay.ANY_DAY), date: schedule.date ? schedule.date.slice(0, 10) : '',
      startTime: schedule.startTime, endTime: schedule.endTime,
      cwuFrom: String(schedule.cwuFrom ?? emptyForm.cwuFrom), cwuTo: String(schedule.cwuTo ?? emptyForm.cwuTo),
      season: schedule.season ?? emptyForm.season,
      coldEnabled: hasCold, coldBelow: hasCold ? String(schedule.coldBelow) : emptyForm.coldBelow,
    });
    setUseDate(Boolean(schedule.date));
    setEditingId(schedule._id ?? null);
    setShowForm(true);
    setError('');
  };

  const remove = async (schedule: PelletBoilerSchedule) => {
    if (!schedule._id || !window.confirm('Usunąć ten wpis harmonogramu?')) return;
    try {
      await PelletBoilerRequests.deleteSchedule(schedule._id);
      loadAll();
    } catch {
      setError('Nie udało się usunąć wpisu.');
    }
  };

  const running = (mode: PelletBoilerMode) => !!current?.enabled && current.mode === mode;
  const outdoor = current?.outdoorTemperature;

  return (
    <div className="schedules-page boiler-schedules">
      <Notification message={notice} />
      <h2>Harmonogram</h2>
      <div className={`schedules-layout${showForm ? '' : ' schedules-layout-list-only'}`}>
        {showForm && (
          <form className="schedule-card" onSubmit={submit}>
            <h3>{editingId ? 'Edycja wpisu' : 'Nowy wpis'}</h3>
            <label>
              Rodzaj
              <select value={form.type} onChange={(event) => update('type', event.target.value)}>
                <option value="season">Tryb pracy (Lato / Zima)</option>
                <option value="cwu">CWU</option>
              </select>
            </label>
            <label>
              Dla trybu kotła
              <select value={form.mode} onChange={(event) => update('mode', event.target.value)}>
                {MODES.map((mode) => <option key={mode} value={mode}>{MODE_LABEL[mode]}</option>)}
              </select>
            </label>
            <label className="schedule-toggle">
              <input type="checkbox" checked={useDate} onChange={(event) => setUseDate(event.target.checked)} />
              Data jednorazowa
            </label>
            {useDate ? (
              <label>Data<input type="date" required value={form.date} onChange={(event) => update('date', event.target.value)} /></label>
            ) : (
              <label>
                Dzień
                <select required value={form.dayOfWeek} onChange={(event) => update('dayOfWeek', event.target.value)}>
                  {dayOptions.map(([name, value]) => <option key={value} value={value}>{name}</option>)}
                </select>
              </label>
            )}
            <div className="schedule-fields">
              <label>Od<input type="time" required value={form.startTime} onChange={(event) => update('startTime', event.target.value)} /></label>
              <label>Do<input type="time" required value={form.endTime} onChange={(event) => update('endTime', event.target.value)} /></label>
            </div>
            {form.startTime && form.endTime && form.startTime > form.endTime && (
              <div className="boiler-hint">Przez północ: do {form.endTime} następnego dnia.</div>
            )}
            {form.type === 'season' ? (
              <>
                <div>Tryb pracy</div>
                <SeasonChoice value={form.season} onChange={(season) => update('season', season)} />
                <label className="schedule-toggle">
                  <input type="checkbox" checked={form.coldEnabled} onChange={(event) => update('coldEnabled', event.target.checked)} />
                  <span>
                    Uruchom, gdy temperatura zewnętrzna spadnie poniżej{' '}
                    <input type="number" className="boiler-cold-input" min={-30} max={30} step={1} aria-label="Próg temperatury [°C]"
                      disabled={!form.coldEnabled} value={form.coldBelow} onChange={(event) => update('coldBelow', event.target.value)} /> °C
                  </span>
                </label>
                <div className="boiler-hint">
                  Lato: kocioł grzeje tylko CWU. Z progiem wpis działa tylko przy temperaturze poniżej progu (czujnik
                  zewnętrzny kotła; działający wpis zostaje do progu + 1 °C); powyżej obowiązuje tryb pracy „Poza harmonogramem”.
                </div>
              </>
            ) : (
              <>
                <div className="schedule-fields">
                  <label>CWU od [°C]<input type="number" min={10} max={cwuMax(form.mode)} required value={form.cwuFrom} onChange={(event) => update('cwuFrom', event.target.value)} /></label>
                  <label>CWU do [°C]<input type="number" min={10} max={cwuMax(form.mode)} required value={form.cwuTo} onChange={(event) => update('cwuTo', event.target.value)} /></label>
                </div>
                <div className="boiler-hint">
                  „Do” = zadana CWU, „od” = start ładowania (histereza = do − od).
                  {form.mode === 'heat-pump' && ' Pompa ciepła: najwyżej 45 °C.'}
                </div>
              </>
            )}
            <label className="schedule-toggle">
              <input type="checkbox" checked={form.enabled} onChange={(event) => update('enabled', event.target.checked)} />
              Aktywny
            </label>
            <div className="schedule-form-actions">
              <button type="submit" disabled={saving || busy}>{saving ? 'Zapisywanie...' : editingId ? 'Zapisz zmiany' : 'Zapisz'}</button>
              <button type="button" className="schedule-cancel" onClick={resetForm}>{editingId ? 'Anuluj' : 'Zamknij'}</button>
            </div>
            {error && <p className="schedule-error">{error}</p>}
          </form>
        )}

        <section className="schedule-card">
          {settings && (
            <div className="boiler-hint">
              Harmonogram: <span className={settings.enabled ? 'boiler-state-on' : 'boiler-state-off'}>
                {settings.enabled ? 'DZIAŁA' : 'NIE DZIAŁA'}
              </span>{settings.enabled ? '' : ' — działa po „Włącz regulator” w Ustawieniach'}
            </div>
          )}
          <div>Temperatura na zewnątrz: <b>{typeof outdoor === 'number' ? `${outdoor.toFixed(1)} °C` : '---'}</b></div>
          {current && !current.mode && <div className="boiler-hint">Brak odczytu ustawień kotła — nie wiadomo, który tryb działa.</div>}
          <WinterCycleStatus cycle={current?.winterCycle} />
          {schedules === null || settings === null ? <p>Ładowanie...</p> : (
            <form className="schedule-groups" onSubmit={saveSettings}>
              {MODES.map((mode) => {
                const seasons = schedules.filter((s) => s.mode === mode && s.type === 'season');
                const cwu = schedules.filter((s) => s.mode === mode && (s.type ?? 'cwu') === 'cwu');
                const now = running(mode);
                // dwie linie: dzień pogrubiony, pod nim godziny i ustawienie (extra: dodatkowa linia)
                const row = (schedule: PelletBoilerSchedule, isCurrent: boolean, what: React.ReactNode, extra?: React.ReactNode) => (
                  <article key={schedule._id} className={`schedule-row${isCurrent ? ' schedule-row-current' : ''}`}>
                    <div className="schedule-row-main">
                      <input type="checkbox" checked={schedule.enabled} readOnly aria-label="Aktywny" />
                      <span><b>{formatDay(schedule)}</b></span>
                    </div>
                    <div className="boiler-schedule-line">
                      {schedule.startTime} – {schedule.endTime}{schedule.startTime > schedule.endTime ? ' (+1 dzień)' : ''} · {what}
                      {!schedule.enabled && ' · wyłączony'}
                    </div>
                    {extra && <div className="boiler-schedule-line">{extra}</div>}
                    <IconButton className="schedule-edit" label="Edytuj wpis" icon={<EditIcon />} onClick={() => edit(schedule)} />
                    <IconButton className="schedule-delete" variant="danger" label="Usuń wpis" icon={<TrashIcon />} onClick={() => remove(schedule)} />
                  </article>
                );
                const defaultCurrent = now && !current?.scheduleId && !current?.seasonScheduleId;
                return (
                  <section key={mode} className="schedule-group">
                    {/* tryb kotła z odczytu ustawień (nr 99), niezależnie od harmonogramu: WŁĄCZONA niebieski, drugi WYŁĄCZONY czerwony */}
                    <h4>{MODE_LABEL[mode]} · <span className={current?.mode === mode ? 'boiler-state-on' : 'boiler-state-off'}>
                      {mode === 'heat-pump' ? (current?.mode === mode ? 'WŁĄCZONA' : 'WYŁĄCZONA') : (current?.mode === mode ? 'WŁĄCZONY' : 'WYŁĄCZONY')}
                    </span></h4>

                    <div className="schedule-list-header">
                      <span className="boiler-schedule-kind">Tryb pracy (Lato / Zima)</span>
                      {!showForm && <IconButton label={`Dodaj tryb pracy: ${MODE_LABEL[mode]}`} icon={<PlusIcon />} onClick={() => openForm(mode, 'season')} />}
                    </div>
                    <div className="schedule-list">
                      {seasons.length === 0 && <div className="boiler-hint">brak wpisów</div>}
                      {seasons.map((schedule) => row(schedule, now && schedule._id === current?.seasonScheduleId,
                        <>{SEASON_LABEL[schedule.season ?? 'winter']}</>,
                        schedule.coldBelow !== undefined && schedule.coldBelow !== null ? <>gdy na zewnątrz poniżej {schedule.coldBelow} °C</> : undefined))}
                    </div>

                    <div className="schedule-list-header">
                      <span className="boiler-schedule-kind">CWU</span>
                      {!showForm && <IconButton label={`Dodaj CWU: ${MODE_LABEL[mode]}`} icon={<PlusIcon />} onClick={() => openForm(mode, 'cwu')} />}
                    </div>
                    <div className="schedule-list">
                      {cwu.length === 0 && <div className="boiler-hint">brak wpisów</div>}
                      {cwu.map((schedule) => row(schedule, now && schedule._id === current?.scheduleId,
                        <>CWU {cwuText(schedule.cwuFrom ?? 0, schedule.cwuTo ?? 0)}</>))}
                    </div>

                    <div className={`boiler-default-row${defaultCurrent ? ' boiler-default-current' : ''}`}>
                      <span><b>Poza harmonogramem</b></span>
                      <div className="boiler-default-season">
                        <span>Tryb pracy</span>
                        <SeasonChoice value={settings.defaults[mode].season} onChange={(season) => setDefault(mode, 'season', season)} />
                      </div>
                      {!settings.defaults[mode].season && <div className="boiler-hint">Bez wyboru harmonogram nie zmienia trybu pracy poza wpisami.</div>}
                      <span className="schedule-fields">
                        <label>CWU od [°C]<input type="number" min={10} max={cwuMax(mode)} value={cwuInput(mode, 'cwuFrom')}
                          onChange={(event) => setDefault(mode, 'cwuFrom', event.target.value)} /></label>
                        <label>CWU do [°C]<input type="number" min={10} max={cwuMax(mode)} value={cwuInput(mode, 'cwuTo')}
                          onChange={(event) => setDefault(mode, 'cwuTo', event.target.value)} /></label>
                      </span>
                    </div>
                  </section>
                );
              })}
              {current?.enabled && current.state && (
                <div className="boiler-hint">
                  Teraz ({MODE_LABEL[current.state.mode]}): {current.state.season ? `${SEASON_LABEL[current.state.season]}, ` : ''}
                  CWU {cwuText(current.state.cwuFrom, current.state.cwuTo)}.
                  {' '}Zmiany z obu harmonogramów idą do kotła jednym zleceniem przy przejściu między wpisami; ręczna zmiana zostaje do następnego przejścia.
                </div>
              )}
              {current?.lastError && <div className="boiler-error">Ostatni błąd: {current.lastError}</div>}
              {settingsError && <div className="boiler-error">{settingsError}</div>}
              <div className="schedule-form-actions">
                <button type="submit" disabled={busy}>Zapisz ustawienia</button>
              </div>
            </form>
          )}
        </section>
      </div>
    </div>
  );
};
