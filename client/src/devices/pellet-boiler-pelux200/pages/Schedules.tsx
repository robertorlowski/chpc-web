// Zakładka Harmonogram kotła (/schedules), układ „Instrument” (#s-boiler-harmonogram): w oknach godzin „Tryb Zima”
// (nr 125; od 2026-10-15 z dwoma progami: Zima poniżej, Lato powyżej temperatury zewnętrznej) i CWU od–do; osobne listy
// i osobne wartości poza harmonogramem dla trybu „Pompa ciepła” i „Pellet” (dni jak w pompie ciepła; okno przez północ
// należy do dnia startu). Karta „Harmonogram”: czy działa (po „Włącz regulator” w Ustawieniach), która lista trybu
// działa (z odczytu ustawień, nr 99 < 50 °C = pompa ciepła; przełącznik tylko do odczytu), temperatura zewnętrzna, stan
// teraz i cykl Zimy. Dla każdego trybu karty „Tryb Zima · tryb” i „CWU · tryb” z wpisami (.entries: dzień, godziny,
// ustawienie, „działa teraz” przy wpisie z GET /schedules/current, odświeżanym co minutę) i wierszem „Poza harmonogramem”
// z ołówkiem. Wpisy i „Poza harmonogramem” edytuje się w oknie modalnym; zapis od razu (PUT schedule-settings zmienia
// tylko edytowany tryb). Serwer co minutę wylicza stan i przy jego zmianie zleca kotłowi jednym zleceniem sezon (nr 125),
// zadaną CWU (nr 119 = do) i histerezę (nr 123 = do − od). „CWU bez zmiany” (2026-10-13): poza wpisami harmonogram nie
// zmienia CWU w kotle; w trybie pompy ciepła ostrzeżenie, gdy zadana w kotle jest wyższa niż temperatura włączonej pompy
// ciepła (cwuTooHigh, heatPumpCwuMax). Bez powiązanej pompy ciepła (definicja kotła) tylko lista „Pellet”.
import { FormEvent, useEffect, useState } from 'react';
import { WeekDay } from '../../../core/types';
import Notification, { useSaveNotice } from '../../../core/components/Notification';
import { PelletBoilerRequests } from '../api';
import { WinterCycleStatus } from '../components/WinterCycleStatus';
import { IconBtn, Modal, Segmented } from '../components/ui';
import {
  PelletBoilerCurrentSchedule, PelletBoilerMode, PelletBoilerSchedule, PelletBoilerScheduleSettings, PelletBoilerSeason,
  seasonThresholds,
} from '../types';
import { useHeatPumpLinked } from '../utils/useHeatPumpLinked';
import './style.css';

const weekDays = [
  ['Poniedziałek', WeekDay.MONDAY], ['Wtorek', WeekDay.TUESDAY], ['Środa', WeekDay.WEDNESDAY],
  ['Czwartek', WeekDay.THURSDAY], ['Piątek', WeekDay.FRIDAY], ['Sobota', WeekDay.SATURDAY], ['Niedziela', WeekDay.SUNDAY],
] as const;
const dayOptions = [
  ['Każdy dzień', WeekDay.ANY_DAY],
  ['Dni robocze (bez świąt)', WeekDay.WORKDAYS],
  ['Dni wolne (weekendy i święta)', WeekDay.DAYS_OFF],
  ...weekDays,
] as const;
// wartość w polu „Dni” oznaczająca konkretną datę
const DATE_OPTION = 'date';
export const MODE_LABEL: Record<PelletBoilerMode, string> = { 'heat-pump': 'Pompa ciepła', pellet: 'Pellet' };
const MODES: PelletBoilerMode[] = ['heat-pump', 'pellet'];
const SEASON_LABEL: Record<PelletBoilerSeason, string> = { winter: 'Zima', summer: 'Lato' };
const SEASON_OPTIONS = [{ value: 'summer' as PelletBoilerSeason, label: 'Lato' }, { value: 'winter' as PelletBoilerSeason, label: 'Zima' }];
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
// CWU ustawione teraz w kotle (przy „CWU bez zmiany”): „45–50 °C”, bez histerezy „50 °C”
const boilerCwuText = (cwu?: { cwuFrom?: number; cwuTo?: number }) => (typeof cwu?.cwuTo !== 'number' ? '?'
  : typeof cwu.cwuFrom === 'number' ? `${cwu.cwuFrom}–${cwu.cwuTo} °C` : `${cwu.cwuTo} °C`);

const emptyForm = {
  type: 'cwu' as 'cwu' | 'season', mode: 'heat-pump' as PelletBoilerMode, enabled: true,
  dayOfWeek: String(WeekDay.ANY_DAY), date: '', startTime: '', endTime: '', cwuFrom: '40', cwuTo: '43',
  // „Tryb Zima”: season zostaje tylko dla dawnych wpisów Lato (formularz go nie pokazuje)
  season: 'winter' as PelletBoilerSeason, tempEnabled: true, winterBelow: '5', summerAbove: '7',
};
const TYPE_OPTIONS = [{ value: 'cwu' as const, label: 'CWU' }, { value: 'season' as const, label: 'Tryb Zima' }];

export const PelletBoilerSchedules: React.FC = () => {
  const [settings, setSettings] = useState<PelletBoilerScheduleSettings | null>(null);
  const [current, setCurrent] = useState<PelletBoilerCurrentSchedule | null>(null);
  const [schedules, setSchedules] = useState<PelletBoilerSchedule[] | null>(null);
  // Bez powiązanej pompy ciepła (definicja kotła) kocioł pracuje tylko na pellecie: jedna lista wpisów (Pellet),
  // bez wyboru trybu we wpisie.
  const heatPumpLinked = useHeatPumpLinked();
  const visibleModes = heatPumpLinked ? MODES : MODES.filter((mode) => mode === 'pellet');
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // edycja „Poza harmonogramem” jednego trybu (null = zamknięta); pola CWU jako tekst, żeby dało się je wyczyścić
  const [defaultsForm, setDefaultsForm] = useState<{
    mode: PelletBoilerMode; season?: PelletBoilerSeason; cwuFrom: string; cwuTo: string; cwuUnchanged: boolean;
  } | null>(null);
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

  const editDefaults = (mode: PelletBoilerMode) => {
    if (!settings) return;
    const defaults = settings.defaults[mode];
    setDefaultsForm({
      mode, season: defaults.season, cwuFrom: String(defaults.cwuFrom), cwuTo: String(defaults.cwuTo), cwuUnchanged: !!defaults.cwuUnchanged,
    });
    setShowForm(false);
    setEditingId(null);
    setError('');
  };

  const saveDefaults = async (event: FormEvent) => {
    event.preventDefault();
    if (!settings || !defaultsForm) return;
    const { mode } = defaultsForm;
    if (defaultsForm.cwuFrom.trim() === '' || defaultsForm.cwuTo.trim() === '') return setError('CWU: wpisz temperaturę „od” i „do”.');
    const cwuFrom = Number(defaultsForm.cwuFrom);
    const cwuTo = Number(defaultsForm.cwuTo);
    if (cwuFrom >= cwuTo) return setError('CWU: „od” musi być mniejsze niż „do”.');
    if (cwuTo > cwuMax(mode)) return setError(`Pompa ciepła: CWU najwyżej ${cwuMax(mode)} °C.`);
    // od–do zapisywane także przy „CWU bez zmiany” (wracają po odznaczeniu)
    const defaults = {
      ...settings.defaults[mode], cwuFrom, cwuTo, cwuUnchanged: defaultsForm.cwuUnchanged,
      ...(defaultsForm.season ? { season: defaultsForm.season } : {}),
    };
    await run(async () => { try {
      setSettings(await PelletBoilerRequests.saveScheduleSettings({ ...settings, defaults: { ...settings.defaults, [mode]: defaults } }));
      setDefaultsForm(null);
      setError('');
      loadCurrent();
      showNotice('Ustawienia harmonogramu zapisane.');
    } catch {
      setError('Nie udało się zapisać (CWU od–do: 10–80 °C, liczby całkowite).');
    } });
  };

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(false);
    setDefaultsForm(null);
    setError('');
  };
  const update = (field: keyof typeof form, value: string | boolean) => setForm((old) => ({ ...old, [field]: value }));
  const openForm = (mode: PelletBoilerMode, type: 'cwu' | 'season') => {
    setForm({ ...emptyForm, mode, type, ...(type === 'season' ? { startTime: '22:00', endTime: '06:00' } : {}) });
    setEditingId(null);
    setShowForm(true);
    setDefaultsForm(null);
    setError('');
  };
  const useDate = form.dayOfWeek === DATE_OPTION;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    if (!form.startTime || !form.endTime) return setError('Wpisz godziny od i do.');
    if (useDate && !form.date) return setError('Wpisz datę.');
    const when = {
      mode: form.mode, enabled: form.enabled,
      ...(useDate ? { date: form.date } : { dayOfWeek: Number(form.dayOfWeek) as WeekDay }),
      startTime: form.startTime, endTime: form.endTime,
    };
    let payload: PelletBoilerSchedule;
    if (form.type === 'season') {
      const winter = Number(form.winterBelow);
      const summer = Number(form.summerAbove);
      const valid = (value: number) => Number.isInteger(value * 2) && value >= -30 && value <= 30;
      if (form.tempEnabled && (!valid(winter) || !valid(summer))) return setError('Temperatury: −30…30 °C co 0,5 °C.');
      if (form.tempEnabled && summer <= winter) return setError('Temperatura Lata musi być wyższa niż temperatura Zimy.');
      payload = {
        ...when, type: 'season', season: form.season,
        winterBelow: form.tempEnabled ? winter : null, summerAbove: form.tempEnabled ? summer : null,
      };
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
    const thresholds = seasonThresholds(schedule);
    setForm({
      type: schedule.type ?? 'cwu', mode: schedule.mode, enabled: schedule.enabled,
      dayOfWeek: schedule.date ? DATE_OPTION : String(schedule.dayOfWeek ?? WeekDay.ANY_DAY), date: schedule.date ? schedule.date.slice(0, 10) : '',
      startTime: schedule.startTime, endTime: schedule.endTime,
      cwuFrom: String(schedule.cwuFrom ?? emptyForm.cwuFrom), cwuTo: String(schedule.cwuTo ?? emptyForm.cwuTo),
      season: schedule.season ?? emptyForm.season,
      tempEnabled: !!thresholds,
      winterBelow: thresholds ? String(thresholds.winterBelow) : emptyForm.winterBelow,
      summerAbove: thresholds ? String(thresholds.summerAbove) : emptyForm.summerAbove,
    });
    setEditingId(schedule._id ?? null);
    setShowForm(true);
    setDefaultsForm(null);
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
  const loaded = schedules !== null && settings !== null && heatPumpLinked !== undefined;
  // nagłówek karty trybu: „· pompa ciepła” tylko z powiązaną pompą ciepła
  const modeSuffix = (mode: PelletBoilerMode) => (heatPumpLinked ? ` · ${MODE_LABEL[mode].toLowerCase()}` : '');

  // Wiersz wpisu: dzień pogrubiony, godziny (z „+1 dzień” przez północ), ustawienie, „działa teraz”, ołówek i kosz.
  const row = (schedule: PelletBoilerSchedule, isCurrent: boolean, what: React.ReactNode) => (
    <li key={schedule._id} className={`entry${isCurrent ? ' is-current' : ''}${schedule.enabled ? '' : ' is-off'}`}>
      <span className="entry-when">
        <strong>{formatDay(schedule)}</strong> {schedule.startTime}–{schedule.endTime}
        {schedule.startTime > schedule.endTime && <> <small>(+1 dzień)</small></>}
      </span>
      <span className="entry-what">{what}{!schedule.enabled && ' · wyłączony'}</span>
      {isCurrent && <span className="entry-tag">działa teraz</span>}
      <span className="entry-actions">
        <IconBtn name="edit" label="Edytuj wpis" onClick={() => edit(schedule)} />
        <IconBtn name="trash" label="Usuń wpis" danger onClick={() => remove(schedule)} />
      </span>
    </li>
  );

  return (
    <div className="page page-device boiler-page">
      <Notification message={notice} />
      <section className="card">
        <header className="card-head"><h2>Harmonogram</h2><span className="card-hint">liczony co minutę</span></header>
        {settings && (
          <div className="form-row">
            <span className="t-name">
              Harmonogram {settings.enabled ? 'działa' : 'nie działa'}
              <small>{settings.enabled ? 'wyłącza go „Wyłącz regulator” w Ustawieniach' : 'działa po „Włącz regulator” w Ustawieniach'}</small>
            </span>
            <span className={`chip ${settings.enabled ? 'chip-ok' : 'chip-off'}`}>{settings.enabled ? 'działa' : 'nie działa'}</span>
          </div>
        )}
        {heatPumpLinked && (
          <>
            {/* lista trybu wybiera się sama (odczyt ustawień kotła): przełącznik tylko do odczytu */}
            <Segmented name="boiler-schedule-mode" label="Lista trybu" disabled value={current?.mode ?? null}
              options={MODES.map((mode) => ({ value: mode, label: `Lista: ${MODE_LABEL[mode].toLowerCase()}` }))} onChange={() => undefined} />
            <p className="help">
              Działa lista trybu z ostatniego odczytu ustawień (minimalna temperatura kotła nr 99 &lt; 50 °C = pompa ciepła).
              Tryb pracy przełącza się w Ustawieniach.
              {current && !current.mode && ' Brak odczytu ustawień kotła — nie wiadomo, który tryb działa.'}
            </p>
          </>
        )}
        <dl className="measures">
          <div><dt>Temperatura na zewnątrz</dt><dd>{typeof outdoor === 'number' ? `${outdoor.toFixed(1)} °C` : '---'}</dd></div>
          {current?.enabled && current.state && (
            <div>
              <dt>Teraz{heatPumpLinked ? ` (${MODE_LABEL[current.state.mode]})` : ''}</dt>
              <dd>
                {current.state.season ? `${SEASON_LABEL[current.state.season]}, ` : ''}
                {current.state.cwuUnchanged ? `CWU bez zmiany (w kotle: ${boilerCwuText(current.boilerCwu)})` : `CWU ${cwuText(current.state.cwuFrom, current.state.cwuTo)}`}
              </dd>
            </div>
          )}
        </dl>
        {current?.enabled && current.state && (
          <p className="help">
            Zmiany sezonu i CWU idą do kotła jednym zleceniem przy przejściu między wpisami.{' '}
            {current.state.mode === 'heat-pump'
              ? 'W trybie Pompa ciepła CWU zmienione na panelu wraca do harmonogramu w ciągu minuty (pompa ciepła nie dogrzeje wyższej temperatury); przy „CWU bez zmiany” poza wpisami zostaje.'
              : 'Ręczna zmiana CWU zostaje do następnego przejścia między wpisami.'}
            {' '}Sezon wybrany przyciskiem w Ustawieniach działa do najbliższego początku albo końca wpisu sezonu.
          </p>
        )}
        <WinterCycleStatus cycle={current?.winterCycle} />
        {current?.lastError && <p className="help danger-text">Ostatni błąd: {current.lastError}</p>}
        {error && !showForm && !defaultsForm && <p className="help danger-text">{error}</p>}
      </section>

      {!loaded && <section className="card"><span className="help">Ładowanie...</span></section>}
      {loaded && visibleModes.map((mode) => {
        const seasons = schedules.filter((s) => s.mode === mode && s.type === 'season');
        const cwu = schedules.filter((s) => s.mode === mode && (s.type ?? 'cwu') === 'cwu');
        const now = running(mode);
        const defaultCurrent = now && !current?.scheduleId && !current?.seasonScheduleId;
        const defaults = settings.defaults[mode];
        // tryb kotła z odczytu ustawień (nr 99), niezależnie od harmonogramu
        const listHint = heatPumpLinked ? (current?.mode === mode ? 'lista aktywna' : 'lista nieaktywna') : '';
        return (
          <div key={mode} className="stack">
            <section className="card">
              <header className="card-head">
                <h2>Tryb Zima{modeSuffix(mode)}</h2>
                <span className="card-head-tools">
                  {listHint && <span className="card-hint">{listHint}</span>}
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => openForm(mode, 'season')}>+ Dodaj wpis</button>
                </span>
              </header>
              {seasons.length === 0 && <span className="help">Brak wpisów: poza wpisami obowiązuje sezon z „Poza harmonogramem”.</span>}
              {seasons.length > 0 && (
                <ul className="entries">
                  {seasons.map((schedule) => {
                    const thresholds = seasonThresholds(schedule);
                    return row(schedule, now && schedule._id === current?.seasonScheduleId, (
                      <>
                        {SEASON_LABEL[schedule.season ?? 'winter']}
                        {thresholds && <> · poniżej {thresholds.winterBelow} °C, Lato powyżej {thresholds.summerAbove} °C</>}
                      </>
                    ));
                  })}
                </ul>
              )}
            </section>
            <section className="card">
              <header className="card-head">
                <h2>CWU{modeSuffix(mode)}</h2>
                <span className="card-head-tools">
                  {listHint && <span className="card-hint">{listHint}</span>}
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => openForm(mode, 'cwu')}>+ Dodaj wpis</button>
                </span>
              </header>
              <ul className="entries">
                {cwu.map((schedule) => row(schedule, now && schedule._id === current?.scheduleId, <>CWU {cwuText(schedule.cwuFrom ?? 0, schedule.cwuTo ?? 0)}</>))}
                {/* „Poza harmonogramem” jak wpis: ołówek otwiera okno, bez usuwania */}
                <li className={`entry is-default${defaultCurrent ? ' is-current' : ''}`}>
                  <span className="entry-when"><strong>Poza harmonogramem</strong></span>
                  <span className="entry-what">
                    {defaults.season ? SEASON_LABEL[defaults.season] : 'Sezon bez zmiany'} · {defaults.cwuUnchanged
                      ? `CWU bez zmiany (w kotle: ${boilerCwuText(current?.boilerCwu)})` : `CWU ${cwuText(defaults.cwuFrom, defaults.cwuTo)}`}
                    {/* tryb pompy ciepła z zadaną CWU, której pompa nie dogrzeje (np. ustawioną na panelu przy „CWU bez zmiany”) */}
                    {mode === 'heat-pump' && current?.cwuTooHigh && (
                      <><br /><span className="danger-text">Zadana CWU {current.boilerCwu?.cwuTo} °C jest wyższa niż temperatura pompy ciepła ({current.heatPumpCwuMax} °C) – pompa jej nie dogrzeje.</span></>
                    )}
                  </span>
                  {defaultCurrent && <span className="entry-tag">działa teraz</span>}
                  <span className="entry-actions">
                    <IconBtn name="edit" label={`Edytuj „Poza harmonogramem”: ${MODE_LABEL[mode]}`} onClick={() => editDefaults(mode)} />
                  </span>
                </li>
              </ul>
            </section>
          </div>
        );
      })}

      {defaultsForm && (
        <Modal title={`Poza harmonogramem${heatPumpLinked ? ` · ${MODE_LABEL[defaultsForm.mode].toLowerCase()}` : ''}`} onClose={resetForm} onSubmit={saveDefaults}
          footer={<>
            <button type="button" className="btn" onClick={resetForm}>Anuluj</button>
            <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Zapisywanie...' : 'Zapisz'}</button>
          </>}>
          <Segmented name="boiler-defaults-season" label="Sezon poza harmonogramem" value={defaultsForm.season ?? null} options={SEASON_OPTIONS}
            onChange={(season) => setDefaultsForm({ ...defaultsForm, season })} />
          <p className="help">{defaultsForm.season
            ? `Poza wpisami harmonogram ustawia ${SEASON_LABEL[defaultsForm.season]}.`
            : 'Bez wyboru harmonogram nie zmienia sezonu poza wpisami.'}</p>
          <label className="check">
            <input type="checkbox" checked={defaultsForm.cwuUnchanged}
              onChange={(event) => setDefaultsForm({ ...defaultsForm, cwuUnchanged: event.target.checked })} />
            <span>CWU bez zmiany</span>
            <small>temperatura z panelu kotła</small>
          </label>
          <div className="form-grid">
            <label htmlFor="boiler-defaults-from">CWU od / do</label>
            <div className="range-inputs">
              <input id="boiler-defaults-from" type="number" min={10} max={cwuMax(defaultsForm.mode)} required value={defaultsForm.cwuFrom}
                disabled={defaultsForm.cwuUnchanged} aria-label="CWU od [°C]"
                onChange={(event) => setDefaultsForm({ ...defaultsForm, cwuFrom: event.target.value })} />
              <span className="dash">–</span>
              <input type="number" min={10} max={cwuMax(defaultsForm.mode)} required value={defaultsForm.cwuTo}
                disabled={defaultsForm.cwuUnchanged} aria-label="CWU do [°C]"
                onChange={(event) => setDefaultsForm({ ...defaultsForm, cwuTo: event.target.value })} />
              <span className="unit-txt">°C</span>
            </div>
          </div>
          <p className="help">
            „Do” = zadana CWU, „od” = start ładowania (histereza = do − od).{defaultsForm.mode === 'heat-pump' && ' Pompa ciepła: najwyżej 45 °C.'}
            {defaultsForm.mode === 'heat-pump' && current?.pelletCwu?.enabled && ' Teraz włączone jest „CWU - grzanie peletem”: w trybie Pompa ciepła obowiązują CWU od–do z trybu Pellet.'}
          </p>
          {defaultsForm.cwuUnchanged && defaultsForm.mode === 'heat-pump' && (
            <p className="help danger-text">
              {typeof current?.heatPumpCwuMax === 'number'
                ? `Pompa ciepła grzeje do ${current.heatPumpCwuMax} °C – wyższa zadana CWU w kotle jest za wysoka.`
                : 'Zadana CWU w kotle wyższa niż temperatura pompy ciepła jest za wysoka – pompa jej nie dogrzeje.'}
              {typeof current?.boilerCwu?.cwuTo === 'number' && ` Teraz w kotle: ${current.boilerCwu.cwuTo} °C.`}
            </p>
          )}
          {error && <p className="help danger-text">{error}</p>}
        </Modal>
      )}

      {showForm && (
        <Modal title={editingId ? 'Edycja wpisu' : 'Wpis harmonogramu kotła'} onClose={resetForm} onSubmit={submit}
          footer={<>
            <button type="button" className="btn" onClick={resetForm}>Anuluj</button>
            <button type="submit" className="btn btn-primary" disabled={saving || busy}>{saving ? 'Zapisywanie...' : 'Zapisz wpis'}</button>
          </>}>
          <Segmented name="boiler-entry-type" label="Rodzaj" value={form.type} options={TYPE_OPTIONS} onChange={(type) => update('type', type)} />
          {heatPumpLinked && (
            <label className="field">
              <span>Lista trybu</span>
              <select value={form.mode} onChange={(event) => update('mode', event.target.value)}>
                {MODES.map((mode) => <option key={mode} value={mode}>{MODE_LABEL[mode]}</option>)}
              </select>
            </label>
          )}
          <label className="field">
            <span>Dni</span>
            <select value={form.dayOfWeek} onChange={(event) => update('dayOfWeek', event.target.value)}>
              {dayOptions.map(([name, value]) => <option key={value} value={value}>{name}</option>)}
              <option value={DATE_OPTION}>Konkretna data…</option>
            </select>
          </label>
          {useDate && (
            <label className="field">
              <span>Data</span>
              <input type="date" required value={form.date} onChange={(event) => update('date', event.target.value)} />
            </label>
          )}
          <div className="form-grid">
            <label htmlFor="boiler-entry-from">Godziny</label>
            <div className="range-inputs">
              <input id="boiler-entry-from" type="time" required value={form.startTime} onChange={(event) => update('startTime', event.target.value)} />
              <span className="dash">–</span>
              <input type="time" required value={form.endTime} aria-label="Do" onChange={(event) => update('endTime', event.target.value)} />
            </div>
            {form.type === 'cwu' && (
              <>
                <label htmlFor="boiler-entry-cwu">CWU od / do</label>
                <div className="range-inputs">
                  <input id="boiler-entry-cwu" type="number" min={10} max={cwuMax(form.mode)} required value={form.cwuFrom} onChange={(event) => update('cwuFrom', event.target.value)} />
                  <span className="dash">–</span>
                  <input type="number" min={10} max={cwuMax(form.mode)} required value={form.cwuTo} aria-label="CWU do [°C]" onChange={(event) => update('cwuTo', event.target.value)} />
                  <span className="unit-txt">°C</span>
                </div>
              </>
            )}
          </div>
          {form.startTime && form.endTime && form.startTime > form.endTime && (
            <p className="help">Przez północ: do {form.endTime} następnego dnia.</p>
          )}
          {form.type === 'cwu' ? (
            <p className="help">
              „Od” = start ładowania (zadana − histereza), „do” = zadana. Serwer zleca nr 119 = do i nr 123 = do − od tylko przy zmianie stanu.
              {form.mode === 'heat-pump' && ' Pompa ciepła: najwyżej 45 °C.'}
              {form.mode === 'heat-pump' && current?.pelletCwu?.enabled && ' Teraz włączone jest „CWU - grzanie peletem”: w trybie Pompa ciepła obowiązują CWU od–do z trybu Pellet.'}
            </p>
          ) : (
            <>
              <label className="check">
                <input type="checkbox" checked={form.tempEnabled} onChange={(event) => update('tempEnabled', event.target.checked)} />
                <span>Według temperatury zewnętrznej</span>
                <small>czujnik kotła; bez progów Zima trwa przez całe okno</small>
              </label>
              <div className="form-grid">
                <label htmlFor="boiler-entry-winter">Zima poniżej</label>
                <div className="range-inputs">
                  <input id="boiler-entry-winter" type="number" min={-30} max={30} step={0.5} disabled={!form.tempEnabled}
                    value={form.winterBelow} onChange={(event) => update('winterBelow', event.target.value)} />
                  <span className="unit-txt">°C</span>
                </div>
                <label htmlFor="boiler-entry-summer">Lato powyżej</label>
                <div className="range-inputs">
                  <input id="boiler-entry-summer" type="number" min={-30} max={30} step={0.5} disabled={!form.tempEnabled}
                    value={form.summerAbove} onChange={(event) => update('summerAbove', event.target.value)} />
                  <span className="unit-txt">°C</span>
                </div>
              </div>
              <p className="help">
                Wpis włącza Zimę (kocioł grzeje CO i CWU) w podanych godzinach; poza nimi obowiązuje sezon z „Poza harmonogramem”.
                Z progami: poniżej pierwszego kocioł przechodzi na Zimę, powyżej drugiego wraca na Lato, między nimi nic się nie zmienia.
                {form.mode === 'heat-pump' && ' W trybie Pompa ciepła Zima z harmonogramu włącza cykl Zimy: kocioł przechodzi na Zimę dopiero po nagrzaniu przez pompę ciepła.'}
              </p>
            </>
          )}
          <label className="check">
            <input type="checkbox" checked={form.enabled} onChange={(event) => update('enabled', event.target.checked)} />
            <span>Aktywny</span>
          </label>
          {error && <p className="help danger-text">{error}</p>}
        </Modal>
      )}
    </div>
  );
};
