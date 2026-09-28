// Kontekst wybranego sterownika: stan React + kopia w localStorage (klucz chpc.selectedDevice),
// żeby wybór przetrwał przeładowanie strony. DeviceProvider opakowuje aplikację w index.tsx;
// http.ts czyta wybór przez getSelectedDevice, żeby dopisać rootId i deviceId do zapytań.
import { createContext, ReactNode, useContext, useState } from 'react';
import { Device } from '../types';

const storageKey = 'chpc.selectedDevice';

// uszkodzony JSON w localStorage traktowany jak brak wyboru (strażnik przekieruje na /devices)

const readDevice = (): Device | null => {
  try {
    const value = localStorage.getItem(storageKey);
    return value ? JSON.parse(value) as Device : null;
  } catch {
    return null;
  }
};

type DeviceContextValue = {
  device: Device | null;
  selectDevice: (device: Device) => void;
  clearDevice: () => void;
};

const DeviceContext = createContext<DeviceContextValue | null>(null);

export function DeviceProvider({ children }: { children: ReactNode }) {
  const [device, setDevice] = useState<Device | null>(readDevice);

  const selectDevice = (nextDevice: Device) => {
    localStorage.setItem(storageKey, JSON.stringify(nextDevice));
    setDevice(nextDevice);
  };

  const clearDevice = () => {
    localStorage.removeItem(storageKey);
    setDevice(null);
  };

  return (
    <DeviceContext.Provider value={{ device, selectDevice, clearDevice }}>
      {children}
    </DeviceContext.Provider>
  );
}

export function useDevice() {
  const value = useContext(DeviceContext);
  if (!value) throw new Error('useDevice musi być użyty wewnątrz DeviceProvider.');
  return value;
}

// Odczyt poza komponentami (http.ts, WebSocket w widoku pompy); zawsze wprost z localStorage.
export function getSelectedDevice(): Device | null {
  return readDevice();
}

// Nazwa sterownika, a gdy jej nie nadano (rejestracja automatyczna) — deviceId.
export function deviceLabel(device: Pick<Device, 'name' | 'deviceId'>): string {
  return device.name?.trim() || device.deviceId;
}
