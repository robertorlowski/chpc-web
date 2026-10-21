// Zakładka Harmonogram kotła (/schedules), układ „Instrument” (#s-boiler-harmonogram): w oknach godzin „Tryb Zima”
// (nr 125; od 2026-10-15 z dwoma progami: Zima poniżej, Lato powyżej temperatury zewnętrznej) i CWU od–do; osobne listy
// i osobne wartości poza harmonogramem dla trybu „Pompa ciepła” i „Pellet” (dni jak w pompie ciepła; okno przez północ
// należy do dnia startu). Karta „Harmonogram”: „Harmonogram działa – pompa ciepła / pelet” (czy działa po „Włącz
// regulator” w Ustawieniach i która lista trybu działa: z odczytu ustawień, nr 99 < 50 °C = pompa ciepła; dawny
// przełącznik „Lista trybu” usunięty 2026-10-20), temperatura zewnętrzna, stan teraz i cykl Zimy. Przy znaczniku „CWU -
// grzanie peletem” w trybie pompy ciepła stan „Teraz” i „działa teraz” CWU dotyczą listy Pellet (state.pelletCwu), jak
// u schedulera. Dla każdego trybu karty „Tryb Zima · tryb” i „CWU · tryb” z wpisami (.entries: dzień, godziny,
// ustawienie, „działa teraz” przy wpisie z GET /schedules/current, odświeżanym co minutę) i wierszem „Poza harmonogramem”
// z ołówkiem. Wpisy i „Poza harmonogramem” edytuje się w oknie modalnym; zapis od razu (PUT schedule-settings zmienia
// tylko edytowany tryb). Serwer co minutę wylicza stan i przy jego zmianie zleca kotłowi jednym zleceniem sezon (nr 125),
// zadaną CWU (nr 119 = do) i histerezę (nr 123 = do − od). „CWU bez zmiany” (2026-10-13): poza wpisami harmonogram nie
// zmienia CWU w kotle; w trybie pompy ciepła ostrzeżenie, gdy zadana w kotle jest wyższa niż temperatura włączonej pompy
// ciepła (cwuTooHigh, heatPumpCwuMax). Bez powiązanej pompy ciepła (definicja kotła) tylko lista „Pellet”.
import { FormEvent, useEffect, useState } from 'react';
import { WeekDay } from '../../../core/types';
import Notification, { useSaveNotice } from '../../../core/components/Notification';
import { InfoTip, TipParagraph } from '../../../core/components/InfoTip';
import { PelletBoilerRequests } from '../api';
import { WinterCycleStatus } from '../components/WinterCycleStatus';
import { IconBtn, Modal, Segmented } from '../components/ui';
import {
  PelletBoilerCurrentSchedule, PelletBoilerMode, PelletBoilerSchedule, PelletBoilerScheduleSettings, PelletBoilerSeason,
  seasonThresholds,
} from '../types';
import { useHeatPumpLinked } from '../utils/useHeatPumpLinked';
import { getLang, locale, t as tr, useLang } from '../../../core/i18n';
import './style.css';

// dni ze słownika (day.*), jak w pompie ciepła
const weekDays = (): readonly (readonly [string, WeekDay])[] => [
  [tr('day.monday'), WeekDay.MONDAY], [tr('day.tuesday'), WeekDay.TUESDAY], [tr('day.wednesday'), WeekDay.WEDNESDAY],
  [tr('day.thursday'), WeekDay.THURSDAY], [tr('day.friday'), WeekDay.FRIDAY], [tr('day.saturday'), WeekDay.SATURDAY], [tr('day.sunday'), WeekDay.SUNDAY],
];
const dayOptions = (): readonly (readonly [string, WeekDay])[] => [
  [tr('day.any'), WeekDay.ANY_DAY],
  [tr('day.workdaysLong'), WeekDay.WORKDAYS],
  [tr('day.daysOffLong'), WeekDay.DAYS_OFF],
  ...weekDays(),
];
// wartość w polu „Dni” oznaczająca konkretną datę
const DATE_OPTION = 'date';
const modeLabel = (mode: PelletBoilerMode) => tr(mode === 'heat-pump' ? 'type.heat_pump' : 'pb.pellet');
const MODES: PelletBoilerMode[] = ['heat-pump', 'pellet'];
const seasonLabel = (season: PelletBoilerSeason) => tr(season === 'winter' ? 'pb.winter' : 'pb.summer');
const seasonOptions = () => [{ value: 'summer' as PelletBoilerSeason, label: tr('pb.summer') }, { value: 'winter' as PelletBoilerSeason, label: tr('pb.winter') }];
// tryb pompy ciepła: CWU najwyżej 45 °C (wyżej pompa ciepła nie dogrzeje); serwer sprawdza to samo
const cwuMax = (mode: PelletBoilerMode) => (mode === 'heat-pump' ? 45 : 80);

const formatDay = (schedule: PelletBoilerSchedule) => {
  if (schedule.date) return new Date(schedule.date).toLocaleDateString(locale(getLang()), { timeZone: 'Europe/Warsaw' });
  if (schedule.dayOfWeek === WeekDay.ANY_DAY) return tr('day.any');
  if (schedule.dayOfWeek === WeekDay.WORKDAYS) return tr('day.workdays');
  if (schedule.dayOfWeek === WeekDay.DAYS_OFF) return tr('day.daysOff');
  return weekDays().find(([, value]) => value === schedule.dayOfWeek)?.[0] ?? '---';
};
// „40–43 °C (zadana 43, histereza 3)”
const cwuText = (from: number, to: number) => `${from}–${to} °C (${tr('tile.setpoint')} ${to}, ${tr('pb.home.hysteresis')} ${to - from})`;
// CWU ustawione teraz w kotle (przy „CWU bez zmiany”): „45–50 °C”, bez histerezy „50 °C”
const boilerCwuText = (cwu?: { cwuFrom?: number; cwuTo?: number }) => (typeof cwu?.cwuTo !== 'number' ? '?'
  : typeof cwu.cwuFrom === 'number' ? `${cwu.cwuFrom}–${cwu.cwuTo} °C` : `${cwu.cwuTo} °C`);

const emptyForm = {
  type: 'cwu' as 'cwu' | 'season', mode: 'heat-pump' as PelletBoilerMode, enabled: true,
  dayOfWeek: String(WeekDay.ANY_DAY), date: '', startTime: '', endTime: '', cwuFrom: '40', cwuTo: '43',
  // „Tryb Zima”: season zostaje tylko dla dawnych wpisów Lato (formularz go nie pokazuje)
  season: 'winter' as PelletBoilerSeason, tempEnabled: true, winterBelow: '5', summerAbove: '7',
};
const typeOptions = () => [{ value: 'cwu' as const, label: tr('tile.cwu') }, { value: 'season' as const, label: tr('pb.sch.winterMode') }];

export const PelletBoilerSchedules: React.FC = () => {
  const { t } = useLang();
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
    if (defaultsForm.cwuFrom.trim() === '' || defaultsForm.cwuTo.trim() === '') return setError(t('pb.sch.cwuRequired'));
    const cwuFrom = Number(defaultsForm.cwuFrom);
    const cwuTo = Number(defaultsForm.cwuTo);
    if (cwuFrom >= cwuTo) return setError(t('pb.sch.cwuOrder'));
    if (cwuTo > cwuMax(mode)) return setError(t('pb.sch.cwuMax', { max: cwuMax(mode) }));
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
      showNotice(t('pb.sch.settingsSaved'));
    } catch {
      setError(t('pb.sch.settingsSaveFailed'));
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
    if (!form.startTime || !form.endTime) return setError(t('pb.sch.hoursRequired'));
    if (useDate && !form.date) return setError(t('pb.sch.dateRequired'));
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
      if (form.tempEnabled && (!valid(winter) || !valid(summer))) return setError(t('pb.sch.tempRange'));
      if (form.tempEnabled && summer <= winter) return setError(t('pb.sch.summerAboveWinter'));
      payload = {
        ...when, type: 'season', season: form.season,
        winterBelow: form.tempEnabled ? winter : null, summerAbove: form.tempEnabled ? summer : null,
      };
    } else {
      if (Number(form.cwuFrom) >= Number(form.cwuTo)) return setError(t('pb.sch.cwuOrder'));
      if (Number(form.cwuTo) > cwuMax(form.mode)) return setError(t('pb.sch.cwuMax', { max: cwuMax(form.mode) }));
      payload = { ...when, type: 'cwu', cwuFrom: Number(form.cwuFrom), cwuTo: Number(form.cwuTo) };
    }
    setSaving(true);
    try {
      if (editingId) await PelletBoilerRequests.updateSchedule(editingId, payload);
      else await PelletBoilerRequests.createSchedule(payload);
      resetForm();
      loadAll();
      showNotice(t('sw.sch.saved'));
    } catch {
      setError(t('sw.sch.saveFailed'));
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
    if (!schedule._id || !window.confirm(t('hp.sch.deleteConfirm'))) return;
    try {
      await PelletBoilerRequests.deleteSchedule(schedule._id);
      loadAll();
    } catch {
      setError(t('hp.sch.entryDeleteFailed'));
    }
  };

  const running = (mode: PelletBoilerMode) => !!current?.enabled && current.mode === mode;
  // lista CWU, która działa teraz: przy „CWU - grzanie peletem” w trybie pompy ciepła lista Pellet
  const cwuFromPellet = !!current?.state?.pelletCwu;
  const runningCwu = (mode: PelletBoilerMode) => !!current?.enabled && (cwuFromPellet ? mode === 'pellet' : current.mode === mode);
  const outdoor = current?.outdoorTemperature;
  const loaded = schedules !== null && settings !== null && heatPumpLinked !== undefined;
  // nagłówek karty trybu: „· pompa ciepła” tylko z powiązaną pompą ciepła
  const modeSuffix = (mode: PelletBoilerMode) => (heatPumpLinked ? ` · ${modeLabel(mode).toLowerCase()}` : '');

  // Wiersz wpisu: dzień pogrubiony, godziny (z „+1 dzień” przez północ), ustawienie, „działa teraz”, ołówek i kosz.
  const row = (schedule: PelletBoilerSchedule, isCurrent: boolean, what: React.ReactNode) => (
    <li key={schedule._id} className={`entry${isCurrent ? ' is-current' : ''}${schedule.enabled ? '' : ' is-off'}`}>
      <span className="entry-when">
        <strong>{formatDay(schedule)}</strong> {schedule.startTime}–{schedule.endTime}
        {schedule.startTime > schedule.endTime && <> <small>({t('hp.sch.plusDay')})</small></>}
      </span>
      <span className="entry-what">{what}{!schedule.enabled && ` · ${t('pb.disabledLower')}`}</span>
      {isCurrent && <span className="entry-tag">{t('hp.sch.activeNow')}</span>}
      <span className="entry-actions">
        <IconBtn name="edit" label={t('hp.sch.editEntry')} onClick={() => edit(schedule)} />
        <IconBtn name="trash" label={t('hp.sch.deleteEntry')} danger onClick={() => remove(schedule)} />
      </span>
    </li>
  );

  return (
    <div className="page page-device boiler-page">
      <Notification message={notice} />
      <section className="card">
        <header className="card-head"><h2>{t('view.schedules')}</h2><span className="card-hint">{t('pb.sch.everyMinute')}</span></header>
        {settings && (
          <div className="form-row">
            <span className="t-name">
              {/* z powiązaną pompą ciepła nazwa działającej listy trybu (z odczytu ustawień kotła, nr 99) */}
              {t(settings.enabled ? 'pb.sch.runs' : 'pb.sch.notRunning')}
              {heatPumpLinked && settings.enabled && ` – ${current?.mode ? modeLabel(current.mode).toLowerCase() : t('pb.sch.modeUnknown')}`}
              {/* opis działania w dymku zamiast akapitu pod stanem (decyzja użytkownika 2026-10-20) */}
              {settings.enabled && current?.state && (
                <InfoTip label={t('pb.sch.howItWorks')}>
                  <TipParagraph>{t(current.state.mode === 'heat-pump' ? 'pb.sch.tipHp' : 'pb.sch.tipPellet')}</TipParagraph>
                  <TipParagraph>{t('pb.sch.tipSeason')}</TipParagraph>
                </InfoTip>
              )}
              {/* bez opisu przy działającym harmonogramie (decyzja użytkownika 2026-10-20); podtytuł tylko gdy nie działa
                  albo brak odczytu ustawień kotła */}
              {(!settings.enabled || (heatPumpLinked && !current?.mode)) && (
                <small>
                  {t(!settings.enabled ? 'pb.sch.runsAfterOn' : 'pb.sch.noSettingsReading')}
                </small>
              )}
            </span>
            <span className={`chip ${settings.enabled ? 'chip-ok' : 'chip-off'}`}>{t(settings.enabled ? 'pb.sch.runsLower' : 'pb.sch.notRunningLower')}</span>
          </div>
        )}
        <dl className="measures measures-stack">
          <div><dt>{t('pb.sch.outdoorTemp')}</dt><dd>{typeof outdoor === 'number' ? `${outdoor.toFixed(1)} °C` : '---'}</dd></div>
          {current?.enabled && current.state && (
            <div>
              <dt>{t('pb.sch.now')}{heatPumpLinked ? ` (${modeLabel(current.state.mode)})` : ''}</dt>
              <dd>
                {current.state.season ? `${seasonLabel(current.state.season)}, ` : ''}
                {current.state.cwuUnchanged ? t('pb.sch.cwuUnchangedIn', { value: boilerCwuText(current.boilerCwu) }) : `${t('tile.cwu')} ${cwuText(current.state.cwuFrom, current.state.cwuTo)}`}
                {cwuFromPellet && ` · ${t('pb.sch.fromPellet')}`}
              </dd>
            </div>
          )}
        </dl>
        <WinterCycleStatus cycle={current?.winterCycle} />
        {current?.lastError && <p className="help danger-text">{t('pb.sch.lastError')}: {current.lastError}</p>}
        {error && !showForm && !defaultsForm && <p className="help danger-text">{error}</p>}
      </section>

      {!loaded && <section className="card"><span className="help">{t('common.loading')}</span></section>}
      {loaded && visibleModes.map((mode) => {
        const seasons = schedules.filter((s) => s.mode === mode && s.type === 'season');
        const cwu = schedules.filter((s) => s.mode === mode && (s.type ?? 'cwu') === 'cwu');
        const now = running(mode);
        // CWU: przy „CWU - grzanie peletem” działa lista Pellet, także gdy tryb kotła to pompa ciepła
        const nowCwu = runningCwu(mode);
        const defaultCurrent = nowCwu && !current?.scheduleId;
        const defaults = settings.defaults[mode];
        // tryb kotła z odczytu ustawień (nr 99), niezależnie od harmonogramu
        const listHint = heatPumpLinked ? t(current?.mode === mode ? 'pb.sch.listActive' : 'pb.sch.listInactive') : '';
        const cwuHint = heatPumpLinked ? `${t(nowCwu ? 'pb.sch.listActive' : 'pb.sch.listInactive')}${cwuFromPellet ? ` · ${t('pb.sch.cwuFromPellet')}` : ''}` : '';
        return (
          <div key={mode} className="stack">
            <section className="card">
              <header className="card-head">
                <h2>{t('pb.sch.winterMode')}{modeSuffix(mode)}</h2>
                <span className="card-head-tools">
                  {listHint && <span className="card-hint">{listHint}</span>}
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => openForm(mode, 'season')}>{t('hp.sch.addEntry')}</button>
                </span>
              </header>
              {seasons.length === 0 && <span className="help">{t('pb.sch.noSeasonEntries')}</span>}
              {seasons.length > 0 && (
                <ul className="entries">
                  {seasons.map((schedule) => {
                    const thresholds = seasonThresholds(schedule);
                    return row(schedule, now && schedule._id === current?.seasonScheduleId, (
                      <>
                        {seasonLabel(schedule.season ?? 'winter')}
                        {thresholds && <> · {t('pb.sch.thresholds', { below: thresholds.winterBelow, above: thresholds.summerAbove })}</>}
                      </>
                    ));
                  })}
                </ul>
              )}
            </section>
            <section className="card">
              <header className="card-head">
                <h2>{t('tile.cwu')}{modeSuffix(mode)}</h2>
                <span className="card-head-tools">
                  {cwuHint && <span className="card-hint">{cwuHint}</span>}
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => openForm(mode, 'cwu')}>{t('hp.sch.addEntry')}</button>
                </span>
              </header>
              <ul className="entries">
                {cwu.map((schedule) => row(schedule, nowCwu && schedule._id === current?.scheduleId, <>{t('tile.cwu')} {cwuText(schedule.cwuFrom ?? 0, schedule.cwuTo ?? 0)}</>))}
                {/* „Poza harmonogramem” jak wpis: ołówek otwiera okno, bez usuwania */}
                <li className={`entry is-default${defaultCurrent ? ' is-current' : ''}`}>
                  <span className="entry-when"><strong>{t('hp.sch.outside')}</strong></span>
                  <span className="entry-what">
                    {defaults.season ? seasonLabel(defaults.season) : t('pb.sch.seasonUnchanged')} · {defaults.cwuUnchanged
                      ? t('pb.sch.cwuUnchangedIn', { value: boilerCwuText(current?.boilerCwu) }) : `${t('tile.cwu')} ${cwuText(defaults.cwuFrom, defaults.cwuTo)}`}
                    {/* tryb pompy ciepła z zadaną CWU, której pompa nie dogrzeje (np. ustawioną na panelu przy „CWU bez zmiany”) */}
                    {mode === 'heat-pump' && current?.cwuTooHigh && (
                      <><br /><span className="danger-text">{t('pb.sch.cwuTooHigh', { cwu: current.boilerCwu?.cwuTo ?? '?', max: current.heatPumpCwuMax ?? '?' })}</span></>
                    )}
                  </span>
                  {defaultCurrent && <span className="entry-tag">{t('hp.sch.activeNow')}</span>}
                  <span className="entry-actions">
                    <IconBtn name="edit" label={`${t('pb.sch.editOutside')}: ${modeLabel(mode)}`} onClick={() => editDefaults(mode)} />
                  </span>
                </li>
              </ul>
            </section>
          </div>
        );
      })}

      {defaultsForm && (
        <Modal title={`${t('hp.sch.outside')}${heatPumpLinked ? ` · ${modeLabel(defaultsForm.mode).toLowerCase()}` : ''}`} onClose={resetForm} onSubmit={saveDefaults}
          footer={<>
            <button type="button" className="btn" onClick={resetForm}>{t('common.cancel')}</button>
            <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? t('common.saving') : t('common.save')}</button>
          </>}>
          <Segmented name="boiler-defaults-season" label={t('pb.sch.seasonOutside')} value={defaultsForm.season ?? null} options={seasonOptions()}
            onChange={(season) => setDefaultsForm({ ...defaultsForm, season })} />
          <p className="help">{defaultsForm.season
            ? t('pb.sch.seasonOutsideSets', { season: seasonLabel(defaultsForm.season) })
            : t('pb.sch.seasonOutsideNone')}</p>
          <label className="check">
            <input type="checkbox" checked={defaultsForm.cwuUnchanged}
              onChange={(event) => setDefaultsForm({ ...defaultsForm, cwuUnchanged: event.target.checked })} />
            <span>{t('pb.sch.cwuUnchanged')}</span>
            <small>{t('pb.sch.cwuUnchangedHint')}</small>
          </label>
          <div className="form-grid">
            <label htmlFor="boiler-defaults-from">{t('pb.sch.cwuFromTo')}</label>
            <div className="range-inputs">
              <input id="boiler-defaults-from" type="number" min={10} max={cwuMax(defaultsForm.mode)} required value={defaultsForm.cwuFrom}
                disabled={defaultsForm.cwuUnchanged} aria-label={t('pb.sch.cwuFromLabel')}
                onChange={(event) => setDefaultsForm({ ...defaultsForm, cwuFrom: event.target.value })} />
              <span className="dash">–</span>
              <input type="number" min={10} max={cwuMax(defaultsForm.mode)} required value={defaultsForm.cwuTo}
                disabled={defaultsForm.cwuUnchanged} aria-label={t('pb.sch.cwuToLabel')}
                onChange={(event) => setDefaultsForm({ ...defaultsForm, cwuTo: event.target.value })} />
              <span className="unit-txt">°C</span>
            </div>
          </div>
          <p className="help">
            {t('pb.sch.defaultsHelp')}{defaultsForm.mode === 'heat-pump' && ` ${t('pb.sch.hpMax45')}`}
            {defaultsForm.mode === 'heat-pump' && current?.pelletCwu?.enabled && ` ${t('pb.sch.pelletCwuNow')}`}
          </p>
          {defaultsForm.cwuUnchanged && defaultsForm.mode === 'heat-pump' && (
            <p className="help danger-text">
              {typeof current?.heatPumpCwuMax === 'number'
                ? t('pb.sch.hpHeatsTo', { max: current.heatPumpCwuMax })
                : t('pb.sch.hpCwuTooHigh')}
              {typeof current?.boilerCwu?.cwuTo === 'number' && ` ${t('pb.sch.nowInBoiler', { value: current.boilerCwu.cwuTo })}`}
            </p>
          )}
          {error && <p className="help danger-text">{error}</p>}
        </Modal>
      )}

      {showForm && (
        <Modal title={editingId ? t('hp.sch.editTitle') : t('pb.sch.newTitle')} onClose={resetForm} onSubmit={submit}
          footer={<>
            <button type="button" className="btn" onClick={resetForm}>{t('common.cancel')}</button>
            <button type="submit" className="btn btn-primary" disabled={saving || busy}>{saving ? t('common.saving') : t('hp.sch.saveEntry')}</button>
          </>}>
          <Segmented name="boiler-entry-type" label={t('hp.sch.kind')} value={form.type} options={typeOptions()} onChange={(type) => update('type', type)} />
          {heatPumpLinked && (
            <label className="field">
              <span>{t('pb.sch.modeList')}</span>
              <select value={form.mode} onChange={(event) => update('mode', event.target.value)}>
                {MODES.map((mode) => <option key={mode} value={mode}>{modeLabel(mode)}</option>)}
              </select>
            </label>
          )}
          <label className="field">
            <span>{t('hp.sch.days')}</span>
            <select value={form.dayOfWeek} onChange={(event) => update('dayOfWeek', event.target.value)}>
              {dayOptions().map(([name, value]) => <option key={value} value={value}>{name}</option>)}
              <option value={DATE_OPTION}>{t('hp.sch.specificDate')}</option>
            </select>
          </label>
          {useDate && (
            <label className="field">
              <span>{t('hp.sch.date')}</span>
              <input type="date" required value={form.date} onChange={(event) => update('date', event.target.value)} />
            </label>
          )}
          <div className="form-grid">
            <label htmlFor="boiler-entry-from">{t('hp.sch.hours')}</label>
            <div className="range-inputs">
              <input id="boiler-entry-from" type="time" required value={form.startTime} onChange={(event) => update('startTime', event.target.value)} />
              <span className="dash">–</span>
              <input type="time" required value={form.endTime} aria-label={t('hp.sch.hourTo')} onChange={(event) => update('endTime', event.target.value)} />
            </div>
            {form.type === 'cwu' && (
              <>
                <label htmlFor="boiler-entry-cwu">{t('pb.sch.cwuFromTo')}</label>
                <div className="range-inputs">
                  <input id="boiler-entry-cwu" type="number" min={10} max={cwuMax(form.mode)} required value={form.cwuFrom} onChange={(event) => update('cwuFrom', event.target.value)} />
                  <span className="dash">–</span>
                  <input type="number" min={10} max={cwuMax(form.mode)} required value={form.cwuTo} aria-label={t('pb.sch.cwuToLabel')} onChange={(event) => update('cwuTo', event.target.value)} />
                  <span className="unit-txt">°C</span>
                </div>
              </>
            )}
          </div>
          {form.startTime && form.endTime && form.startTime > form.endTime && (
            <p className="help">{t('sw.sch.overnightUntil', { time: form.endTime })}</p>
          )}
          {form.type === 'cwu' ? (
            <p className="help">
              {t('pb.sch.cwuEntryHelp')}
              {form.mode === 'heat-pump' && ` ${t('pb.sch.hpMax45')}`}
              {form.mode === 'heat-pump' && current?.pelletCwu?.enabled && ` ${t('pb.sch.pelletCwuNow')}`}
            </p>
          ) : (
            <>
              <label className="check">
                <input type="checkbox" checked={form.tempEnabled} onChange={(event) => update('tempEnabled', event.target.checked)} />
                <span>{t('pb.sch.byOutdoor')}</span>
                <small>{t('pb.sch.byOutdoorHint')}</small>
              </label>
              <div className="form-grid">
                <label htmlFor="boiler-entry-winter">{t('pb.sch.winterBelow')}</label>
                <div className="range-inputs">
                  <input id="boiler-entry-winter" type="number" min={-30} max={30} step={0.5} disabled={!form.tempEnabled}
                    value={form.winterBelow} onChange={(event) => update('winterBelow', event.target.value)} />
                  <span className="unit-txt">°C</span>
                </div>
                <label htmlFor="boiler-entry-summer">{t('pb.sch.summerAbove')}</label>
                <div className="range-inputs">
                  <input id="boiler-entry-summer" type="number" min={-30} max={30} step={0.5} disabled={!form.tempEnabled}
                    value={form.summerAbove} onChange={(event) => update('summerAbove', event.target.value)} />
                  <span className="unit-txt">°C</span>
                </div>
              </div>
              <p className="help">
                {t('pb.sch.seasonEntryHelp')}
                {form.mode === 'heat-pump' && ` ${t('pb.sch.seasonEntryHelpHp')}`}
              </p>
            </>
          )}
          <label className="check">
            <input type="checkbox" checked={form.enabled} onChange={(event) => update('enabled', event.target.checked)} />
            <span>{t('pb.sch.active')}</span>
          </label>
          {error && <p className="help danger-text">{error}</p>}
        </Modal>
      )}
    </div>
  );
};
