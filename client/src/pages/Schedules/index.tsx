import './style.css';
import { FormEvent, useEffect, useState } from 'react';
import { HpRequests } from '../../api/api';
import { CurrentSchedule, DeviceProperties, ScheduleEntry, ScheduleType, WeekDay } from '../../api/type';
import Notification from '../../components/Notification';

const weekDays = [
  ['Poniedziałek', WeekDay.MONDAY],
  ['Wtorek', WeekDay.TUESDAY],
  ['Środa', WeekDay.WEDNESDAY],
  ['Czwartek', WeekDay.THURSDAY],
  ['Piątek', WeekDay.FRIDAY],
  ['Sobota', WeekDay.SATURDAY],
  ['Niedziela', WeekDay.SUNDAY],
] as const;

const scheduleDayOptions = [
  ['Dowolny dzień', WeekDay.ANY_DAY],
  ['Dni robocze (poniedziałek–piątek)', WeekDay.WORKDAYS],
  ['Dni wolne', WeekDay.DAYS_OFF],
  ...weekDays,
] as const;

const emptyForm = {
  type: '' as ScheduleType,
  dayOfWeek: '',
  date: '',
  startTime: '',
  endTime: '',
  enabled: true,
  forceStart: false,
  minTemperature: '',
  maxTemperature: '',
};

const formatScheduleTarget = (schedule: ScheduleEntry): string => {
  if (schedule.date) return new Date(schedule.date).toLocaleDateString('pl-PL');
  if (schedule.dayOfWeek === WeekDay.ANY_DAY) return 'Dowolny dzień';
  if (schedule.dayOfWeek === WeekDay.WORKDAYS) return 'Dni robocze';
  if (schedule.dayOfWeek === WeekDay.DAYS_OFF) return 'Dni wolne';
  return weekDays.find(([, value]) => value === schedule.dayOfWeek)?.[0] || 'Każdy dzień';
};

export const Schedules: React.FC = () => {
  const [schedules, setSchedules] = useState<ScheduleEntry[]>([]);
  const [defaultProperties, setDefaultProperties] = useState<DeviceProperties>({
    work_mode: 'CWU',
  });
  const [form, setForm] = useState(emptyForm);
  const [useDate, setUseDate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [defaultSaving, setDefaultSaving] = useState(false);
  const [deleting, setDeleting] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [saveNotice, setSaveNotice] = useState('');
  // zapisane ustawienia (nie bieżące wartości pól): tylko one decydują, które harmonogramy działają
  const [savedProperties, setSavedProperties] = useState<DeviceProperties | undefined>(undefined);
  const savedWorkMode = savedProperties?.work_mode;
  const [currentSchedule, setCurrentSchedule] = useState<CurrentSchedule | null>(null);
  // OFF działa w obu trybach harmonogramu jako przerwa
  const activeScheduleTypes = savedWorkMode === 'A'
    ? [ScheduleType.CO, ScheduleType.OFF]
    : savedWorkMode === 'CWU' ? [ScheduleType.CWU, ScheduleType.OFF] : [];
  const isOffForm = form.type === ScheduleType.OFF;

  const showSaveNotice = () => {
    setSaveNotice('Dane zostały zapisane.');
    window.setTimeout(() => setSaveNotice(''), 3000);
  };

  const resetForm = () => {
    setForm(emptyForm);
    setUseDate(false);
    setEditingId(null);
    setShowForm(false);
  };

  const loadSchedules = () => {
    setLoading(true);
    HpRequests.getSchedules()
      .then((value) => setSchedules(value || []))
      .catch(() => setError('Nie udało się pobrać harmonogramów.'))
      .finally(() => setLoading(false));
  };

  const loadDefaultProperties = () => {
    HpRequests.getDeviceProperties()
      .then((value) => {
        setDefaultProperties(value ?? { work_mode: 'CWU' });
        setSavedProperties({ ...value, work_mode: value?.work_mode ?? 'CWU' });
      })
      .catch(() => setError('Nie udało się pobrać wartości domyślnych.'));
  };

  const loadCurrentSchedule = () => {
    HpRequests.getCurrentSchedule()
      .then((value) => setCurrentSchedule(value))
      .catch(() => setCurrentSchedule(null));
  };

  useEffect(() => {
    loadSchedules();
    loadDefaultProperties();
    loadCurrentSchedule();
    // zaznaczenie działającej pozycji zmienia się z upływem czasu, scheduler liczy co minutę
    const timer = window.setInterval(loadCurrentSchedule, 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  const updateDefaultProperty = (field: keyof DeviceProperties, value: string) => {
    setDefaultProperties((current) => ({ ...current, [field]: value }));
  };

  const handleSaveDefaultProperties = async () => {
    setDefaultSaving(true);
    setError('');

    try {
      await HpRequests.updateDeviceProperties(defaultProperties);
      setSavedProperties(defaultProperties);
      loadCurrentSchedule();
      showSaveNotice();
    } catch {
      setError('Nie udało się zapisać wartości domyślnych.');
    } finally {
      setDefaultSaving(false);
    }
  };

  const updateForm = (field: keyof typeof form, value: string | boolean) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const parseOptionalTemperature = (value: string): number | undefined => {
    const trimmed = value.trim();
    return trimmed === '' ? undefined : Number(trimmed);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');

    try {
      const payload = {
        type: form.type,
        enabled: form.enabled,
        ...(useDate
          ? { date: form.date }
          : { dayOfWeek: Number(form.dayOfWeek) }),
        startTime: form.startTime,
        endTime: form.endTime,
        // przerwa OFF nie używa temperatur ani wymuszenia
        forceStart: isOffForm ? false : form.forceStart,
        minTemperature: isOffForm ? undefined : parseOptionalTemperature(form.minTemperature),
        maxTemperature: isOffForm ? undefined : parseOptionalTemperature(form.maxTemperature),
      };

      if (editingId) {
        await HpRequests.updateSchedule(editingId, payload);
      } else {
        await HpRequests.createSchedule(payload);
      }

      resetForm();
      loadSchedules();
      loadCurrentSchedule();
      showSaveNotice();
    } catch {
      setError('Nie udało się zapisać harmonogramu.');
    } finally {
      setSaving(false);
    }
  };

  const startEditingSchedule = (schedule: ScheduleEntry) => {
    if (!schedule._id) return;

    setForm({
      type: schedule.type,
      dayOfWeek: String(schedule.dayOfWeek ?? WeekDay.MONDAY),
      date: schedule.date ? schedule.date.slice(0, 10) : '',
      startTime: schedule.startTime,
      endTime: schedule.endTime,
      enabled: schedule.enabled,
      forceStart: schedule.forceStart,
      minTemperature: schedule.minTemperature === undefined ? '' : String(schedule.minTemperature),
      maxTemperature: schedule.maxTemperature === undefined ? '' : String(schedule.maxTemperature),
    });
    setUseDate(Boolean(schedule.date));
    setEditingId(schedule._id);
    setShowForm(true);
    setError('');
  };

  const handleDelete = async (schedule: ScheduleEntry) => {
    if (!schedule._id || !window.confirm('Usunąć ten harmonogram?')) return;

    setDeleting(schedule._id);
    setError('');
    try {
      await HpRequests.deleteSchedule(schedule._id);
      setSchedules((current) => current.filter((item) => item._id !== schedule._id));
      loadCurrentSchedule();
    } catch {
      setError('Nie udało się usunąć harmonogramu.');
    } finally {
      setDeleting('');
    }
  };

  const scheduleGroups = [
    { type: ScheduleType.CWU, label: 'CWU Harmonogram' },
    { type: ScheduleType.CO, label: 'CO Harmonogram' },
    { type: ScheduleType.OFF, label: 'OFF' },
  ]
    .map((group) => ({
      ...group,
      schedules: schedules.filter((schedule) => schedule.type === group.type),
    }))
    .filter((group) => group.schedules.length > 0);

  // Poza harmonogramem: A i CWU grzeją CWU, M to ręczne CO, OFF to wyłączona pompa (jak scheduler na serwerze).
  const defaultMode = savedWorkMode === 'M' ? 'CO' : savedWorkMode === 'OFF' ? 'OFF' : 'CWU';
  const defaultTemperatures = defaultMode === 'CO'
    ? [savedProperties?.co_min, savedProperties?.co_max]
    : [savedProperties?.cwu_min, savedProperties?.cwu_max];
  const isDefaultCurrent = Boolean(
    currentSchedule && !currentSchedule.scheduleId && currentSchedule.work_mode !== 'OFF',
  );
  const isScheduleCurrent = (schedule: ScheduleEntry) =>
    Boolean(schedule._id && currentSchedule?.scheduleId === schedule._id);

  return (
    <div className="schedules-page">
      <Notification message={saveNotice} />
      <h2>Harmonogramy</h2>
      <section className="schedule-defaults-section">
        <div className="resource schedule-defaults-resource">
          <h3 className="settings-section-title">Ustawienia harmonogramu</h3>
          <div className="settings-default-temperatures">
            <div>
              <span className="label">Tryb pracy:</span>
              <select
                className="dict-select"
                value={defaultProperties.work_mode ?? 'CWU'}
                onChange={(event) => updateDefaultProperty('work_mode', event.target.value)}
              >
                <option value="CWU">CWU Harmonogram</option>
                <option value="M">CO</option>
              <option value="A">CO Harmonogram</option>
                <option value="OFF">OFF</option>
              </select>
            </div>
            <div>
              <span className="label">Temperatura CWU:</span>
              <input className="temperature" type="number" value={defaultProperties.cwu_min ?? ''} onChange={(event) => updateDefaultProperty('cwu_min', event.target.value)} />
              <input className="temperature" type="number" value={defaultProperties.cwu_max ?? ''} onChange={(event) => updateDefaultProperty('cwu_max', event.target.value)} />
            </div>
            <div>
              <span className="label">Temperatura CO:</span>
              <input className="temperature" type="number" value={defaultProperties.co_min ?? ''} onChange={(event) => updateDefaultProperty('co_min', event.target.value)} />
              <input className="temperature" type="number" value={defaultProperties.co_max ?? ''} onChange={(event) => updateDefaultProperty('co_max', event.target.value)} />
            </div>
            <div className="settings-section-actions">
              <button type="button" disabled={defaultSaving} onClick={handleSaveDefaultProperties}>
                {defaultSaving ? 'Zapisywanie...' : 'Zapisz'}
              </button>
            </div>
          </div>
        </div>
      </section>
      <div className={`schedules-layout${showForm ? '' : ' schedules-layout-list-only'}`}>
        {showForm && <form className="schedule-card" onSubmit={handleSubmit}>
          <h3>{editingId ? 'Edycja harmonogramu' : 'Nowy harmonogram'}</h3>

          <label>
            Rodzaj
            <select required value={form.type} onChange={(event) => updateForm('type', event.target.value)}>
              <option value="" disabled>Wybierz typ</option>
              <option value={ScheduleType.CO}>CO Harmonogram</option>
              <option value={ScheduleType.CWU}>CWU Harmonogram</option>
              <option value={ScheduleType.OFF}>OFF (przerwa)</option>
            </select>
          </label>

          <label className="schedule-toggle">
            <input type="checkbox" checked={useDate} onChange={(event) => setUseDate(event.target.checked)} />
            Data jednorazowa
          </label>

          {useDate ? (
            <label>
              Data
              <input type="date" required value={form.date} onChange={(event) => updateForm('date', event.target.value)} />
            </label>
          ) : (
            <label>
              Dzień
              <select required value={form.dayOfWeek} onChange={(event) => updateForm('dayOfWeek', event.target.value)}>
                <option value="" disabled>Wybierz dzień</option>
                {scheduleDayOptions.map(([name, value]) => <option key={value} value={value}>{name}</option>)}
              </select>
            </label>
          )}

          <div className="schedule-fields">
            <label>Od<input type="time" required value={form.startTime} onChange={(event) => updateForm('startTime', event.target.value)} /></label>
            <label>Do<input type="time" required value={form.endTime} onChange={(event) => updateForm('endTime', event.target.value)} /></label>
          </div>

          {!isOffForm && <>
            <div className="schedule-fields">
              <label>Min. [°C]<input type="number" step="0.1" value={form.minTemperature} onChange={(event) => updateForm('minTemperature', event.target.value)} /></label>
              <label>Maks. [°C]<input type="number" step="0.1" value={form.maxTemperature} onChange={(event) => updateForm('maxTemperature', event.target.value)} /></label>
            </div>

            <label className="schedule-toggle">
              <input type="checkbox" checked={form.forceStart} aria-label="Automatyczny start" onChange={(event) => updateForm('forceStart', event.target.checked)} />
              <span className="schedule-start-label">Wymuś start</span>
              Wymuś start
            </label>
          </>}

          <label className="schedule-toggle">
            <input type="checkbox" checked={form.enabled} onChange={(event) => updateForm('enabled', event.target.checked)} />
            Aktywny
          </label>

          <div className="schedule-form-actions">
          <button type="submit" disabled={saving}>{saving ? 'Zapisywanie...' : editingId ? 'Zapisz zmiany' : 'Zapisz'}</button>
            <button type="button" className="schedule-cancel" onClick={resetForm}>
              {editingId ? 'Anuluj' : 'Zamknij'}
            </button>
          </div>
          {error && <p className="schedule-error">{error}</p>}
        </form>}

        <section className="schedule-card">
          <div className="schedule-list-header">
            <h3 className="settings-section-title">Lista harmonogramów</h3>
            {!showForm && (
              <button type="button" onClick={() => setShowForm(true)}>
                Dodaj nowy harmonogram
              </button>
            )}
          </div>
          {loading ? <p>Ładowanie...</p> : (
            <div className="schedule-groups">
              {schedules.length === 0 && <p>Brak zdefiniowanych harmonogramów.</p>}
              {scheduleGroups.map((group) => (
                <section
                  className={`schedule-group${activeScheduleTypes.includes(group.type) ? ' schedule-group-active' : ''}`}
                  key={group.type}
                >
                  <h4>{group.label}</h4>
                  <div className="schedule-list">
                    {group.schedules.map((schedule, index) => (
                      <article
                        className={`schedule-row${isScheduleCurrent(schedule) ? ' schedule-row-current' : ''}`}
                        key={schedule._id || `${group.type}-${schedule.startTime}-${index}`}>
                        <div className="schedule-row-main">
                          <input type="checkbox" checked={schedule.enabled} readOnly aria-label="Aktywny" />
                          <span><b>{formatScheduleTarget(schedule)}</b></span>
                          <span>{schedule.startTime} – {schedule.endTime}</span>
                        </div>
                        <div className="schedule-row-details">
                          {schedule.type === ScheduleType.OFF ? <span>przerwa</span> : <>
                            <span>{schedule.minTemperature ?? 'domyślna'} – {schedule.maxTemperature ?? 'domyślna'} °C</span>
                            <label className="schedule-status">
                              <input type="checkbox" checked={schedule.forceStart} readOnly aria-label="Start" />
                              Wymuś Start
                            </label>
                          </>}
                          <button
                            className="schedule-edit"
                            type="button"
                            onClick={() => startEditingSchedule(schedule)}
                            aria-label="Edytuj harmonogram"
                            title="Edytuj harmonogram"
                          >
                            ✎
                          </button>
                          <button
                            className="schedule-delete"
                            type="button"
                            disabled={!schedule._id || deleting === schedule._id}
                            onClick={() => handleDelete(schedule)}
                            aria-label="Usuń harmonogram"
                            title="Usuń harmonogram"
                          >
                            X
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              ))}
              {savedProperties && (
                <section className="schedule-group">
                  <h4>Poza harmonogramem</h4>
                  <div className="schedule-list">
                    <article className={`schedule-row${isDefaultCurrent ? ' schedule-row-current' : ''}`}>
                      <div className="schedule-row-main">
                        <span><b>Ustawienie domyślne</b></span>
                        <span>{defaultMode}</span>
                      </div>
                      <div className="schedule-row-details">
                        {defaultMode === 'OFF'
                          ? <span>pompa wyłączona</span>
                          : <span>{defaultTemperatures[0] ?? '–'} – {defaultTemperatures[1] ?? '–'} °C</span>}
                      </div>
                    </article>
                  </div>
                </section>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
