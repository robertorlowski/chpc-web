// Popup „Dane sterownika” (PUT /api/devices/:rootId) w wyglądzie „Instrument” (okno .modal z makiety
// makiety/src/makieta.html, #modal-dane-sterownika): nazwa, rodzaj, SN (Device ID) i Root ID tylko do odczytu oraz
// pola rodzaju sterownika (DefinitionFields z rejestru, np. konfiguracja pompy ciepła). Otwierany z kafelka na liście
// sterowników (pages/Devices) i z sekcji „Sterownik” w Ustawieniach. Zamykany przyciskiem Anuluj, ikoną zamknięcia,
// klawiszem Esc albo kliknięciem w tło.
import { FormEvent, useEffect, useState } from 'react';
import { DeviceRequests } from '../api';
import { getDeviceTypeView } from '../device-types';
import { Device, DeviceDefinition, DeviceType } from '../types';
import { ListIcon } from './DeviceTileCard';
import './deviceEditModal.css';

type Props = {
  device: Device;
  onClose: () => void;
  onSaved: (device: Device) => void;
};

// nazwa rodzaju w polu „Rodzaj”: z rejestru (label); rodzaje bez label mają nazwę tutaj
const TYPE_NAMES: Partial<Record<DeviceType, string>> = { [DeviceType.HP]: 'Pompa ciepła', [DeviceType.PHOTOVOLTAIC]: 'Fotowoltaika' };
const typeLabel = (device: Device) => getDeviceTypeView(device.deviceType).label ?? TYPE_NAMES[device.deviceType] ?? device.deviceType;

export function DeviceEditModal({ device, onClose, onSaved }: Props) {
  const [name, setName] = useState(device.name ?? '');
  // undefined = pola rodzaju bez zmian, null = pole z błędem (zapis zablokowany)
  const [definition, setDefinition] = useState<DeviceDefinition | null | undefined>(undefined);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const typeView = getDeviceTypeView(device.deviceType);
  const DefinitionFields = typeView.type === device.deviceType ? typeView.DefinitionFields : undefined;
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
      else setError('Nie udało się odczytać danych sterownika.');
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
      onSaved({ ...device, name: updated.name, pumpConfig: updated.pumpConfig, boilerConfig: updated.boilerConfig });
    } catch (caught) {
      // 409: serwer odrzucił definicję z powodem (np. kocioł w trybie „Pompa ciepła” przy odłączaniu pompy)
      const failure = caught as { status?: number; serverMessage?: string };
      setError(failure.status === 409 && failure.serverMessage ? failure.serverMessage : 'Nie udało się zapisać danych sterownika.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-layer device-modal-layer">
      <div className="scrim" onClick={onClose} />
      <form className="modal" role="dialog" aria-modal="true" aria-labelledby="device-modal-title" onSubmit={save}>
        <header className="modal-head">
          <h2 id="device-modal-title">Dane sterownika</h2>
          <button type="button" className="icon-btn sm" aria-label="Zamknij" onClick={onClose}><ListIcon name="close" /></button>
        </header>
        <div className="modal-body">
          <label className="field">
            <span>Nazwa</span>
            <input type="text" name="name" value={name} placeholder={device.deviceId} autoFocus onChange={(event) => setName(event.currentTarget.value)} />
          </label>
          <label className="field is-readonly">
            <span>Rodzaj</span>
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
          {error && <p className="device-modal-error" role="alert">{error}</p>}
        </div>
        <footer className="modal-foot">
          <button type="button" className="btn" onClick={onClose}>Anuluj</button>
          <button type="submit" className="btn btn-primary" disabled={saving || definition === null || (!!DefinitionFields && !fresh)}>{saving ? 'Zapisywanie…' : 'Zapisz'}</button>
        </footer>
      </form>
    </div>
  );
}
