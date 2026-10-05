// Zakładka Harmonogram pompy (/schedules): tryb pracy i ustawienia domyślne urządzenia (GET/PUT
// /device/properties: work_mode MANUAL / AUTO / OFF, temperatura od–do), jedna lista wpisów (/schedules:
// praca albo przerwa OFF) i pozycja „Poza harmonogramem”. Czerwona kreska = pozycja działająca teraz
// (GET /schedules/current, odświeżane co minutę i po każdym zapisie). Harmonogram działa tylko w trybie
// automatycznym; dawne wpisy CO i CWU są pokazywane jak praca.
import './style.css';
import { FormEvent, useEffect, useState } from 'react';
import { HpRequests } from '../../api';
import { DeviceRequests } from '../../../../core/api';
import { useDevice } from '../../../../core/context/DeviceContext';
import { CurrentSchedule, PumpWorkMode, pumpWorkMode, ScheduleEntry, ScheduleType, WeekDay } from '../../types';
import { DeviceProperties } from '../../../../core/types';
import Notification from '../../../../core/components/Notification';
import { IconButton } from '../../../../core/components/IconButton';
import { EditIcon, PlusIcon, TrashIcon } from '../../../../core/components/icons';
import { WORK_MODE_HINTS, WorkModeSwitch } from '../../components/WorkModeSwitch';

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
  ['Codziennie', WeekDay.ANY_DAY],
  ['Dni robocze (poniedziałek–piątek)', WeekDay.WORKDAYS],
  ['Dni wolne', WeekDay.DAYS_OFF],
  ...weekDays,
] as const;

const emptyForm = {
  off: false,
  dayOfWeek: String(WeekDay.ANY_DAY),
  date: '',
  startTime: '',
  endTime: '',
  enabled: true,
  forceStart: false,
  minTemperature: '',
  maxTemperature: '',
};

// Opis dnia wpisu; data jednorazowa ma pierwszeństwo przed dniem tygodnia (jak w schedulerze).
const formatScheduleTarget = (schedule: ScheduleEntry): string => {
  if (schedule.date) return new Date(schedule.date).toLocaleDateString('pl-PL');
  if (schedule.dayOfWeek === WeekDay.ANY_DAY) return 'Codziennie';
  if (schedule.dayOfWeek === WeekDay.WORKDAYS) return 'Dni robocze';
  if (schedule.dayOfWeek === WeekDay.DAYS_OFF) return 'Dni wolne';
  return weekDays.find(([, value]) => value === schedule.dayOfWeek)?.[0] || 'Codziennie';
};

// Temperatura od–do jak na serwerze (pump-mode.service.ts): 1–50 °C, od ≤ do.
const TEMPERATURE_MIN = 1;
const TEMPERATURE_MAX = 50;
const temperatureError = (min: string, max: string, required: boolean): string => {
  const values = [min, max].map((value) => value.trim());
  if (required && values.some((value) => value === '')) return 'Podaj temperaturę od i do.';
  for (const value of values.filter(Boolean)) {
    const number = Number(value);
    if (!Number.isFinite(number) || number < TEMPERATURE_MIN || number > TEMPERATURE_MAX) {
      return `Temperatura: ${TEMPERATURE_MIN}–${TEMPERATURE_MAX} °C.`;
    }
  }
  if (values[0] && values[1] && Number(values[0]) > Number(values[1])) return 'Temperatura od nie może być wyższa niż do.';
  return '';
};

const text = (value?: string | String) => (value === undefined || value === null ? '' : String(value));

export const Schedules: React.FC = () => {
  const { device } = useDevice();
  const [schedules, setSchedules] = useState<ScheduleEntry[]>([]);
  // wczytane properties (PUT zastępuje całe pole) i pola formularza ustawień domyślnych
  const [properties, setProperties] = useState<DeviceProperties | undefined>(undefined);
  const [mode, setMode] = useState<PumpWorkMode>('MANUAL');
  const [tempMin, setTempMin] = useState('');
  const [tempMax, setTempMax] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [useDate, setUseDate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [defaultSaving, setDefaultSaving] = useState(false);
  const [deleting, setDeleting] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [defaultError, setDefaultError] = useState('');
  const [saveNotice, setSaveNotice] = useState('');
  const [currentSchedule, setCurrentSchedule] = useState<CurrentSchedule | null>(null);
  // zapisany tryb (nie bieżący wybór przycisków) decyduje, czy harmonogram działa
  const savedMode = pumpWorkMode(properties?.work_mode);

  const showSaveNotice = () => {
    setSaveNotice('Dane zostały zapisane.');
    window.setTimeout(() => setSaveNotice(''), 3000);
  };

  const resetForm = () => {
    setForm(emptyForm);
    setUseDate(false);
    setEditingId(null);
    setShowForm(false);
    setError('');
  };

  const loadSchedules = () => {
    setLoading(true);
    HpRequests.getSchedules()
      .then((value) => setSchedules(value || []))
      .catch(() => setError('Nie udało się pobrać harmonogramów.'))
      .finally(() => setLoading(false));
  };

  // Temperatura od–do: nowe pola, a w urządzeniu sprzed zmiany para pasująca do podłączenia (jak serwer).
  const loadDefaultProperties = () => {
    DeviceRequests.getDeviceProperties()
      .then((value) => {
        const loaded = value ?? {};
        const co = device?.pumpConfig?.connection === 'co';
        setProperties(loaded);
        setMode(pumpWorkMode(loaded.work_mode));
        setTempMin(text(loaded.temp_min ?? (co ? loaded.co_min : loaded.cwu_min)));
        setTempMax(text(loaded.temp_max ?? (co ? loaded.co_max : loaded.cwu_max)));
      })
      .catch(() => setDefaultError('Nie udało się pobrać ustawień domyślnych.'));
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

  // PUT zastępuje całe properties: wysyłane są wczytane pola bez dawnych par co_*/cwu_* i dawnego trybu.
  // Zapis kasuje ręczne ustawienia z zakładki Ustawienia, a pompa dostaje nowe wartości w kilka sekund.
  const handleSaveDefaultProperties = async () => {
    const problem = temperatureError(tempMin, tempMax, true);
    setDefaultError(problem);
    if (problem) return;
    setDefaultSaving(true);
    try {
      const { co_min: _a, co_max: _b, cwu_min: _c, cwu_max: _d, ...rest } = properties ?? {};
      const saved = await DeviceRequests.updateDeviceProperties({
        ...rest,
        work_mode: mode,
        temp_min: tempMin.trim(),
        temp_max: tempMax.trim(),
      });
      setProperties(saved);
      loadCurrentSchedule();
      showSaveNotice();
    } catch {
      setDefaultError('Nie udało się zapisać ustawień domyślnych.');
    } finally {
      setDefaultSaving(false);
    }
  };

  const updateForm = (field: keyof typeof form, value: string | boolean) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  // puste pole = brak temperatury we wpisie; scheduler weźmie wtedy ustawienie domyślne
  const parseOptionalTemperature = (value: string): number | undefined => {
    const trimmed = value.trim();
    return trimmed === '' ? undefined : Number(trimmed);
  };

  // Uwaga: tworzenie idzie przez Requests.post, który nie rzuca wyjątku, więc błąd serwera przy
  // nowym wpisie nie pokaże komunikatu (edycja przez put rzuca i komunikat się pojawi).
  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const problem = form.off ? '' : temperatureError(form.minTemperature, form.maxTemperature, false);
    setError(problem);
    if (problem) return;
    setSaving(true);

    try {
      const payload = {
        type: form.off ? ScheduleType.OFF : ScheduleType.HEAT,
        enabled: form.enabled,
        ...(useDate
          ? { date: form.date }
          : { dayOfWeek: Number(form.dayOfWeek) }),
        startTime: form.startTime,
        endTime: form.endTime,
        // przerwa OFF nie używa temperatur ani wymuszenia
        forceStart: form.off ? false : form.forceStart,
        minTemperature: form.off ? undefined : parseOptionalTemperature(form.minTemperature),
        maxTemperature: form.off ? undefined : parseOptionalTemperature(form.maxTemperature),
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
      setError('Nie udało się zapisać wpisu.');
    } finally {
      setSaving(false);
    }
  };

  const startEditingSchedule = (schedule: ScheduleEntry) => {
    if (!schedule._id) return;

    setForm({
      off: schedule.type === ScheduleType.OFF,
      dayOfWeek: String(schedule.dayOfWeek ?? WeekDay.ANY_DAY),
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
    if (!schedule._id || !window.confirm('Usunąć ten wpis harmonogramu?')) return;

    setDeleting(schedule._id);
    setError('');
    try {
      await HpRequests.deleteSchedule(schedule._id);
      setSchedules((current) => current.filter((item) => item._id !== schedule._id));
      loadCurrentSchedule();
    } catch {
      setError('Nie udało się usunąć wpisu.');
    } finally {
      setDeleting('');
    }
  };

  // kolejność jak na liście dnia: data jednorazowa na końcu, w obrębie grupy po godzinie startu
  const sortedSchedules = [...schedules].sort((first, second) =>
    Number(Boolean(first.date)) - Number(Boolean(second.date)) || first.startTime.localeCompare(second.startTime));

  const savedMin = text(properties?.temp_min) || tempMin;
  const savedMax = text(properties?.temp_max) || tempMax;
  // czerwona kreska przy „Poza harmonogramem”, gdy żaden wpis nie działa; w trybie OFF nic nie jest zaznaczone
  const isDefaultCurrent = Boolean(currentSchedule && !currentSchedule.scheduleId && currentSchedule.work_mode !== 'OFF');
  const isScheduleCurrent = (schedule: ScheduleEntry) =>
    Boolean(schedule._id && currentSchedule?.scheduleId === schedule._id);

  const describeEntry = (schedule: ScheduleEntry) => {
    if (schedule.type === ScheduleType.OFF) return 'przerwa (OFF)';
    const temperatures = `${schedule.minTemperature ?? savedMin} – ${schedule.maxTemperature ?? savedMax} °C`;
    return `praca ${temperatures}${schedule.forceStart ? ' · wymuszenie' : ''}${schedule.enabled ? '' : ' · wyłączony'}`;
  };

  return (
    <div className="schedules-page">
      <Notification message={saveNotice} />
      <h2>Harmonogram</h2>
      <section className="schedule-defaults-section">
        <div className="resource schedule-defaults-resource">
          <h3 className="settings-section-title">Ustawienia harmonogramu</h3>
          <div className="schedule-mode-row">
            <span className="label">Tryb pracy:</span>
            <div className="schedule-mode-switch">
              <WorkModeSwitch value={mode} onChange={setMode} />
            </div>
          </div>
          <p className="schedule-hint">{WORK_MODE_HINTS[mode]}</p>
          <h4 className="schedule-defaults-title">Ustawienia domyślne</h4>
          <div className="settings-default-temperatures">
            <div>
              <label className="label" htmlFor="schedule-temp-min">Temperatura od / do:</label>
              <input id="schedule-temp-min" className="temperature" type="number" value={tempMin}
                onChange={(event) => setTempMin(event.target.value)} />
              <input aria-label="Temperatura do" className="temperature" type="number" value={tempMax}
                onChange={(event) => setTempMax(event.target.value)} />
            </div>
            {defaultError && <p className="schedule-error">{defaultError}</p>}
            <div className="settings-section-actions">
              <button type="button" disabled={defaultSaving || !properties} onClick={handleSaveDefaultProperties}>
                {defaultSaving ? 'Zapisywanie...' : 'Zapisz'}
              </button>
            </div>
          </div>
        </div>
      </section>
      <div className={`schedules-layout${showForm ? '' : ' schedules-layout-list-only'}`}>
        {showForm && <form className="schedule-card" onSubmit={handleSubmit}>
          <h3>{editingId ? 'Edycja wpisu' : 'Wpis harmonogramu'}</h3>

          <div className="schedule-form-row">
            <span>Rodzaj</span>
            <div className="work-mode-switch" role="group" aria-label="Rodzaj wpisu">
              <button type="button" className={form.off ? '' : 'on'} aria-pressed={!form.off}
                onClick={() => updateForm('off', false)}>Praca</button>
              <button type="button" className={form.off ? 'on' : ''} aria-pressed={form.off}
                onClick={() => updateForm('off', true)}>Przerwa (OFF)</button>
            </div>
          </div>

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
              Dni
              <select required value={form.dayOfWeek} onChange={(event) => updateForm('dayOfWeek', event.target.value)}>
                {scheduleDayOptions.map(([name, value]) => <option key={value} value={value}>{name}</option>)}
              </select>
            </label>
          )}

          <div className="schedule-fields">
            <label>Godzina od<input type="time" required value={form.startTime} onChange={(event) => updateForm('startTime', event.target.value)} /></label>
            <label>Godzina do<input type="time" required value={form.endTime} onChange={(event) => updateForm('endTime', event.target.value)} /></label>
          </div>

          {!form.off && <>
            <div className="schedule-fields">
              <label>Temperatura od [°C]<input type="number" step="1" placeholder={savedMin} value={form.minTemperature} onChange={(event) => updateForm('minTemperature', event.target.value)} /></label>
              <label>Temperatura do [°C]<input type="number" step="1" placeholder={savedMax} value={form.maxTemperature} onChange={(event) => updateForm('maxTemperature', event.target.value)} /></label>
            </div>

            <label className="schedule-toggle">
              <input type="checkbox" checked={form.forceStart} onChange={(event) => updateForm('forceStart', event.target.checked)} />
              Wymuszenie pracy
            </label>
          </>}

          <label className="schedule-toggle">
            <input type="checkbox" checked={form.enabled} onChange={(event) => updateForm('enabled', event.target.checked)} />
            Włączony
          </label>

          {error && <p className="schedule-error">{error}</p>}
          <div className="schedule-form-actions">
            <button type="button" className="schedule-cancel" onClick={resetForm}>Anuluj</button>
            <button type="submit" disabled={saving}>{saving ? 'Zapisywanie...' : 'Zapisz'}</button>
          </div>
        </form>}

        <section className="schedule-card">
          <div className="schedule-list-header">
            <h3 className="settings-section-title">Harmonogramy</h3>
            {!showForm && (
              <IconButton label="Dodaj wpis" icon={<PlusIcon />} onClick={() => { resetForm(); setShowForm(true); }} />
            )}
          </div>
          {properties && savedMode !== 'AUTO' && (
            <p className="schedule-hint">
              Harmonogram nie działa w trybie {savedMode === 'OFF' ? 'OFF' : 'ręcznym'} — działa tylko w trybie automatycznym.
            </p>
          )}
          {!showForm && error && <p className="schedule-error">{error}</p>}
          {loading ? <p>Ładowanie...</p> : (
            <div className="schedule-list">
              {schedules.length === 0 && <p>Brak wpisów.</p>}
              {sortedSchedules.map((schedule, index) => (
                <article
                  className={`schedule-row${isScheduleCurrent(schedule) ? ' schedule-row-current' : ''}${schedule.enabled ? '' : ' schedule-row-disabled'}`}
                  key={schedule._id || `${schedule.startTime}-${index}`}>
                  <div className="schedule-row-main">
                    <b>{formatScheduleTarget(schedule)} {schedule.startTime}–{schedule.endTime}</b>
                  </div>
                  <div className="schedule-row-details">
                    <span>{describeEntry(schedule)}</span>
                    <IconButton className="schedule-edit" label="Edytuj wpis" icon={<EditIcon />}
                      onClick={() => startEditingSchedule(schedule)} />
                    <IconButton className="schedule-delete" variant="danger" label="Usuń wpis" icon={<TrashIcon />}
                      disabled={!schedule._id || deleting === schedule._id} onClick={() => handleDelete(schedule)} />
                  </div>
                </article>
              ))}
              {properties && (
                <article className={`schedule-row schedule-row-default${isDefaultCurrent ? ' schedule-row-current' : ''}`}>
                  <div className="schedule-row-main"><b>Poza harmonogramem</b></div>
                  <div className="schedule-row-details">
                    <span>
                      {savedMode === 'OFF' ? 'pompa wyłączona' : `ustawienie domyślne: ${savedMin || '–'}–${savedMax || '–'} °C`}
                    </span>
                  </div>
                </article>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
