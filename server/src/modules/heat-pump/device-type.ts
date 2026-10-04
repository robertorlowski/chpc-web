import { DeviceType, DeviceTypeModule } from '../../core/types';
import { sendMessage } from '../../core/websocket';
import { clearManualOperation, getManualOperationData, setOperationData } from './services/operation.service';
import { runSchedulerOnce } from './services/scheduler.service';

// Opis rodzaju „pompa ciepła” (heat_pump) dla rejestru core/device-types.ts.
// Pompa ciepła: ustawienia domyślne dostaje od schematu (work_mode = CWU),
// a operacje odbiera w odpowiedzi na /hp/add, nie przy zgłoszeniu.
export const heatPumpDeviceType: DeviceTypeModule = {
  type: DeviceType.HP,
  // Zapis ustawień domyślnych (Harmonogramy) nadpisuje ręczne ustawienia z Ustawień: ręczne
  // nadpisania znikają, scheduler od razu liczy operację z nowych wartości, a WebSocket budzi co.
  // Bez tego ręczne pole trzymało się bez końca, gdy żaden harmonogram się nie kończył
  // (produkcja 2026-10-04: ręczne CWU max 38 przy domyślnym 48). co trzyma ostatnią przysłaną
  // wartość, więc ręczne co_pomp "0" trzeba jawnie odwrócić na "1".
  onPropertiesSaved: async (rootId) => {
    const manual = getManualOperationData(rootId);
    clearManualOperation(rootId);
    await runSchedulerOnce(new Date(), rootId);
    if (manual.co_pomp === '0') setOperationData(rootId, { co_pomp: '1' });
    sendMessage('operation', rootId);
  },
};
