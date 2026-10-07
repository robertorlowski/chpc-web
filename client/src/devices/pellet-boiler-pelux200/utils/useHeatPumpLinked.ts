// Czy wybrany kocioł ma powiązaną pompę ciepła (definicja kotła, okno „Dane sterownika”). Bez pompy aplikacja
// nie pokazuje trybu pracy (Pompa ciepła / Pellet), harmonogramu pompy ciepła ani „Praca: …” na stronie
// głównej — kocioł pracuje tylko na pellecie. undefined = jeszcze nie wiadomo (lista urządzeń się wczytuje).
import { useEffect, useState } from 'react';
import { DeviceRequests } from '../../../core/api';
import { useDevice } from '../../../core/context/DeviceContext';

export function useHeatPumpLinked(): boolean | undefined {
  const { device } = useDevice();
  const [linked, setLinked] = useState<boolean | undefined>(undefined);
  useEffect(() => {
    let active = true;
    DeviceRequests.getDevices().then((devices) => {
      const boiler = devices?.find((item) => item.rootId === device?.rootId);
      if (active && boiler) setLinked(!!boiler.boilerConfig?.heatPumpRootId);
    });
    return () => { active = false; };
  }, [device?.rootId]);
  return linked;
}
