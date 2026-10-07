// Definicja wybranego kotła (okno „Dane sterownika”) dla widoków:
// - useHeatPumpLinked: czy kocioł ma powiązaną pompę ciepła. Bez pompy aplikacja nie pokazuje trybu pracy
//   (Pompa ciepła / Pellet), harmonogramu pompy ciepła ani „Praca: …” — kocioł pracuje tylko na pellecie;
// - useBoilerConnection: połączenie z kotłem (rs485 / econet300); przy ecoNET300 płytka podaje tylko zadaną
//   kotła i CWU, więc Ustawienia wyjaśniają brak pozostałych nastaw.
// undefined = jeszcze nie wiadomo (lista urządzeń się wczytuje).
import { useEffect, useState } from 'react';
import { DeviceRequests } from '../../../core/api';
import { useDevice } from '../../../core/context/DeviceContext';
import { BoilerConfig } from '../../../core/types';

function useBoilerConfig(): BoilerConfig | null | undefined {
  const { device } = useDevice();
  const [config, setConfig] = useState<BoilerConfig | null | undefined>(undefined);
  useEffect(() => {
    let active = true;
    DeviceRequests.getDevices().then((devices) => {
      const boiler = devices?.find((item) => item.rootId === device?.rootId);
      if (active && boiler) setConfig(boiler.boilerConfig ?? null);
    });
    return () => { active = false; };
  }, [device?.rootId]);
  return config;
}

export function useHeatPumpLinked(): boolean | undefined {
  const config = useBoilerConfig();
  return config === undefined ? undefined : !!config?.heatPumpRootId;
}

export function useBoilerConnection() {
  const config = useBoilerConfig();
  return config === undefined ? undefined : (config?.connection ?? 'rs485');
}
