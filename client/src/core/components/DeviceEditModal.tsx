// Popup „Dane sterownika” (PUT /api/devices/:rootId) w wyglądzie „Instrument” (okno .modal z makiety
// makiety/src/makieta.html, #modal-dane-sterownika): nazwa, rodzaj, SN (Device ID) i Root ID tylko do odczytu oraz
// pola rodzaju sterownika (DefinitionFields z rejestru, np. konfiguracja pompy ciepła) i przełącznik „Kafelek prosty”
// (rodzaje z SimpleTile w rejestrze, np. włącznik; tylko na tym koncie, PUT {simple}). Otwierany z kafelka na liście
// sterowników (pages/Devices) i z sekcji „Sterownik” w Ustawieniach. Zamykany przyciskiem Anuluj, ikoną zamknięcia,
// klawiszem Esc albo kliknięciem w tło.
import { FormEvent, useEffect, useState } from 'react';
import { DeviceRequests } from '../api';
import { getDeviceTypeView } from '../device-types';
import { Device, DeviceDefinition } from '../types';
import { useLang } from '../i18n';
import { ListIcon } from './DeviceTileCard';
import './deviceEditModal.css';

type Props = {
  device: Device;
  onClose: () => void;
  onSaved: (device: Device) => void;
};

export function DeviceEditModal({ device, onClose, onSaved }: Props) {
  const { t } = useLang();
  // nazwa rodzaju w polu „Rodzaj”: słownik type.<rodzaj> (core/i18n)
  const typeLabel = (item: Device) => t(`type.${item.deviceType}`);
  const [name, setName] = useState(device.name ?? '');
  // undefined = pola rodzaju bez zmian, null = pole z błędem (zapis zablokowany)
  const [definition, setDefinition] = useState<DeviceDefinition | null | undefined>(undefined);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const typeView = getDeviceTypeView(device.deviceType);
  const DefinitionFields = typeView.type === device.deviceType ? typeView.DefinitionFields : undefined;
  // „Kafelek prosty”: tylko rodzaje z kafelkiem prostym; zapis osobno (układ konta), gdy się zmienił
  const simpleAvailable = typeView.type === device.deviceType && !!typeView.SimpleTile;
  const [simple, setSimple] = useState(!!device.simple);
  // pola rodzaju startują z bazy, nie z zapamiętanego wyboru (localStorage może nie mieć np. pumpConfig),
  // inaczej zapis samej nazwy nadpisałby je wartościami domyślnymi
  const [fresh, setFresh] = useState<Device | null>(null);

  useEffect(() => {
    if (!DefinitionFields) return;
    let active = true;
    DeviceRequests.getDevices().then((devices) => {
      const found = devices?.find((item) => item.rootId === device.rootId);
      if (!active) return;
      if (found) setFresh(found);
      else setError(t('deviceEdit.loadFailed'));
    });
    return () => { active = false; };
  }, [DefinitionFields, device.rootId]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (definition === null || (DefinitionFields && !fresh)) return;
    setSaving(true);
    setError('');
    try {
      // pusta nazwa jest dozwolona (wraca wyświetlanie deviceId); onSaved dostaje całe urządzenie
      const updated = await DeviceRequests.updateDevice(device.rootId, { name: name.trim(), ...definition });
      if (simpleAvailable && simple !== !!device.simple) await DeviceRequests.setDeviceSimple(device.rootId, simple);
      onSaved({ ...device, name: updated.name, pumpConfig: updated.pumpConfig, boilerConfig: updated.boilerConfig, simple: simpleAvailable ? simple : device.simple });
    } catch (caught) {
      // 409: serwer odrzucił definicję z powodem (np. kocioł w trybie „Pompa ciepła” przy odłączaniu pompy)
      const failure = caught as { status?: number; serverMessage?: string };
      setError(failure.status === 409 && failure.serverMessage ? failure.serverMessage : t('deviceEdit.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-layer device-modal-layer">
      <div className="scrim" onClick={onClose} />
      <form className="modal" role="dialog" aria-modal="true" aria-labelledby="device-modal-title" onSubmit={save}>
        <header className="modal-head">
          <h2 id="device-modal-title">{t('deviceEdit.title')}</h2>
          <button type="button" className="icon-btn sm" aria-label={t('common.close')} onClick={onClose}><ListIcon name="close" /></button>
        </header>
        <div className="modal-body">
          <label className="field">
            <span>{t('deviceEdit.name')}</span>
            <input type="text" name="name" value={name} placeholder={device.deviceId} autoFocus onChange={(event) => setName(event.currentTarget.value)} />
          </label>
          <label className="field is-readonly">
            <span>{t('deviceEdit.type')}</span>
            <input type="text" value={`${typeLabel(device)} (${device.deviceType})`} readOnly />
          </label>
          <label className="field is-readonly">
            <span>SN (Device ID)</span>
            <input type="text" value={device.deviceId} readOnly />
          </label>
          <label className="field is-readonly">
            <span>Root ID</span>
            <input type="text" value={device.rootId} readOnly />
          </label>
          {/* pola rodzaju mają własne style pod .device-modal (np. devices/heat-pump/components/pumpConfig.css) */}
          {DefinitionFields && fresh && <div className="device-modal device-modal-embedded"><DefinitionFields device={fresh} onChange={setDefinition} /></div>}
          {simpleAvailable && (
            <label className="check">
              <input type="checkbox" checked={simple} onChange={(event) => setSimple(event.currentTarget.checked)} />
              <span>{t('deviceEdit.simple')}</span>
              <small>{t('deviceEdit.simpleHint')}</small>
            </label>
          )}
          {error && <p className="device-modal-error" role="alert">{error}</p>}
        </div>
        <footer className="modal-foot">
          <button type="button" className="btn" onClick={onClose}>{t('common.cancel')}</button>
          <button type="submit" className="btn btn-primary" disabled={saving || definition === null || (!!DefinitionFields && !fresh)}>{saving ? t('common.saving') : t('common.save')}</button>
        </footer>
      </form>
    </div>
  );
}
