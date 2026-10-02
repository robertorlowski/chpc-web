// Zakładka Harmonogram włącznika (/schedules): wpisy włączeń dla każdego przekaźnika
// (GET/POST/PUT/DELETE /switch/schedules). Dni jak w pompie ciepła; okno przez północ trwa
// od dnia startu do rana następnego dnia. Czerwona kreska: wpis, który działa teraz
// (scheduleId z GET /switch/relays, odświeżane co minutę). Wygląd listy i formularza
// z harmonogramów pompy (te same klasy CSS).
import '../../heat-pump/pages/Schedules/style.css';
import './style.css';
import { FormEvent, useEffect, useState } from 'react';
import { WeekDay } from '../../../core/types';
import Notification from '../../../core/components/Notification';
import { IconButton } from '../../../core/components/IconButton';
import { EditIcon, PlusIcon, TrashIcon } from '../../../core/components/icons';
import { SwitchRequests } from '../api';
import { SwitchRelay, SwitchSchedule } from '../types';
import { relayLabel } from '../utils/format';

const weekDays = [
  ['Poniedziałek', WeekDay.MONDAY],
  ['Wtorek', WeekDay.TUESDAY],
  ['Środa', WeekDay.WEDNESDAY],
  ['Czwartek', WeekDay.THURSDAY],
  ['Piątek', WeekDay.FRIDAY],
  ['Sobota', WeekDay.SATURDAY],
  ['Niedziela', WeekDay.SUNDAY],
] as const;

const dayOptions = [
  ['Każdy dzień', WeekDay.ANY_DAY],
  ['Dni robocze (poniedziałek–piątek)', WeekDay.WORKDAYS],
  ['Dni wolne (weekendy i święta)', WeekDay.DAYS_OFF],
  ...weekDays,
] as const;

const emptyForm = { relay: '1', dayOfWeek: String(WeekDay.ANY_DAY), date: '', startTime: '', endTime: '', enabled: true };

const formatDay = (schedule: SwitchSchedule) => {
  if (schedule.date) return new Date(schedule.date).toLocaleDateString('pl-PL', { timeZone: 'Europe/Warsaw' });
  if (schedule.dayOfWeek === WeekDay.ANY_DAY) return 'Każdy dzień';
  if (schedule.dayOfWeek === WeekDay.WORKDAYS) return 'Dni robocze';
  if (schedule.dayOfWeek === WeekDay.DAYS_OFF) return 'Dni wolne';
  return weekDays.find(([, value]) => value === schedule.dayOfWeek)?.[0] ?? '---';
};

export const SwitchSchedules: React.FC = () => {
  const [relays, setRelays] = useState<SwitchRelay[]>([]);
  const [schedules, setSchedules] = useState<SwitchSchedule[] | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [useDate, setUseDate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadRelays = () => SwitchRequests.getRelays().then((result) => result && setRelays(result));
  const loadSchedules = () => SwitchRequests.getSchedules().then((result) => setSchedules(result ?? []));

  useEffect(() => {
    loadRelays();
    loadSchedules();
    const timer = window.setInterval(loadRelays, 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  const resetForm = () => {
    setForm(emptyForm);
    setUseDate(false);
    setEditingId(null);
    setShowForm(false);
  };

  const update = (field: keyof typeof form, value: string | boolean) => setForm((current) => ({ ...current, [field]: value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    const payload: SwitchSchedule = {
      relay: Number(form.relay),
      enabled: form.enabled,
      ...(useDate ? { date: form.date } : { dayOfWeek: Number(form.dayOfWeek) as WeekDay }),
      startTime: form.startTime,
      endTime: form.endTime,
    };
    try {
      if (editingId) await SwitchRequests.updateSchedule(editingId, payload);
      else await SwitchRequests.createSchedule(payload);
      resetForm();
      loadSchedules();
      loadRelays();
      setNotice('Harmonogram zapisany.');
      window.setTimeout(() => setNotice(''), 3000);
    } catch {
      setError('Nie udało się zapisać harmonogramu.');
    } finally {
      setSaving(false);
    }
  };

  const edit = (schedule: SwitchSchedule) => {
    setForm({
      relay: String(schedule.relay),
      dayOfWeek: String(schedule.dayOfWeek ?? WeekDay.ANY_DAY),
      date: schedule.date ? schedule.date.slice(0, 10) : '',
      startTime: schedule.startTime,
      endTime: schedule.endTime,
      enabled: schedule.enabled,
    });
    setUseDate(Boolean(schedule.date));
    setEditingId(schedule._id ?? null);
    setShowForm(true);
    setError('');
  };

  const remove = async (schedule: SwitchSchedule) => {
    if (!schedule._id || !window.confirm('Usunąć ten harmonogram?')) return;
    try {
      await SwitchRequests.deleteSchedule(schedule._id);
      loadSchedules();
      loadRelays();
    } catch {
      setError('Nie udało się usunąć harmonogramu.');
    }
  };

  const currentIds = new Set(relays.map((relay) => relay.scheduleId).filter(Boolean));
  const groups = relays.map((relay) => ({
    relay,
    schedules: (schedules ?? []).filter((schedule) => schedule.relay === relay.relay),
  }));

  return (
    <div className="schedules-page switch-page">
      <Notification message={notice} />
      <h2>Harmonogram</h2>
      <div className={`schedules-layout${showForm ? '' : ' schedules-layout-list-only'}`}>
        {showForm && (
          <form className="schedule-card" onSubmit={submit}>
            <h3>{editingId ? 'Edycja harmonogramu' : 'Nowy harmonogram'}</h3>
            {relays.length > 1 && (
              <label>
                Przekaźnik
                <select value={form.relay} onChange={(event) => update('relay', event.target.value)}>
                  {relays.map((relay) => <option key={relay.relay} value={relay.relay}>{relayLabel(relay)}</option>)}
                </select>
              </label>
            )}
            <label className="schedule-toggle">
              <input type="checkbox" checked={useDate} onChange={(event) => setUseDate(event.target.checked)} />
              Data jednorazowa
            </label>
            {useDate ? (
              <label>
                Data
                <input type="date" required value={form.date} onChange={(event) => update('date', event.target.value)} />
              </label>
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
              <div className="switch-hint">Przez północ: do {form.endTime} następnego dnia.</div>
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
            <h3 className="settings-section-title">Lista harmonogramów</h3>
            {!showForm && relays.length > 0 && (
              <IconButton label="Dodaj nowy harmonogram" icon={<PlusIcon />} onClick={() => setShowForm(true)} />
            )}
          </div>
          {schedules === null ? <p>Ładowanie...</p> : (
            <div className="schedule-groups">
              {relays.length === 0 && <p>Sterownik nie zgłosił jeszcze przekaźników.</p>}
              {groups.map(({ relay, schedules: items }) => (
                <section className="schedule-group" key={relay.relay}>
                  {relays.length > 1 && <h4>{relayLabel(relay)}</h4>}
                  <div className="schedule-list">
                    {items.length === 0 && <p>Brak harmonogramów.</p>}
                    {items.map((schedule) => (
                      <article key={schedule._id}
                        className={`schedule-row${schedule._id && currentIds.has(schedule._id) ? ' schedule-row-current' : ''}`}>
                        <div className="schedule-row-main">
                          <input type="checkbox" checked={schedule.enabled} readOnly aria-label="Aktywny" />
                          <span><b>{formatDay(schedule)}</b></span>
                          <span>{schedule.startTime} – {schedule.endTime}{schedule.startTime > schedule.endTime ? ' (+1 dzień)' : ''}</span>
                        </div>
                        <div className="schedule-row-details">
                          {!schedule.enabled && <span>wyłączony</span>}
                          <IconButton className="schedule-edit" label="Edytuj harmonogram" icon={<EditIcon />} onClick={() => edit(schedule)} />
                          <IconButton className="schedule-delete" variant="danger" label="Usuń harmonogram" icon={<TrashIcon />}
                            onClick={() => remove(schedule)} />
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              ))}
              {relays.some((relay) => relay.mode !== 'schedule') && (
                <p className="switch-hint">
                  Przekaźnik w trybie ręcznym ({relays.filter((relay) => relay.mode !== 'schedule').map(relayLabel).join(', ')})
                  nie wykonuje harmonogramu, dopóki nie wybierzesz „Harmonogram” na stronie głównej.
                </p>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
