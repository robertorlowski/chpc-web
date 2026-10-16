// Zakładka Harmonogram kotła (/schedules): w oknach godzin „Tryb Zima” (nr 125, od 2026-10-04; od 2026-10-15 bez
// wyboru Lato / Zima, z dwoma progami: Zima poniżej, Lato powyżej temperatury zewnętrznej) i CWU od–do; osobne listy i osobne
// wartości poza harmonogramem dla trybu „Pompa ciepła” i „Pellet” (dni jak w pompie ciepła; okno przez
// północ należy do dnia startu). W grupie trybu kolejno: wpisy trybu pracy, wpisy CWU, „Poza harmonogramem”.
// Działa lista trybu, w którym kocioł jest teraz (z odczytu ustawień). Serwer co minutę wylicza stan i przy
// jego zmianie zleca kotłowi jednym zleceniem sezon (nr 125), zadaną CWU (nr 119 = do) i histerezę
// (nr 123 = do − od). Harmonogram działa po „Włącz regulator” w Ustawieniach; włączania i wyłączania
// kotła w harmonogramie nie ma (usunięte 2026-10-04). Czerwona kreska: wpis albo ustawienie domyślne, które
// działa teraz (GET /schedules/current, odświeżane co minutę; tam też temperatura zewnętrzna z czujnika kotła).
// Wiersz wpisu w dwóch liniach: dzień pogrubiony, pod nim godziny i ustawienie. Wygląd z harmonogramów pompy.
// „Poza harmonogramem” ma taki sam wiersz z ołówkiem; edycja w tym samym panelu co wpis, zapis od razu
// (PUT schedule-settings, zmienia się tylko edytowany tryb). „CWU bez zmiany” (2026-10-13): poza wpisami harmonogram nie
// zmienia CWU w kotle; w trybie pompy ciepła czerwona informacja, gdy zadana w kotle jest wyższa niż temperatura włączonej
// pompy ciepła (cwuTooHigh, heatPumpCwuMax).
import '../../heat-pump/pages/Schedules/style.css';
import './style.css';
import { FormEvent, useEffect, useState } from 'react';
import { WeekDay } from '../../../core/types';
import { InfoTip, TipParagraph } from '../../../core/components/InfoTip';
import Notification, { useSaveNotice } from '../../../core/components/Notification';
import { IconButton } from '../../../core/components/IconButton';
import { EditIcon, PlusIcon, TrashIcon } from '../../../core/components/icons';
import { PelletBoilerRequests } from '../api';
import { WinterCycleStatus } from '../components/WinterCycleStatus';
import {
  PelletBoilerCurrentSchedule, PelletBoilerMode, PelletBoilerSchedule, PelletBoilerScheduleSettings, PelletBoilerSeason,
  seasonThresholds,
} from '../types';
import { useHeatPumpLinked } from '../utils/useHeatPumpLinked';

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
// CWU ustawione teraz w kotle (przy „CWU bez zmiany”): „45–50 °C”, bez histerezy „50 °C”
const boilerCwuText = (cwu?: { cwuFrom?: number; cwuTo?: number }) => (typeof cwu?.cwuTo !== 'number' ? '?'
  : typeof cwu.cwuFrom === 'number' ? `${cwu.cwuFrom}–${cwu.cwuTo} °C` : `${cwu.cwuTo} °C`);

const emptyForm = {
  type: 'cwu' as 'cwu' | 'season', mode: 'heat-pump' as PelletBoilerMode, enabled: true,
  dayOfWeek: String(WeekDay.ANY_DAY), date: '', startTime: '', endTime: '', cwuFrom: '40', cwuTo: '43',
  // „Tryb Zima”: season zostaje tylko dla dawnych wpisów Lato (formularz go nie pokazuje)
  season: 'winter' as PelletBoilerSeason, tempEnabled: true, winterBelow: '5', summerAbove: '7',
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
  // Bez powiązanej pompy ciepła (definicja kotła) kocioł pracuje tylko na pellecie: jedna lista wpisów (Pellet),
  // bez sekcji „Pompa ciepła”, nagłówka trybu i wyboru trybu we wpisie.
  const heatPumpLinked = useHeatPumpLinked();
  const visibleModes = heatPumpLinked ? MODES : MODES.filter((mode) => mode === 'pellet');
  const [form, setForm] = useState(emptyForm);
  const [useDate, setUseDate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // edycja „Poza harmonogramem” jednego trybu (null = zamknięta); pola CWU jako tekst, żeby dało się je wyczyścić
  const [defaultsForm, setDefaultsForm] = useState<{
    mode: PelletBoilerMode; season?: PelletBoilerSeason; cwuFrom: string; cwuTo: string; cwuUnchanged: boolean;
  } | null>(null);
  const formOpen = showForm || defaultsForm !== null;
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
    setUseDate(false);
    setEditingId(null);
    setShowForm(false);
    setDefaultsForm(null);
  };
  const update = (field: keyof typeof form, value: string | boolean) => setForm((old) => ({ ...old, [field]: value }));
  const openForm = (mode: PelletBoilerMode, type: 'cwu' | 'season') => {
    setForm({ ...emptyForm, mode, type, ...(type === 'season' ? { startTime: '22:00', endTime: '06:00' } : {}) });
    setUseDate(false);
    setEditingId(null);
    setShowForm(true);
    setDefaultsForm(null);
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
      dayOfWeek: String(schedule.dayOfWeek ?? WeekDay.ANY_DAY), date: schedule.date ? schedule.date.slice(0, 10) : '',
      startTime: schedule.startTime, endTime: schedule.endTime,
      cwuFrom: String(schedule.cwuFrom ?? emptyForm.cwuFrom), cwuTo: String(schedule.cwuTo ?? emptyForm.cwuTo),
      season: schedule.season ?? emptyForm.season,
      tempEnabled: !!thresholds,
      winterBelow: thresholds ? String(thresholds.winterBelow) : emptyForm.winterBelow,
      summerAbove: thresholds ? String(thresholds.summerAbove) : emptyForm.summerAbove,
    });
    setUseDate(Boolean(schedule.date));
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

  return (
    <div className="schedules-page boiler-schedules">
      <Notification message={notice} />
      <h2>Harmonogram</h2>
      <div className={`schedules-layout${formOpen ? '' : ' schedules-layout-list-only'}`}>
        {defaultsForm && (
          <form className="schedule-card" onSubmit={saveDefaults}>
            <h3>Poza harmonogramem{heatPumpLinked ? ` · ${MODE_LABEL[defaultsForm.mode]}` : ''}</h3>
            <div>
              Tryb pracy
              <InfoTip>{defaultsForm.season
                ? `Poza wpisami harmonogram ustawia ${SEASON_LABEL[defaultsForm.season]}. Bez wyboru nie zmieniałby trybu pracy.`
                : 'Bez wyboru harmonogram nie zmienia trybu pracy poza wpisami.'}</InfoTip>
            </div>
            <SeasonChoice value={defaultsForm.season} onChange={(season) => setDefaultsForm({ ...defaultsForm, season })} />
            <label className="schedule-toggle">
              <input type="checkbox" checked={defaultsForm.cwuUnchanged}
                onChange={(event) => setDefaultsForm({ ...defaultsForm, cwuUnchanged: event.target.checked })} />
              CWU bez zmiany (temperatura z panelu kotła)
            </label>
            <div className="schedule-fields">
              <label>CWU od [°C]<input type="number" min={10} max={cwuMax(defaultsForm.mode)} required value={defaultsForm.cwuFrom}
                disabled={defaultsForm.cwuUnchanged}
                onChange={(event) => setDefaultsForm({ ...defaultsForm, cwuFrom: event.target.value })} /></label>
              <label>
                <span>
                  CWU do [°C]
                  <InfoTip>
                    <TipParagraph>„Do” = zadana CWU, „od” = start ładowania (histereza = do − od).{defaultsForm.mode === 'heat-pump' && ' Pompa ciepła: najwyżej 45 °C.'}</TipParagraph>
                    {defaultsForm.mode === 'heat-pump' && current?.pelletCwu?.enabled && (
                      <TipParagraph>Teraz włączone jest „CWU - grzanie peletem”: w trybie Pompa ciepła obowiązują CWU od–do z trybu Pellet.</TipParagraph>
                    )}
                  </InfoTip>
                </span>
                <input type="number" min={10} max={cwuMax(defaultsForm.mode)} required value={defaultsForm.cwuTo}
                  disabled={defaultsForm.cwuUnchanged}
                  onChange={(event) => setDefaultsForm({ ...defaultsForm, cwuTo: event.target.value })} /></label>
            </div>
            {defaultsForm.cwuUnchanged && defaultsForm.mode === 'heat-pump' && (
              <div className="boiler-error">
                {typeof current?.heatPumpCwuMax === 'number'
                  ? `Pompa ciepła grzeje do ${current.heatPumpCwuMax} °C – wyższa zadana CWU w kotle jest za wysoka.`
                  : 'Zadana CWU w kotle wyższa niż temperatura pompy ciepła jest za wysoka – pompa jej nie dogrzeje.'}
                {typeof current?.boilerCwu?.cwuTo === 'number' && ` Teraz w kotle: ${current.boilerCwu.cwuTo} °C.`}
              </div>
            )}
            <div className="schedule-form-actions">
              <button type="button" className="schedule-cancel" onClick={resetForm}>Anuluj</button>
              <button type="submit" disabled={busy}>{busy ? 'Zapisywanie...' : 'Zapisz zmiany'}</button>
            </div>
            {error && <p className="schedule-error">{error}</p>}
          </form>
        )}
        {showForm && (
          <form className="schedule-card" onSubmit={submit}>
            <h3>{editingId ? 'Edycja wpisu' : 'Nowy wpis'}</h3>
            <label>
              Rodzaj
              <select value={form.type} onChange={(event) => update('type', event.target.value)}>
                <option value="season">Tryb Zima</option>
                <option value="cwu">CWU</option>
              </select>
            </label>
            {heatPumpLinked && (
              <label>
                Dla trybu kotła
                <select value={form.mode} onChange={(event) => update('mode', event.target.value)}>
                  {MODES.map((mode) => <option key={mode} value={mode}>{MODE_LABEL[mode]}</option>)}
                </select>
              </label>
            )}
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
                <div>
                  Według temperatury zewnętrznej
                  <InfoTip>
                    <TipParagraph>Wpis włącza Zimę (kocioł grzeje CO i CWU) w podanych godzinach. Poza nimi obowiązuje tryb „Poza harmonogramem”.</TipParagraph>
                    <TipParagraph>Z temperaturami (czujnik kotła): poniżej pierwszej kocioł przechodzi na Zimę, powyżej drugiej wraca na Lato. Między nimi nic się nie zmienia. Bez temperatur Zima trwa przez całe okno.</TipParagraph>
                    {form.mode === 'heat-pump' && <TipParagraph>W trybie Pompa ciepła Zima z harmonogramu włącza cykl Zimy: kocioł przechodzi na Zimę dopiero po nagrzaniu przez pompę ciepła.</TipParagraph>}
                    <TipParagraph>Lato/Zima wybrane przyciskiem w Ustawieniach działa do najbliższego początku albo końca wpisu sezonu, także gdy wpis z progiem nie działa.</TipParagraph>
                  </InfoTip>
                </div>
                <label className="schedule-toggle">
                  <input type="checkbox" checked={form.tempEnabled} onChange={(event) => update('tempEnabled', event.target.checked)} />
                  <span>Według temperatury zewnętrznej (czujnik kotła)</span>
                </label>
                <label className="schedule-toggle">
                  <span>
                    Uruchom tryb Zima, gdy temperatura spadnie poniżej{' '}
                    <input type="number" className="boiler-cold-input" min={-30} max={30} step={0.5} aria-label="Zima poniżej [°C]"
                      disabled={!form.tempEnabled} value={form.winterBelow} onChange={(event) => update('winterBelow', event.target.value)} /> °C
                  </span>
                </label>
                <label className="schedule-toggle">
                  <span>
                    Uruchom tryb Lato, gdy temperatura wzrośnie powyżej{' '}
                    <input type="number" className="boiler-cold-input" min={-30} max={30} step={0.5} aria-label="Lato powyżej [°C]"
                      disabled={!form.tempEnabled} value={form.summerAbove} onChange={(event) => update('summerAbove', event.target.value)} /> °C
                  </span>
                </label>
              </>
            ) : (
              <>
                <div className="schedule-fields">
                  <label>CWU od [°C]<input type="number" min={10} max={cwuMax(form.mode)} required value={form.cwuFrom} onChange={(event) => update('cwuFrom', event.target.value)} /></label>
                  <label>
                    <span>
                      CWU do [°C]
                      <InfoTip>
                        <TipParagraph>„Do” = zadana CWU, „od” = start ładowania (histereza = do − od).{form.mode === 'heat-pump' && ' Pompa ciepła: najwyżej 45 °C.'}</TipParagraph>
                        {form.mode === 'heat-pump' && current?.pelletCwu?.enabled && (
                          <TipParagraph>Teraz włączone jest „CWU - grzanie peletem”: w trybie Pompa ciepła obowiązują CWU od–do z trybu Pellet.</TipParagraph>
                        )}
                      </InfoTip>
                    </span>
                    <input type="number" min={10} max={cwuMax(form.mode)} required value={form.cwuTo} onChange={(event) => update('cwuTo', event.target.value)} /></label>
                </div>
              </>
            )}
            <label className="schedule-toggle">
              <input type="checkbox" checked={form.enabled} onChange={(event) => update('enabled', event.target.checked)} />
              Aktywny
            </label>
            <div className="schedule-form-actions">
              <button type="button" className="schedule-cancel" onClick={resetForm}>{editingId ? 'Anuluj' : 'Zamknij'}</button>
              <button type="submit" disabled={saving || busy}>{saving ? 'Zapisywanie...' : editingId ? 'Zapisz zmiany' : 'Zapisz'}</button>
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
          {schedules === null || settings === null || heatPumpLinked === undefined ? <p>Ładowanie...</p> : (
            <div className="schedule-groups">
              {visibleModes.map((mode) => {
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
                const defaults = settings.defaults[mode];
                return (
                  <section key={mode} className="schedule-group">
                    {/* tryb kotła z odczytu ustawień (nr 99), niezależnie od harmonogramu: WŁĄCZONA niebieski, drugi WYŁĄCZONY czerwony */}
                    {heatPumpLinked && (
                      <h4>{MODE_LABEL[mode]} · <span className={current?.mode === mode ? 'boiler-state-on' : 'boiler-state-off'}>
                        {mode === 'heat-pump' ? (current?.mode === mode ? 'WŁĄCZONA' : 'WYŁĄCZONA') : (current?.mode === mode ? 'WŁĄCZONY' : 'WYŁĄCZONY')}
                      </span></h4>
                    )}

                    <div className="schedule-list-header">
                      <span className="boiler-schedule-kind">Tryb Zima</span>
                      {!formOpen && <IconButton label={`Dodaj tryb Zima: ${MODE_LABEL[mode]}`} icon={<PlusIcon />} onClick={() => openForm(mode, 'season')} />}
                    </div>
                    <div className="schedule-list">
                      {seasons.length === 0 && <div className="boiler-hint">brak wpisów</div>}
                      {seasons.map((schedule) => row(schedule, now && schedule._id === current?.seasonScheduleId,
                        <>{SEASON_LABEL[schedule.season ?? 'winter']}</>,
                        (() => {
                          const thresholds = seasonThresholds(schedule);
                          return thresholds ? <>poniżej {thresholds.winterBelow} °C, Lato powyżej {thresholds.summerAbove} °C</> : undefined;
                        })()))}
                    </div>

                    <div className="schedule-list-header">
                      <span className="boiler-schedule-kind">CWU</span>
                      {!formOpen && <IconButton label={`Dodaj CWU: ${MODE_LABEL[mode]}`} icon={<PlusIcon />} onClick={() => openForm(mode, 'cwu')} />}
                    </div>
                    <div className="schedule-list">
                      {cwu.length === 0 && <div className="boiler-hint">brak wpisów</div>}
                      {cwu.map((schedule) => row(schedule, now && schedule._id === current?.scheduleId,
                        <>CWU {cwuText(schedule.cwuFrom ?? 0, schedule.cwuTo ?? 0)}</>))}
                    </div>

                    {/* „Poza harmonogramem” jak wpis: dwie linie i ołówek (edycja w panelu), bez usuwania */}
                    <article className={`schedule-row schedule-row-default${defaultCurrent ? ' schedule-row-current' : ''}`}>
                      <div className="schedule-row-main"><span><b>Poza harmonogramem</b></span></div>
                      <div className="boiler-schedule-line">
                        {defaults.season ? SEASON_LABEL[defaults.season] : 'Tryb pracy bez zmiany'} · {defaults.cwuUnchanged
                          ? `CWU bez zmiany (w kotle: ${boilerCwuText(current?.boilerCwu)})` : `CWU ${cwuText(defaults.cwuFrom, defaults.cwuTo)}`}
                      </div>
                      {/* tryb pompy ciepła z zadaną CWU, której pompa nie dogrzeje (np. ustawioną na panelu przy „CWU bez zmiany”) */}
                      {mode === 'heat-pump' && current?.cwuTooHigh && (
                        <div className="boiler-error">
                          Zadana CWU {current.boilerCwu?.cwuTo} °C jest wyższa niż temperatura pompy ciepła ({current.heatPumpCwuMax} °C) – pompa jej nie dogrzeje.
                        </div>
                      )}
                      <IconButton className="schedule-delete" label={`Edytuj „Poza harmonogramem”: ${MODE_LABEL[mode]}`} icon={<EditIcon />}
                        onClick={() => editDefaults(mode)} />
                    </article>
                  </section>
                );
              })}
              {current?.enabled && current.state && (
                <div className="boiler-hint">
                  Teraz{heatPumpLinked ? ` (${MODE_LABEL[current.state.mode]})` : ''}: {current.state.season ? `${SEASON_LABEL[current.state.season]}, ` : ''}
                  {current.state.cwuUnchanged ? `CWU bez zmiany (w kotle: ${boilerCwuText(current.boilerCwu)})` : `CWU ${cwuText(current.state.cwuFrom, current.state.cwuTo)}`}.
                  <InfoTip>
                    <TipParagraph>Zmiany sezonu i CWU idą do kotła jednym zleceniem przy przejściu między wpisami.</TipParagraph>
                    <TipParagraph>{current.state.mode === 'heat-pump'
                      ? 'W trybie Pompa ciepła CWU zmienione na panelu wraca do harmonogramu w ciągu minuty (pompa ciepła nie dogrzeje wyższej temperatury); przy „CWU bez zmiany” poza wpisami zostaje.'
                      : 'Ręczna zmiana CWU zostaje do następnego przejścia między wpisami.'}</TipParagraph>
                    <TipParagraph>Sezon wybrany przyciskiem w Ustawieniach działa do najbliższego początku albo końca wpisu sezonu.</TipParagraph>
                  </InfoTip>
                </div>
              )}
              {current?.lastError && <div className="boiler-error">Ostatni błąd: {current.lastError}</div>}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
