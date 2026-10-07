// Ustawienia zaawansowane → grupa „Pompa ciepła / Pellet”: nastawy kotła stosowane po wyborze trybu
// pracy (Ustawienia → Tryb pracy), w dwóch kolumnach. Zapis w ustawieniach harmonogramu na serwerze
// (PUT /schedule-settings, pole profiles; wartości surowe jak w zleceniach). Edycja zawsze możliwa —
// to ustawienia aplikacji, nie regulatora; regulator sprawdzi zakres przy przełączeniu trybu.
import { FormEvent, useEffect, useState } from 'react';
import { PelletBoilerRequests } from '../api';
import { useSaveNotice } from '../../../core/components/Notification';
import { PelletBoilerMode, PelletBoilerParameter, PelletBoilerScheduleSettings, PelletBoilerSettings } from '../types';
import { COMMANDS_CHANGED, PROFILE_ROWS, choicesOf, display, itemOfKey } from './MainParameters';

const MODES: { key: PelletBoilerMode; label: string }[] = [
  { key: 'heat-pump', label: 'Pompa ciepła' },
  { key: 'pellet', label: 'Pellet' },
];

const findParameter = (settings: PelletBoilerSettings, key: string): PelletBoilerParameter | undefined => {
  const item = itemOfKey(key);
  return item.kind === 'ecomax'
    ? settings.groups?.flatMap((g) => g.parameters).find((p) => p.index === item.index)
    : settings.mixers?.find((m) => m.mixer === item.mixer)?.parameters.find((p) => p.index === item.index);
};
const toRaw = (p: PelletBoilerParameter, value: number) => Math.round(value / (p.step ?? 1) + (p.offset ?? 0));
const fromRaw = (p: PelletBoilerParameter, raw: number) => Math.round((raw - (p.offset ?? 0)) * (p.step ?? 1) * 1e6) / 1e6;

export const ModeProfiles: React.FC<{ settings: PelletBoilerSettings }> = ({ settings }) => {
  const [schedule, setSchedule] = useState<PelletBoilerScheduleSettings | null>(null);
  // wartości formularza w jednostkach (tekst), klucz: tryb → parametr
  const [values, setValues] = useState<Record<PelletBoilerMode, Record<string, string>> | null>(null);
  const [error, setError] = useState('');
  // komunikat w karcie (nie Notification); przycisk nieaktywny w trakcie zapisu i dopóki go widać
  const { notice, showNotice, run, busy } = useSaveNotice();

  useEffect(() => {
    PelletBoilerRequests.getScheduleSettings().then((loaded) => {
      if (!loaded) return;
      setSchedule(loaded);
      const form = { 'heat-pump': {}, pellet: {} } as Record<PelletBoilerMode, Record<string, string>>;
      for (const { key: mode } of MODES) {
        for (const key of PROFILE_ROWS) {
          const parameter = findParameter(settings, key);
          const raw = loaded.profiles[mode]?.[key];
          if (parameter && raw !== undefined) form[mode][key] = String(fromRaw(parameter, raw));
        }
      }
      setValues(form);
    });
  }, [settings]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!schedule || !values) return;
    const profiles = { 'heat-pump': {}, pellet: {} } as PelletBoilerScheduleSettings['profiles'];
    for (const { key: mode, label } of MODES) {
      for (const key of PROFILE_ROWS) {
        const parameter = findParameter(settings, key);
        const text = values[mode][key];
        if (!parameter || text === undefined || text === '') continue;
        const number = Number(text.replace(',', '.'));
        if (!Number.isFinite(number)) return setError(`${label}: ${parameter.label}: nieprawidłowa liczba.`);
        profiles[mode][key] = toRaw(parameter, number);
      }
    }
    await run(async () => { try {
      const saved = await PelletBoilerRequests.saveScheduleSettings({ ...schedule, profiles });
      setSchedule(saved);
      setError('');
      showNotice('Zapisano nastawy trybów.');
      window.dispatchEvent(new Event(COMMANDS_CHANGED));
    } catch {
      setError('Nie udało się zapisać nastaw.');
    } });
  };

  if (!values) return <div className="boiler-hint">Wczytywanie nastaw trybów…</div>;

  return (
    <form className="boiler-profiles-table" onSubmit={save}>
      <table className="boiler-table">
        <thead>
          <tr><th>Parametr</th>{MODES.map((mode) => <th key={mode.key}>{mode.label}</th>)}</tr>
        </thead>
        <tbody>
          {PROFILE_ROWS.map((key) => {
            const parameter = findParameter(settings, key);
            if (!parameter) return null;
            const item = itemOfKey(key);
            const choices = choicesOf(item, parameter);
            const name = `${item.kind === 'mixer' ? `Mieszacz ${item.mixer}: ` : ''}${parameter.label ?? parameter.name}`;
            return (
              <tr key={key}>
                <td title={`zakres ${display(item, parameter, parameter.min)} – ${display(item, parameter, parameter.max)}`}>
                  {name}{parameter.unit && !choices ? ` [${parameter.unit}]` : ''}
                </td>
                {MODES.map(({ key: mode }) => (
                  <td key={mode}>
                    {choices ? (
                      <select value={values[mode][key] ?? ''} aria-label={`${name}: ${mode}`}
                        onChange={(event) => setValues({ ...values, [mode]: { ...values[mode], [key]: event.target.value } })}>
                        {choices.map((label, index) => <option key={label} value={String(index)}>{label}</option>)}
                      </select>
                    ) : (
                      <input type="number" step={parameter.step ?? 1} value={values[mode][key] ?? ''} aria-label={`${name}: ${mode}`}
                        onChange={(event) => setValues({ ...values, [mode]: { ...values[mode], [key]: event.target.value } })} />
                    )}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="boiler-hint">
        Te nastawy zleca przycisk „Pompa ciepła” / „Pellet” w Trybie pracy (tylko wartości różne od obecnych).
        CWU w każdym trybie ustawia harmonogram (zakładka Harmonogram).
      </div>
      {error && <div className="boiler-error">{error}</div>}
      {notice && <div className="boiler-hint">{notice}</div>}
      <div className="boiler-actions"><button type="submit" disabled={busy}>Zapisz nastawy</button></div>
    </form>
  );
};
