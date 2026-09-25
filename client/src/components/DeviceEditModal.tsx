import { FormEvent, useEffect, useState } from 'react';
import { HpRequests } from '../api/api';
import { Device } from '../api/type';
import './deviceEditModal.css';

type Props = {
  device: Device;
  onClose: () => void;
  onSaved: (device: Device) => void;
};

// Popup „Dane sterownika”: Root ID i Device ID tylko do odczytu, edytowalna jest wyłącznie nazwa.
export function DeviceEditModal({ device, onClose, onSaved }: Props) {
  const [name, setName] = useState(device.name ?? '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const updated = await HpRequests.updateDeviceName(device.rootId, name.trim());
      onSaved({ ...device, name: updated.name });
    } catch {
      setError('Nie udało się zapisać nazwy.');
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
        {error && <p className="device-modal-error">{error}</p>}
        <div className="device-modal-actions">
          <button type="button" className="device-modal-cancel" onClick={onClose}>Anuluj</button>
          <button type="submit" disabled={saving}>{saving ? 'Zapisywanie…' : 'Zapisz'}</button>
        </div>
      </form>
    </div>
  );
}
