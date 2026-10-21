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
import { useLang } from '../../../core/i18n';
import './style.css';

export const SwitchSettings: React.FC = () => {
  const { t } = useLang();
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
      return setNamesError(t('sw.set.nameTooLong'));
    }
    setNamesError('');
    await run(async () => { try {
      const changed = (relays ?? []).filter((relay) => (names[relay.relay] ?? '').trim() !== relay.name);
      await Promise.all(changed.map((relay) => SwitchRequests.renameRelay(relay.relay, (names[relay.relay] ?? '').trim())));
      setRelays((current) => current?.map((relay) => ({ ...relay, name: (names[relay.relay] ?? '').trim() })) ?? null);
      showNotice(t('sw.set.namesSaved'));
    } catch {
      setNamesError(t('sw.set.namesFailed'));
    } });
  };

  // Domyślny czas — całe properties ($set na serwerze).
  const saveMinutes = async (event: FormEvent) => {
    event.preventDefault();
    const minutes = Number(defaultMinutes);
    if (!Number.isInteger(minutes) || minutes < 0 || minutes > 10080) {
      return setMinutesError(t('sw.set.minutesInvalid'));
    }
    setMinutesError('');
    await run(async () => { try {
      if (minutes !== properties?.default_on_minutes) {
        setProperties(await DeviceRequests.updateDeviceProperties({ ...properties, default_on_minutes: minutes }));
      }
      showNotice(t('common.saved'));
    } catch {
      setMinutesError(t('sw.set.saveFailed'));
    } });
  };

  return (
    <div className="page page-device switch-page">
      <Notification message={notice} />
      <div className="grid-2 grid-settings">
        <div className="stack">
          <form className="card" onSubmit={saveNames}>
            <header className="card-head"><h2>{t('sw.relays')}</h2><span className="card-hint">{t('sw.set.namesHint')}</span></header>
            {relays === null && <p className="help">{t('common.loading')}</p>}
            {relays?.length === 0 && <p className="help">{t('sw.noRelays')}</p>}
            {relays && relays.length > 0 && (
              <div className="form-grid">
                {relays.map((relay) => (
                  <Fragment key={relay.relay}>
                    <label htmlFor={`sw-n${relay.relay}`}>{t('switch.relay', { n: relay.relay })}</label>
                    <div className="range-inputs">
                      <input type="text" id={`sw-n${relay.relay}`} className="w-text" maxLength={40}
                        placeholder={t('switch.relay', { n: relay.relay })} value={names[relay.relay] ?? ''}
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
              <button type="submit" className="btn btn-primary" disabled={!relays?.length || busy}>{t('sw.set.saveNames')}</button>
            </div>
          </form>

          <form className="card" onSubmit={saveMinutes}>
            <header className="card-head"><h2>{t('sw.home.onTime')}</h2><span className="card-hint">{t('sw.set.onTimeHint')}</span></header>
            <div className="form-grid">
              <label htmlFor="sw-def">{t('sw.set.defaultTime')}</label>
              <div className="range-inputs">
                <input type="number" id="sw-def" min={0} max={10080} value={defaultMinutes}
                  onChange={(event) => setDefaultMinutes(event.currentTarget.value)} />
                <span className="unit-txt">min</span>
              </div>
            </div>
            <p className="help">{t('sw.set.defaultTimeHelp')}</p>
            {minutesError && <p className="danger-text">{minutesError}</p>}
            <div className="actions">
              <button type="submit" className="btn btn-primary" disabled={properties === null || busy}>{t('common.save')}</button>
            </div>
          </form>
        </div>

        <div className="stack">
          {/* karta „Sterownik” z core: nazwa, SN, Root ID, adres IP, firmware i „Aktualizuj firmware”; tu dodatkowo liczba przekaźników */}
          <ControllerCard device={device} onEdit={() => setEditingDevice(true)}>
            <div><dt>{t('sw.relays')}</dt><dd>{relays?.length ?? '---'}</dd></div>
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
