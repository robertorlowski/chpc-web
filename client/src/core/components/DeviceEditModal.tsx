// Popup „Dane sterownika” (PUT /api/devices/:rootId): nazwa i pola rodzaju sterownika
// (DefinitionFields z rejestru, np. konfiguracja pompy ciepła). Otwierany z kafelka
// na liście sterowników (pages/Devices) i z sekcji „Sterownik” w Ustawieniach.
// Zamykany przyciskiem Anuluj, klawiszem Esc albo kliknięciem w tło.
import { FormEvent, useEffect, useState } from 'react';
import { DeviceRequests } from '../api';
import { getDeviceTypeView } from '../device-types';
import { Device, DeviceDefinition } from '../types';
import './deviceEditModal.css';

type Props = {
  device: Device;
  onClose: () => void;
  onSaved: (device: Device) => void;
};

// Root ID i Device ID tylko do odczytu; edytowalne są nazwa i pola rodzaju.
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
      onSaved({ ...device, name: updated.name, pumpConfig: updated.pumpConfig });
    } catch {
      setError('Nie udało się zapisać danych sterownika.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="device-modal-backdrop" onClick={onClose}>
      <form
        className="device-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="device-modal-title"
        onClick={(event) => event.stopPropagation()}
        onSubmit={save}
      >
        <h2 id="device-modal-title">Dane sterownika</h2>
        <label>
          <span>Root ID</span>
          <input value={device.rootId} disabled />
        </label>
        <label>
          <span>Device ID</span>
          <input value={device.deviceId} disabled />
        </label>
        <label>
          <span>Nazwa sterownika</span>
          <input
            name="name"
            value={name}
            placeholder={device.deviceId}
            autoFocus
            onChange={(event) => setName(event.currentTarget.value)}
          />
        </label>
        {DefinitionFields && fresh && <DefinitionFields device={fresh} onChange={setDefinition} />}
        {error && <p className="device-modal-error">{error}</p>}
        <div className="device-modal-actions">
          <button type="button" className="device-modal-cancel" onClick={onClose}>Anuluj</button>
          <button type="submit" disabled={saving || definition === null || (!!DefinitionFields && !fresh)}>{saving ? 'Zapisywanie…' : 'Zapisz'}</button>
        </div>
      </form>
    </div>
  );
}
