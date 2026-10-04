// Zakładka Harmonogram kotła (/schedules): praca kotła (włączony/wyłączony) i CWU od–do w oknach godzin,
// osobne listy i osobne wartości poza harmonogramem dla trybu „Pompa ciepła” i „Pellet” (dni jak w pompie ciepła; okno przez północ
// należy do dnia startu). Działa lista trybu, w którym kocioł jest teraz (z odczytu ustawień). Serwer
// co minutę wylicza stan i przy jego zmianie zleca kotłowi włącz/wyłącz, zadaną CWU (nr 119 = do)
// i histerezę (nr 123 = do − od). Harmonogram działa przy „Kocioł: Włączony” w Ustawieniach. Czerwona kreska: wpis albo ustawienie domyślne, które działa teraz
// (GET /schedules/current, odświeżane co minutę). Wygląd z harmonogramów pompy (te same klasy CSS).
import '../../heat-pump/pages/Schedules/style.css';
import './style.css';
import { FormEvent, useEffect, useState } from 'react';
import { WeekDay } from '../../../core/types';
import Notification from '../../../core/components/Notification';
import { IconButton } from '../../../core/components/IconButton';
import { EditIcon, PlusIcon, TrashIcon } from '../../../core/components/icons';
import { PelletBoilerRequests } from '../api';
import {
  PelletBoilerCurrentSchedule, PelletBoilerMode, PelletBoilerSchedule, PelletBoilerScheduleSettings,
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
  type: 'cwu' as 'cwu' | 'work', on: false,
  mode: 'heat-pump' as PelletBoilerMode, enabled: true,
  dayOfWeek: String(WeekDay.ANY_DAY), date: '', startTime: '', endTime: '', cwuFrom: '40', cwuTo: '43',
};

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
  const [notice, setNotice] = useState('');

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

  const showNotice = (text: string) => {
    setNotice(text);
    window.setTimeout(() => setNotice(''), 3000);
  };

  const setDefault = (mode: PelletBoilerMode, field: 'cwuFrom' | 'cwuTo' | 'work', value: string) => settings && setSettings({
    ...settings,
    defaults: { ...settings.defaults, [mode]: { ...settings.defaults[mode], [field]: field === 'work' ? value : Number(value) } },
  });

  const saveSettings = async (event: FormEvent) => {
    event.preventDefault();
    if (!settings) return;
    if (MODES.some((mode) => settings.defaults[mode].cwuFrom >= settings.defaults[mode].cwuTo)) {
      return setSettingsError('CWU: „od” musi być mniejsze niż „do”.');
    }
    try {
      setSettings(await PelletBoilerRequests.saveScheduleSettings(settings));
      setSettingsError('');
      loadCurrent();
      showNotice('Ustawienia harmonogramu zapisane.');
    } catch {
      setSettingsError('Nie udało się zapisać (CWU od–do: 10–80 °C, liczby całkowite).');
    }
  };

  const resetForm = () => {
    setForm(emptyForm);
    setUseDate(false);
    setEditingId(null);
    setShowForm(false);
  };
  const update = (field: keyof typeof form, value: string | boolean) => setForm((old) => ({ ...old, [field]: value }));
  const openForm = (mode: PelletBoilerMode, type: 'cwu' | 'work') => {
    setForm({ ...emptyForm, mode, type });
    setUseDate(false);
    setEditingId(null);
    setShowForm(true);
    setError('');
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    const payload: PelletBoilerSchedule = {
      type: form.type, mode: form.mode, enabled: form.enabled,
      ...(useDate ? { date: form.date } : { dayOfWeek: Number(form.dayOfWeek) as WeekDay }),
      startTime: form.startTime, endTime: form.endTime,
      ...(form.type === 'work' ? { on: form.on } : { cwuFrom: Number(form.cwuFrom), cwuTo: Number(form.cwuTo) }),
    };
    if (form.type === 'cwu' && Number(form.cwuFrom) >= Number(form.cwuTo)) return setError('CWU: „od” musi być mniejsze niż „do”.');
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
    setForm({
      type: schedule.type ?? 'cwu', on: !!schedule.on,
      mode: schedule.mode, enabled: schedule.enabled,
      dayOfWeek: String(schedule.dayOfWeek ?? WeekDay.ANY_DAY), date: schedule.date ? schedule.date.slice(0, 10) : '',
      startTime: schedule.startTime, endTime: schedule.endTime,
      cwuFrom: String(schedule.cwuFrom ?? emptyForm.cwuFrom), cwuTo: String(schedule.cwuTo ?? emptyForm.cwuTo),
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

  return (
    <div className="schedules-page boiler-schedules">
      <Notification message={notice} />
      <h2>Harmonogram</h2>
      <div className={`schedules-layout${showForm ? '' : ' schedules-layout-list-only'}`}>
        {showForm && (
          <form className="schedule-card" onSubmit={submit}>
            <h3>{editingId ? 'Edycja wpisu' : 'Nowy wpis'}</h3>
            <label>
              Tryb pracy
              <select value={form.mode} onChange={(event) => update('mode', event.target.value)}>
                {MODES.map((mode) => <option key={mode} value={mode}>{MODE_LABEL[mode]}</option>)}
              </select>
            </label>
            <label>
              Rodzaj
              <select value={form.type} disabled={!!editingId} onChange={(event) => update('type', event.target.value)}>
                <option value="work">Kocioł włączony / wyłączony</option>
                <option value="cwu">CWU od–do</option>
              </select>
            </label>
            {form.type === 'work' && (
              <div className="boiler-work-choice">
                <span>Stan w oknie:</span>
                <label><input type="radio" checked={form.on} onChange={() => update('on', true)} /> włączony</label>
                <label><input type="radio" checked={!form.on} onChange={() => update('on', false)} /> wyłączony</label>
              </div>
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
            {form.type === 'cwu' && (
              <>
                <div className="schedule-fields">
                  <label>CWU od [°C]<input type="number" min={10} max={80} required value={form.cwuFrom} onChange={(event) => update('cwuFrom', event.target.value)} /></label>
                  <label>CWU do [°C]<input type="number" min={10} max={80} required value={form.cwuTo} onChange={(event) => update('cwuTo', event.target.value)} /></label>
                </div>
                <div className="boiler-hint">„Do” = zadana CWU, „od” = start ładowania (histereza = do − od).</div>
              </>
            )}
            <label className="schedule-toggle">
              <input type="checkbox" checked={form.enabled} onChange={(event) => update('enabled', event.target.checked)} />
              Aktywny
            </label>
            <div className="schedule-form-actions">
              <button type="submit" disabled={saving}>{saving ? 'Zapisywanie...' : editingId ? 'Zapisz zmiany' : 'Zapisz'}</button>
              <button type="button" className="schedule-cancel" onClick={resetForm}>{editingId ? 'Anuluj' : 'Zamknij'}</button>
            </div>
            {error && <p className="schedule-error">{error}</p>}
          </form>
        )}

        <section className="schedule-card">
          <div className="schedule-list-header">
            <h3 className="settings-section-title">Kocioł i CWU</h3>
          </div>
          {settings && (
            <div className="boiler-hint">
              Harmonogram: <span className={settings.enabled ? 'boiler-state-on' : 'boiler-state-off'}>
                {settings.enabled ? 'DZIAŁA' : 'NIE DZIAŁA'}
              </span>{settings.enabled ? '' : ' — działa po „Włącz regulator” w Ustawieniach'}
            </div>
          )}
          {current && !current.mode && <div className="boiler-hint">Brak odczytu ustawień kotła — nie wiadomo, który tryb działa.</div>}
          {schedules === null || settings === null ? <p>Ładowanie...</p> : (
            <form className="schedule-groups" onSubmit={saveSettings}>
              {MODES.map((mode) => {
                const work = schedules.filter((s) => s.mode === mode && s.type === 'work');
                const cwu = schedules.filter((s) => s.mode === mode && (s.type ?? 'cwu') === 'cwu');
                const now = running(mode);
                const row = (schedule: PelletBoilerSchedule, current: boolean, what: React.ReactNode) => (
                  <article key={schedule._id} className={`schedule-row${current ? ' schedule-row-current' : ''}`}>
                    <div className="schedule-row-main">
                      <input type="checkbox" checked={schedule.enabled} readOnly aria-label="Aktywny" />
                      <span><b>{formatDay(schedule)}</b></span>
                      <span>
                        {schedule.startTime} – {schedule.endTime}{schedule.startTime > schedule.endTime ? ' (+1 dzień)' : ''} · {what}
                      </span>
                    </div>
                    <div className="schedule-row-details">
                      {!schedule.enabled && <span>wyłączony</span>}
                      <IconButton className="schedule-edit" label="Edytuj wpis" icon={<EditIcon />} onClick={() => edit(schedule)} />
                      <IconButton className="schedule-delete" variant="danger" label="Usuń wpis" icon={<TrashIcon />} onClick={() => remove(schedule)} />
                    </div>
                  </article>
                );
                return (
                  <section key={mode} className="schedule-group">
                    {/* tryb kotła z odczytu ustawień (nr 99), niezależnie od harmonogramu: WŁĄCZONA niebieski, drugi WYŁĄCZONY czerwony */}
                    <h4>{MODE_LABEL[mode]} · <span className={current?.mode === mode ? 'boiler-state-on' : 'boiler-state-off'}>
                      {mode === 'heat-pump' ? (current?.mode === mode ? 'WŁĄCZONA' : 'WYŁĄCZONA') : (current?.mode === mode ? 'WŁĄCZONY' : 'WYŁĄCZONY')}
                    </span></h4>

                    <div className="schedule-list-header">
                      <span className="boiler-schedule-kind">Kocioł włączony / wyłączony</span>
                      {!showForm && <IconButton label={`Dodaj włączenie lub wyłączenie kotła: ${MODE_LABEL[mode]}`} icon={<PlusIcon />} onClick={() => openForm(mode, 'work')} />}
                    </div>
                    <div className="schedule-list">
                      {work.map((schedule) => row(schedule, now && schedule._id === current?.workScheduleId,
                        <span className={schedule.on ? 'boiler-on' : 'boiler-off'}>{schedule.on ? 'włączony' : 'wyłączony'}</span>))}
                      <div className={`boiler-default-row${now && !current?.workScheduleId ? ' boiler-default-current' : ''}`}>
                        <span><b>Poza harmonogramem</b></span>
                        <span className="boiler-work-choice">
                          <label><input type="radio" checked={settings.defaults[mode].work === 'on'} onChange={() => setDefault(mode, 'work', 'on')} /> włączony</label>
                          <label><input type="radio" checked={settings.defaults[mode].work === 'off'} onChange={() => setDefault(mode, 'work', 'off')} /> wyłączony</label>
                        </span>
                      </div>
                    </div>

                    <div className="schedule-list-header">
                      <span className="boiler-schedule-kind">CWU</span>
                      {!showForm && <IconButton label={`Dodaj CWU: ${MODE_LABEL[mode]}`} icon={<PlusIcon />} onClick={() => openForm(mode, 'cwu')} />}
                    </div>
                    <div className="schedule-list">
                      {cwu.map((schedule) => row(schedule, now && schedule._id === current?.scheduleId,
                        <>CWU {cwuText(schedule.cwuFrom ?? 0, schedule.cwuTo ?? 0)}</>))}
                      <div className={`boiler-default-row${now && !current?.scheduleId ? ' boiler-default-current' : ''}`}>
                        <span><b>Poza harmonogramem</b></span>
                        <span className="schedule-fields">
                          <label>CWU od [°C]<input type="number" min={10} max={80} value={settings.defaults[mode].cwuFrom}
                            onChange={(event) => setDefault(mode, 'cwuFrom', event.target.value)} /></label>
                          <label>CWU do [°C]<input type="number" min={10} max={80} value={settings.defaults[mode].cwuTo}
                            onChange={(event) => setDefault(mode, 'cwuTo', event.target.value)} /></label>
                        </span>
                      </div>
                    </div>
                  </section>
                );
              })}
              {current?.enabled && current.state && (
                <div className="boiler-hint">
                  Teraz ({MODE_LABEL[current.state.mode]}): kocioł {current.state.work === 'on' ? 'włączony' : 'wyłączony'},
                  {' '}CWU {cwuText(current.state.cwuFrom, current.state.cwuTo)}.
                  {' '}Zmiana zlecana kotłowi przy przejściu między wpisami; ręczna zmiana zostaje do następnego przejścia.
                </div>
              )}
              {current?.lastError && <div className="boiler-error">Ostatni błąd: {current.lastError}</div>}
              {settingsError && <div className="boiler-error">{settingsError}</div>}
              <div className="schedule-form-actions">
                <button type="submit">Zapisz ustawienia</button>
              </div>
            </form>
          )}
        </section>
      </div>
    </div>
  );
};
