import { createContext, ReactNode, useContext, useState } from 'react';
import { Device } from '../api/type';

const storageKey = 'chpc.selectedDevice';
const hideFooterStorageKey = 'chpc.hideDeviceFooter';

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
  hideDeviceFooter: boolean;
  selectDevice: (device: Device, hideFooter?: boolean) => void;
  clearDevice: () => void;
};

const DeviceContext = createContext<DeviceContextValue | null>(null);

export function DeviceProvider({ children }: { children: ReactNode }) {
  const [device, setDevice] = useState<Device | null>(readDevice);
  const [hideDeviceFooter, setHideDeviceFooter] = useState(() => localStorage.getItem(hideFooterStorageKey) === 'true');

  const selectDevice = (nextDevice: Device, hideFooter = false) => {
    localStorage.setItem(storageKey, JSON.stringify(nextDevice));
    localStorage.setItem(hideFooterStorageKey, String(hideFooter));
    setDevice(nextDevice);
    setHideDeviceFooter(hideFooter);
  };

  const clearDevice = () => {
    localStorage.removeItem(storageKey);
    localStorage.removeItem(hideFooterStorageKey);
    setDevice(null);
    setHideDeviceFooter(false);
  };

  return (
    <DeviceContext.Provider value={{ device, hideDeviceFooter, selectDevice, clearDevice }}>
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
