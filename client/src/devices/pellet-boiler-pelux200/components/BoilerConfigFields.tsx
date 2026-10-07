// Definicja kotła w oknie „Dane sterownika” (DefinitionFields rejestru): pompa ciepła, z którą kocioł pracuje
// w trybie „Pompa ciepła” (ładowanie CWU, cykl Zimy, stan „Praca”). „Brak” = kocioł tylko na pellecie: aplikacja
// nie pokazuje trybu pracy ani harmonogramu pompy ciepła. Serwer nie pozwala odłączyć pompy, gdy kocioł jest
// w trybie „Pompa ciepła” (409 z komunikatem, pokazywanym w oknie).
import { useEffect, useState } from 'react';
import { DeviceRequests } from '../../../core/api';
import { Device, DeviceDefinitionFieldsProps, DeviceType } from '../../../core/types';

export function BoilerConfigFields({ device, onChange }: DeviceDefinitionFieldsProps) {
  const [heatPumpRootId, setHeatPumpRootId] = useState<string>(device.boilerConfig?.heatPumpRootId ?? '');
  const [pumps, setPumps] = useState<Device[] | null>(null);

  useEffect(() => {
    let active = true;
    DeviceRequests.getDevices().then((devices) => {
      if (active) setPumps((devices ?? []).filter((item) => item.deviceType === DeviceType.HP));
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    onChange({ boilerConfig: { heatPumpRootId: heatPumpRootId || null } });
  }, [heatPumpRootId, onChange]);

  return (
    <label>
      <span>Pompa ciepła</span>
      <select value={heatPumpRootId} onChange={(event) => setHeatPumpRootId(event.currentTarget.value)} disabled={!pumps}>
        <option value="">brak (kocioł tylko na pellecie)</option>
        {pumps?.map((pump) => (
          <option key={pump.rootId} value={pump.rootId}>{pump.name || pump.deviceId}</option>
        ))}
      </select>
    </label>
  );
}
