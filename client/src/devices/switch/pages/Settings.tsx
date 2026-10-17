// Zakładka Ustawienia włącznika (/settings), układ z makiety „Instrument” (#s-switch-ustawienia): po lewej karty
// „Przekaźniki” (nazwy, PUT /switch/relays/:relay) i „Czas włączenia” (default_on_minutes, PUT /device/properties),
// po prawej karta „Sterownik” z core (ControllerCard: nazwa, SN, Root ID, liczba przekaźników, adres IP i firmware
// z przyciskiem „Aktualizuj firmware”; ołówek otwiera popup „Dane sterownika”) i udostępnianie (DeviceSharing).
import { FormEvent, Fragment, useEffect, useState } from 'react';
import { DeviceRequests } from '../../../core/api';
import { DeviceProperties } from '../../../core/types';
import Notification, { useSaveNotice } from '../../../core/components/Notification';
import { DeviceEditModal } from '../../../core/components/DeviceEditModal';
import { ControllerCard } from '../../../core/components/ControllerCard';
import { DeviceSharing } from '../../../core/components/DeviceSharing';
import { useDevice } from '../../../core/context/DeviceContext';
import { SwitchRequests } from '../api';
import { SwitchRelay } from '../types';
import './style.css';

export const SwitchSettings: React.FC = () => {
  const { device, selectDevice } = useDevice();
  const [relays, setRelays] = useState<SwitchRelay[] | null>(null);
  const [names, setNames] = useState<Record<number, string>>({});
  const [properties, setProperties] = useState<DeviceProperties | null>(null);
  const [defaultMinutes, setDefaultMinutes] = useState('30');
  const [namesError, setNamesError] = useState('');
  const [minutesError, setMinutesError] = useState('');
  // przycisk zapisu nieaktywny w trakcie zapisu i dopóki widać komunikat (useSaveNotice)
  const { notice, showNotice, run, busy } = useSaveNotice();
  const [editingDevice, setEditingDevice] = useState(false);

  useEffect(() => {
    SwitchRequests.getRelays().then((result) => {
      setRelays(result ?? []);
      setNames(Object.fromEntries((result ?? []).map((relay) => [relay.relay, relay.name])));
    });
    DeviceRequests.getDeviceProperties().then((result) => {
      setProperties(result ?? {});
      setDefaultMinutes(String(result?.default_on_minutes ?? 30));
    });
  }, []);

  // Nazwy zmienione względem wczytanych.
  const saveNames = async (event: FormEvent) => {
    event.preventDefault();
    if (Object.values(names).some((name) => name.trim().length > 40)) {
      return setNamesError('Nazwa przekaźnika: najwyżej 40 znaków.');
    }
    setNamesError('');
    await run(async () => { try {
      const changed = (relays ?? []).filter((relay) => (names[relay.relay] ?? '').trim() !== relay.name);
      await Promise.all(changed.map((relay) => SwitchRequests.renameRelay(relay.relay, (names[relay.relay] ?? '').trim())));
      setRelays((current) => current?.map((relay) => ({ ...relay, name: (names[relay.relay] ?? '').trim() })) ?? null);
      showNotice('Nazwy zapisane.');
    } catch {
      setNamesError('Nie udało się zapisać nazw.');
    } });
  };

  // Domyślny czas — całe properties ($set na serwerze).
  const saveMinutes = async (event: FormEvent) => {
    event.preventDefault();
    const minutes = Number(defaultMinutes);
    if (!Number.isInteger(minutes) || minutes < 0 || minutes > 10080) {
      return setMinutesError('Domyślny czas: pełne minuty od 0 (bez limitu) do 10080 (7 dni).');
    }
    setMinutesError('');
    await run(async () => { try {
      if (minutes !== properties?.default_on_minutes) {
        setProperties(await DeviceRequests.updateDeviceProperties({ ...properties, default_on_minutes: minutes }));
      }
      showNotice('Zapisano.');
    } catch {
      setMinutesError('Nie udało się zapisać ustawień.');
    } });
  };

  return (
    <div className="page page-device switch-page">
      <Notification message={notice} />
      <div className="grid-2 grid-settings">
        <div className="stack">
          <form className="card" onSubmit={saveNames}>
            <header className="card-head"><h2>Przekaźniki</h2><span className="card-hint">nazwy do 40 znaków</span></header>
            {relays === null && <p className="help">Wczytywanie…</p>}
            {relays?.length === 0 && <p className="help">Sterownik nie zgłosił jeszcze przekaźników.</p>}
            {relays && relays.length > 0 && (
              <div className="form-grid">
                {relays.map((relay) => (
                  <Fragment key={relay.relay}>
                    <label htmlFor={`sw-n${relay.relay}`}>Przekaźnik {relay.relay}</label>
                    <div className="range-inputs">
                      <input type="text" id={`sw-n${relay.relay}`} className="w-text" maxLength={40}
                        placeholder={`Przekaźnik ${relay.relay}`} value={names[relay.relay] ?? ''}
                        onChange={(event) => {
                          // wartość odczytana od razu: w funkcji aktualizującej stan currentTarget jest już null
                          const value = event.currentTarget.value;
                          setNames((current) => ({ ...current, [relay.relay]: value }));
                        }} />
                    </div>
                  </Fragment>
                ))}
              </div>
            )}
            {namesError && <p className="danger-text">{namesError}</p>}
            <div className="actions">
              <button type="submit" className="btn btn-primary" disabled={!relays?.length || busy}>Zapisz nazwy</button>
            </div>
          </form>

          <form className="card" onSubmit={saveMinutes}>
            <header className="card-head"><h2>Czas włączenia</h2><span className="card-hint">podpowiedź dla „Włącz”</span></header>
            <div className="form-grid">
              <label htmlFor="sw-def">Domyślny czas</label>
              <div className="range-inputs">
                <input type="number" id="sw-def" min={0} max={10080} value={defaultMinutes}
                  onChange={(event) => setDefaultMinutes(event.currentTarget.value)} />
                <span className="unit-txt">min</span>
              </div>
            </div>
            <p className="help">0 = bez limitu, najwyżej 10 080 min (7 dni). Na stronie sterownika obowiązuje po jego restarcie.</p>
            {minutesError && <p className="danger-text">{minutesError}</p>}
            <div className="actions">
              <button type="submit" className="btn btn-primary" disabled={properties === null || busy}>Zapisz</button>
            </div>
          </form>
        </div>

        <div className="stack">
          {/* karta „Sterownik” z core: nazwa, SN, Root ID, adres IP, firmware i „Aktualizuj firmware”; tu dodatkowo liczba przekaźników */}
          <ControllerCard device={device} onEdit={() => setEditingDevice(true)}>
            <div><dt>Przekaźniki</dt><dd>{relays?.length ?? '---'}</dd></div>
          </ControllerCard>
          {/* udostępnianie sterownika (tylko właściciel; konta użytkowników) */}
          {device && <DeviceSharing device={device} />}
        </div>
      </div>

      {editingDevice && device && (
        <DeviceEditModal
          device={device}
          onClose={() => setEditingDevice(false)}
          onSaved={(updated) => { selectDevice(updated); setEditingDevice(false); }}
        />
      )}
    </div>
  );
};
