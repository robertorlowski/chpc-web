import { DeviceType, DeviceTypeModule, PumpConfig } from '../../core/types';
import { sendMessage } from '../../core/websocket';
import { clearManualOperation, getManualOperationData, setOperationData } from './services/operation.service';
import { plannedSchedulerOperations, runSchedulerOnce } from './services/scheduler.service';
import { appUserMeta } from '../../core/services/operation-log.service';
import { heatPumpTile } from './tile';

// Opis rodzaju „pompa ciepła” (heat_pump) dla rejestru core/device-types.ts.
// Pompa ciepła: ustawienia domyślne dostaje od schematu (work_mode = MANUAL),
// a operacje odbiera w odpowiedzi na /hp/add, nie przy zgłoszeniu.
// OTA od firmware co 1.1.0: oferta na zlecenie „Aktualizuj” w odpowiedzi /hp/add (hp.controller.ts).
// Nowa pompa dostaje od razu podłączenie CWU (bez pojemności zbiornika: pusta do czasu wpisania w oknie „Dane
// sterownika”). pvDtu = true, bo bez zapisanej definicji serwer mówił co „DTU jest” (pv_dtu = 1,
// controller-contract.service.ts): inaczej automatyczna definicja wyłączyłaby odczyt falownika.
export const INITIAL_PUMP_CONFIG: PumpConfig = { connection: 'cwu', pvDtu: true, pvForce: false };

export const heatPumpDeviceType: DeviceTypeModule = {
  initialPumpConfig: INITIAL_PUMP_CONFIG,
  tile: heatPumpTile,
  type: DeviceType.HP,
  firmwareUpdates: true,
  // Zapis ustawień domyślnych (Harmonogramy) nadpisuje ręczne ustawienia z Ustawień: ręczne
  // nadpisania znikają, scheduler od razu liczy operację z nowych wartości, a WebSocket budzi co.
  // Bez tego ręczne pole trzymało się bez końca, gdy żaden harmonogram się nie kończył
  // (produkcja 2026-10-04: ręczne CWU max 38 przy domyślnym 48). co trzyma ostatnią przysłaną
  // wartość, więc ręczne co_pomp "0" trzeba jawnie odwrócić na "1".
  // Dziennik operacji: zmiana operacji dla co z tym samym „kto” co zapis ustawień.
  onPropertiesSaved: async (rootId, meta = appUserMeta('Harmonogramy', 'Zapis ustawień domyślnych.')) => {
    const manual = getManualOperationData(rootId);
    clearManualOperation(rootId);
    const changed = { ...meta, reason: `${meta.reason ?? 'Zapis ustawień.'} Ręczne zmiany z Ustawień skasowane.` };
    await runSchedulerOnce(new Date(), rootId, changed);
    if (manual.co_pomp === '0') setOperationData(rootId, { co_pomp: '1' });
    sendMessage('operation', rootId);
  },
  // dziennik operacji: ustawienia domyślne (Harmonogramy) i tryb pracy
  propertyLabels: {
    work_mode: { label: 'Tryb pracy', values: { MANUAL: 'Ręczny', AUTO: 'Automatyczny', OFF: 'Wyłączony', M: 'Ręczny', A: 'Automatyczny', CWU: 'Automatyczny' } },
    temp_min: { label: 'Temperatura od', unit: '°C' },
    temp_max: { label: 'Temperatura do', unit: '°C' },
  },
  plannedOperations: plannedSchedulerOperations,
};
