import './style.css';
import { FormEvent, useEffect, useState } from 'react';
import { HpRequests } from '../../api/api';
import { ScheduleEntry, ScheduleType, WeekDay } from '../../api/type';

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
  return weekDays.find(([, value]) => value === schedule.dayOfWeek)?.[0] || 'Każdy dzień';
};

export const Schedules: React.FC = () => {
  const [schedules, setSchedules] = useState<ScheduleEntry[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [useDate, setUseDate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState('');

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

  useEffect(loadSchedules, []);

  const updateForm = (field: keyof typeof form, value: string | boolean) => {
    setForm((current) => ({ ...current, [field]: value }));
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
        forceStart: form.forceStart,
        minTemperature: Number(form.minTemperature),
        maxTemperature: Number(form.maxTemperature),
      };

      if (editingId) {
        await HpRequests.updateSchedule(editingId, payload);
      } else {
        await HpRequests.createSchedule(payload);
      }

      resetForm();
      loadSchedules();
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
      minTemperature: String(schedule.minTemperature),
      maxTemperature: String(schedule.maxTemperature),
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
    } catch {
      setError('Nie udało się usunąć harmonogramu.');
    } finally {
      setDeleting('');
    }
  };

  const scheduleGroups = [
    { type: ScheduleType.CWU, label: 'CWU' },
    { type: ScheduleType.CO, label: 'CO' },
    { type: ScheduleType.OFF, label: 'OFF' },
  ]
    .map((group) => ({
      ...group,
      schedules: schedules.filter((schedule) => schedule.type === group.type),
    }))
    .filter((group) => group.schedules.length > 0);

  return (
    <div className="schedules-page">
      <h2>Harmonogramy</h2>
      <div className={`schedules-layout${showForm ? '' : ' schedules-layout-list-only'}`}>
        {showForm && <form className="schedule-card" onSubmit={handleSubmit}>
          <h3>{editingId ? 'Edycja harmonogramu' : 'Nowy harmonogram'}</h3>

          <label>
            Rodzaj
            <select required value={form.type} onChange={(event) => updateForm('type', event.target.value)}>
              <option value="" disabled>Wybierz typ</option>
              <option value={ScheduleType.CO}>CO</option>
              <option value={ScheduleType.CWU}>CWU</option>
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

          <div className="schedule-fields">
            <label>Min. [°C]<input type="number" step="0.1" required value={form.minTemperature} onChange={(event) => updateForm('minTemperature', event.target.value)} /></label>
            <label>Maks. [°C]<input type="number" step="0.1" required value={form.maxTemperature} onChange={(event) => updateForm('maxTemperature', event.target.value)} /></label>
          </div>

          <label className="schedule-toggle">
            <input type="checkbox" checked={form.forceStart} aria-label="Automatyczny start" onChange={(event) => updateForm('forceStart', event.target.checked)} />
            <span className="schedule-start-label">Wymuś start</span>
            Wymuś start
          </label>

          <label className="schedule-toggle">
            <input type="checkbox" checked={form.enabled} onChange={(event) => updateForm('enabled', event.target.checked)} />
            Aktywny
          </label>

          <div className="schedule-form-actions">
            <button type="submit" disabled={saving}>{saving ? 'Zapisywanie...' : editingId ? 'Zapisz zmiany' : 'Dodaj harmonogram'}</button>
            {editingId && (
              <button type="button" className="schedule-cancel" onClick={resetForm}>
                Anuluj
              </button>
            )}
          </div>
          {error && <p className="schedule-error">{error}</p>}
        </form>}

        <section className="schedule-card">
          <div className="schedule-list-header">
            <h3>Lista harmonogramów</h3>
            <button type="button" onClick={() => setShowForm((current) => !current)}>
              {showForm ? 'Ukryj formularz' : 'Dodaj nowy harmonogram'}
            </button>
          </div>
          {loading ? <p>Ładowanie...</p> : schedules.length === 0 ? <p>Brak zdefiniowanych harmonogramów.</p> : (
            <div className="schedule-groups">
              {scheduleGroups.map((group) => (
                <section className="schedule-group" key={group.type}>
                  <h4>{group.label}</h4>
                  <div className="schedule-list">
                    {group.schedules.map((schedule, index) => (
                      <article className="schedule-row" key={schedule._id || `${group.type}-${schedule.startTime}-${index}`}>
                        <div className="schedule-row-main">
                          <input type="checkbox" checked={schedule.enabled} readOnly aria-label="Aktywny" />
                          <span><b>{formatScheduleTarget(schedule)}</b></span>
                          <span>{schedule.startTime} – {schedule.endTime}</span>
                        </div>
                        <div className="schedule-row-details">
                          <span>{schedule.minTemperature} – {schedule.maxTemperature} °C</span>
                          <label className="schedule-status">
                            <input type="checkbox" checked={schedule.forceStart} readOnly aria-label="Start" />
                            Wymuś Start                            
                          </label>
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
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
