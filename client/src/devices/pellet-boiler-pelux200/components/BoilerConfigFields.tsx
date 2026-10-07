// Definicja kotła w oknie „Dane sterownika” (DefinitionFields rejestru):
// - pompa ciepła, z którą kocioł pracuje w trybie „Pompa ciepła” (ładowanie CWU, cykl Zimy, stan „Praca”);
//   „brak” = kocioł tylko na pellecie: aplikacja nie pokazuje trybu pracy ani harmonogramu pompy ciepła. Serwer nie
//   pozwala odłączyć pompy, gdy kocioł jest w trybie „Pompa ciepła” (409 z komunikatem, pokazywanym w oknie);
// - połączenie z kotłem (od 2026-10-08): RS-485 (płytka na magistrali jako moduł ecoNET) albo ecoNET300 (płytka czyta
//   moduł ecoNET300 w sieci domowej pod podanym adresem; login i hasło modułu tylko na stronie /install płytki).
// Okno zapisuje zawsze komplet pól definicji.
import { useEffect, useState } from 'react';
import { DeviceRequests } from '../../../core/api';
import { BoilerConnection, Device, DeviceDefinitionFieldsProps, DeviceType } from '../../../core/types';

const IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

export function BoilerConfigFields({ device, onChange }: DeviceDefinitionFieldsProps) {
  const [heatPumpRootId, setHeatPumpRootId] = useState<string>(device.boilerConfig?.heatPumpRootId ?? '');
  const [connection, setConnection] = useState<BoilerConnection>(device.boilerConfig?.connection ?? 'rs485');
  const [econetIp, setEconetIp] = useState(device.boilerConfig?.econetIp ?? '');
  const [pumps, setPumps] = useState<Device[] | null>(null);

  useEffect(() => {
    let active = true;
    DeviceRequests.getDevices().then((devices) => {
      if (active) setPumps((devices ?? []).filter((item) => item.deviceType === DeviceType.HP));
    });
    return () => { active = false; };
  }, []);

  const ip = econetIp.trim();
  const ipValid = ip === '' ? connection !== 'econet300' : IPV4.test(ip);
  useEffect(() => {
    onChange(ipValid
      ? { boilerConfig: { heatPumpRootId: heatPumpRootId || null, connection, econetIp: ip || null } }
      : null);
  }, [heatPumpRootId, connection, ip, ipValid, onChange]);

  return (
    <>
      <label>
        <span>Pompa ciepła</span>
        <select value={heatPumpRootId} onChange={(event) => setHeatPumpRootId(event.currentTarget.value)} disabled={!pumps}>
          <option value="">brak (kocioł tylko na pellecie)</option>
          {pumps?.map((pump) => (
            <option key={pump.rootId} value={pump.rootId}>{pump.name || pump.deviceId}</option>
          ))}
        </select>
      </label>
      <label>
        <span>Połączenie z kotłem</span>
        <select value={connection} onChange={(event) => setConnection(event.currentTarget.value as BoilerConnection)}>
          <option value="rs485">RS-485 (płytka na magistrali kotła)</option>
          <option value="econet300">ecoNET300 (Wi-Fi, sieć domowa)</option>
        </select>
      </label>
      {connection === 'econet300' && (
        <label>
          <span>Adres IP ecoNET300</span>
          <input value={econetIp} inputMode="decimal" placeholder="np. 192.168.1.50"
            onChange={(event) => setEconetIp(event.currentTarget.value)} />
          {!ipValid && <small className="device-modal-error">Wpisz adres IPv4 modułu ecoNET300.</small>}
          <small>Login i hasło ecoNET300 wpisuje się na stronie /install płytki pieca. Moduł nie ma stałego adresu
            — ustaw rezerwację DHCP w routerze.</small>
        </label>
      )}
    </>
  );
}
