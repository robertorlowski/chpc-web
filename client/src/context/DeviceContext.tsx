import { createContext, ReactNode, useContext, useState } from 'react';
import { Device } from '../api/type';

const storageKey = 'chpc.selectedDevice';

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

export function getSelectedDevice(): Device | null {
  return readDevice();
}