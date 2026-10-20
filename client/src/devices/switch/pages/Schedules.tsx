// Zakładka Harmonogram włącznika (/schedules), układ z makiety „Instrument” (#s-switch-harmonogram): karta na
// przekaźnik z chipem trybu (harmonogram / tryb ręczny blokuje harmonogram), lista wpisów (.entries; wpis działający
// teraz podświetlony ze znacznikiem „działa teraz” — scheduleId z GET /switch/relays, odświeżane co minutę; wpis
// nieaktywny i wpisy przekaźnika w trybie ręcznym wyszarzone) i „+ Dodaj wpis”. Wpis edytuje okno modalne
// (GET/POST/PUT/DELETE /switch/schedules). Dni jak w pompie ciepła; okno przez północ należy do dnia startu.
import { FormEvent, useEffect, useState } from 'react';
import { WeekDay } from '../../../core/types';
import Notification, { useSaveNotice } from '../../../core/components/Notification';
import { IconButton } from '../../../core/components/IconButton';
import { EditIcon, TrashIcon } from '../../../core/components/icons';
import { SwitchRequests } from '../api';
import { SwitchRelay, SwitchSchedule } from '../types';
import { formatMoment, relayLabel } from '../utils/format';
import { CloseIcon } from '../components/icons';
import './style.css';

const weekDays = [
  ['Poniedziałek', WeekDay.MONDAY],
  ['Wtorek', WeekDay.TUESDAY],
  ['Środa', WeekDay.WEDNESDAY],
  ['Czwartek', WeekDay.THURSDAY],
  ['Piątek', WeekDay.FRIDAY],
  ['Sobota', WeekDay.SATURDAY],
  ['Niedziela', WeekDay.SUNDAY],
] as const;

// lista „Dni” w oknie wpisu; ostatnia pozycja odsłania pole daty
const DATE_OPTION = 'date';
const dayOptions = [
  ['Każdy dzień', String(WeekDay.ANY_DAY)],
  ['Dni robocze (bez świąt)', String(WeekDay.WORKDAYS)],
  ['Dni wolne (soboty, niedziele, święta)', String(WeekDay.DAYS_OFF)],
  ...weekDays.map(([name, value]) => [name, String(value)] as const),
  ['Konkretna data…', DATE_OPTION],
] as const;

const emptyForm = { relay: '1', day: String(WeekDay.ANY_DAY), date: '', startTime: '', endTime: '', enabled: true };

const formatDay = (schedule: SwitchSchedule) => {
  if (schedule.date) return new Date(schedule.date).toLocaleDateString('pl-PL', { timeZone: 'Europe/Warsaw' });
  if (schedule.dayOfWeek === WeekDay.ANY_DAY) return 'Każdy dzień';
  if (schedule.dayOfWeek === WeekDay.WORKDAYS) return 'Dni robocze';
  if (schedule.dayOfWeek === WeekDay.DAYS_OFF) return 'Dni wolne';
  return weekDays.find(([, value]) => value === schedule.dayOfWeek)?.[0] ?? '---';
};

// chip w nagłówku karty przekaźnika: tryb, w którym jest teraz
const modeChip = (relay: SwitchRelay) => {
  switch (relay.mode) {
    case 'off': return <span className="chip chip-err">tryb „wyłączony” blokuje harmonogram</span>;
    case 'on': return <span className="chip chip-warn">tryb „włączony” blokuje harmonogram</span>;
    case 'timer': return <span className="chip chip-warn">włączony na czas, potem harmonogram</span>;
    case 'pause': return <span className="chip chip-warn">wyłączony do końca okna, potem harmonogram</span>;
    default: return <span className="chip chip-ok"><i className="dot" />harmonogram</span>;
  }
};

export const SwitchSchedules: React.FC = () => {
  const [relays, setRelays] = useState<SwitchRelay[]>([]);
  const [schedules, setSchedules] = useState<SwitchSchedule[] | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // noticeBusy: komunikat widoczny, przycisk zapisu nieaktywny do jego zniknięcia (useSaveNotice)
  const { notice, showNotice, busy: noticeBusy } = useSaveNotice();

  const loadRelays = () => SwitchRequests.getRelays().then((result) => result && setRelays(result));
  const loadSchedules = () => SwitchRequests.getSchedules().then((result) => setSchedules(result ?? []));

  useEffect(() => {
    loadRelays();
    loadSchedules();
    const timer = window.setInterval(loadRelays, 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  // Esc zamyka okno wpisu
  useEffect(() => {
    if (!showForm) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') closeForm(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showForm]);

  const closeForm = () => {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(false);
    setError('');
  };

  const openNew = (relay: number) => {
    setForm({ ...emptyForm, relay: String(relay) });
    setEditingId(null);
    setShowForm(true);
    setError('');
  };

  const update = (field: keyof typeof form, value: string | boolean) => setForm((current) => ({ ...current, [field]: value }));
  const useDate = form.day === DATE_OPTION;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    const payload: SwitchSchedule = {
      relay: Number(form.relay),
      enabled: form.enabled,
      ...(useDate ? { date: form.date } : { dayOfWeek: Number(form.day) as WeekDay }),
      startTime: form.startTime,
      endTime: form.endTime,
    };
    try {
      if (editingId) await SwitchRequests.updateSchedule(editingId, payload);
      else await SwitchRequests.createSchedule(payload);
      closeForm();
      loadSchedules();
      loadRelays();
      showNotice('Harmonogram zapisany.');
    } catch {
      setError('Nie udało się zapisać harmonogramu.');
    } finally {
      setSaving(false);
    }
  };

  const edit = (schedule: SwitchSchedule) => {
    setForm({
      relay: String(schedule.relay),
      day: schedule.date ? DATE_OPTION : String(schedule.dayOfWeek ?? WeekDay.ANY_DAY),
      date: schedule.date ? schedule.date.slice(0, 10) : '',
      startTime: schedule.startTime,
      endTime: schedule.endTime,
      enabled: schedule.enabled,
    });
    setEditingId(schedule._id ?? null);
    setShowForm(true);
    setError('');
  };

  const remove = async (schedule: SwitchSchedule) => {
    if (!schedule._id || !window.confirm('Usunąć ten wpis harmonogramu?')) return;
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
  const formRelay = relays.find((relay) => relay.relay === Number(form.relay));

  return (
    <div className="page page-device switch-page">
      <Notification message={notice} />
      {schedules === null && <section className="card"><p className="help">Ładowanie…</p></section>}
      {schedules !== null && relays.length === 0 && <section className="card"><p className="help">Sterownik nie zgłosił jeszcze przekaźników.</p></section>}
      {error && !showForm && <section className="card card-danger"><p className="danger-text">{error}</p></section>}

      {schedules !== null && groups.map(({ relay, schedules: items }) => (
        <section className="card" key={relay.relay}>
          <header className="card-head"><h2>{relayLabel(relay)}</h2>{modeChip(relay)}</header>
          {items.length === 0 && <p className="help">Brak wpisów.</p>}
          {items.length > 0 && (
            <ul className="entries">
              {items.map((schedule) => {
                const current = Boolean(schedule._id && currentIds.has(schedule._id));
                const blocked = relay.mode === 'off' || relay.mode === 'on';
                const overnight = schedule.startTime > schedule.endTime;
                return (
                  <li key={schedule._id} className={`entry${current ? ' is-current' : ''}${!schedule.enabled || blocked ? ' is-off' : ''}`}>
                    <span className="entry-when">
                      <strong>{formatDay(schedule)}</strong> {schedule.startTime}–{schedule.endTime}{overnight && <small> (+1 dzień)</small>}
                    </span>
                    <span className="entry-what">
                      {!schedule.enabled ? 'wpis wyłączony' : 'włączony'}
                      {schedule.enabled && blocked && ` · nie działa, dopóki przekaźnik jest w trybie „${relay.mode === 'off' ? 'wyłączony' : 'włączony'}”`}
                      {schedule.enabled && !blocked && current && relay.nextStart && ` · następny start ${formatMoment(relay.nextStart)}`}
                      {schedule.enabled && !blocked && !current && overnight && ' · okno przez północ należy do dnia startu'}
                    </span>
                    {current && <span className="entry-tag">działa teraz</span>}
                    <span className="entry-actions">
                      <IconButton label="Edytuj wpis" icon={<EditIcon />} onClick={() => edit(schedule)} />
                      <IconButton label="Usuń wpis" variant="danger" icon={<TrashIcon />} onClick={() => remove(schedule)} />
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => openNew(relay.relay)}>+ Dodaj wpis</button>
          </div>
        </section>
      ))}

      {relays.length > 0 && (
        <p className="help">
          Przekaźnik w trybie „włącz” albo „wyłącz” nie reaguje na harmonogram do czasu wybrania „Harmonogram” na podglądzie.
          Stykające się okna są łączone w jedno włączenie.
        </p>
      )}

      {showForm && (
        <div className="modal-layer">
          <div className="scrim" onClick={closeForm} />
          <form className="modal" role="dialog" aria-labelledby="switch-entry-title" onSubmit={submit}>
            <header className="modal-head">
              <h2 id="switch-entry-title">{editingId ? 'Wpis harmonogramu' : 'Nowy wpis'}{formRelay ? ` · ${relayLabel(formRelay)}` : ''}</h2>
              <button type="button" className="icon-btn sm" aria-label="Zamknij" onClick={closeForm}><CloseIcon /></button>
            </header>
            <div className="modal-body">
              {relays.length > 1 && (
                <label className="field">
                  <span>Przekaźnik</span>
                  <select value={form.relay} onChange={(event) => update('relay', event.target.value)}>
                    {relays.map((relay) => <option key={relay.relay} value={relay.relay}>{relayLabel(relay)}</option>)}
                  </select>
                </label>
              )}
              <label className="field">
                <span>Dni</span>
                <select value={form.day} onChange={(event) => update('day', event.target.value)}>
                  {dayOptions.map(([name, value]) => <option key={value} value={value}>{name}</option>)}
                </select>
              </label>
              {useDate && (
                <label className="field">
                  <span>Data</span>
                  <input type="date" required value={form.date} onChange={(event) => update('date', event.target.value)} />
                </label>
              )}
              <div className="form-grid">
                <label htmlFor="switch-entry-from">Godziny</label>
                <div className="range-inputs">
                  <input type="time" id="switch-entry-from" required value={form.startTime} onChange={(event) => update('startTime', event.target.value)} />
                  <span className="dash">–</span>
                  <input type="time" required aria-label="Do" value={form.endTime} onChange={(event) => update('endTime', event.target.value)} />
                </div>
              </div>
              <p className="help">
                Koniec jest wyłączny; okno przez północ należy do dnia startu. Stykające się okna łączą się w jedno włączenie.
                {form.startTime && form.endTime && form.startTime > form.endTime && ` Przez północ: do ${form.endTime} następnego dnia.`}
              </p>
              <label className="check">
                <input type="checkbox" checked={form.enabled} onChange={(event) => update('enabled', event.target.checked)} />
                <span>Wpis włączony</span>
              </label>
              {error && <p className="danger-text">{error}</p>}
            </div>
            <footer className="modal-foot">
              <button type="button" className="btn" onClick={closeForm}>Anuluj</button>
              <button type="submit" className="btn btn-primary" disabled={saving || noticeBusy}>
                {saving ? 'Zapisywanie…' : editingId ? 'Zapisz zmiany' : 'Zapisz wpis'}
              </button>
            </footer>
          </form>
        </div>
      )}
    </div>
  );
};
