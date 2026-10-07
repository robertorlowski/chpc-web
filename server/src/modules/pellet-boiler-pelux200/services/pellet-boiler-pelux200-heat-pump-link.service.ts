// Powiązanie kotła z pompą ciepła (od 2026-10-08): definicja kotła w oknie „Dane sterownika”
// (devices.boilerConfig.heatPumpRootId). Wybrana pompa dostaje ładowanie CWU, wymuszenie startu w cyklu Zimy
// i daje stan „Praca” kotła; wcześniej serwer brał pierwszą pompę heat_pump na koncie.
// Bez pompy (null) kocioł pracuje tylko na pellecie: tryb „Pompa ciepła” nie działa (effectiveBoilerMode
// zawsze 'pellet', także gdy nr 99 < 50 °C ustawiono na panelu), a aplikacja nie pokazuje trybu pracy.
// Pompy nie da się odłączyć, gdy odczyt ustawień pokazuje tryb „Pompa ciepła” (checkBoilerDefinition, 409).
import { DeviceModel } from '../../../core/models/device.model';
import { BoilerConfig, DefinitionConflictError, DeviceType } from '../../../core/types';
import { PelletBoilerSettingsEntry, PelletBoilerSettingsModel } from '../models/pellet-boiler-pelux200-settings.model';
import { PelletBoilerMode } from '../types';
import { boilerMode } from './pellet-boiler-pelux200-settings.service';

export const UNLINK_IN_HEAT_PUMP_MODE =
  'Kocioł pracuje w trybie Pompa ciepła — zmień tryb pracy na Pellet przed usunięciem pompy ciepła.';

// Root ID powiązanej pompy ciepła albo null (bez pompy albo pompa usunięta z konta).
export async function linkedHeatPumpRootId(rootId: string): Promise<string | null> {
  const device = await DeviceModel.findById(rootId).select('boilerConfig').lean<{ boilerConfig?: BoilerConfig }>();
  const heatPumpRootId = device?.boilerConfig?.heatPumpRootId ?? null;
  if (!heatPumpRootId) return null;
  return (await DeviceModel.exists({ _id: heatPumpRootId, deviceType: DeviceType.HP })) ? heatPumpRootId : null;
}

// Tryb, w którym kocioł faktycznie działa: z odczytu ustawień (nr 99), bez pompy ciepła zawsze Pellet.
export async function effectiveBoilerMode(
  rootId: string, settings: PelletBoilerSettingsEntry | null,
): Promise<PelletBoilerMode | null> {
  const mode = boilerMode(settings);
  if (mode !== 'heat-pump') return mode;
  return (await linkedHeatPumpRootId(rootId)) ? 'heat-pump' : 'pellet';
}

// checkDefinition rodzaju (core/device-types): odłączenie pompy tylko poza trybem „Pompa ciepła”.
export async function checkBoilerDefinition(rootId: string, definition: { boilerConfig?: BoilerConfig }) {
  if (!definition.boilerConfig || definition.boilerConfig.heatPumpRootId !== null) return;
  const settings = await PelletBoilerSettingsModel.findOne({ rootId }).lean<PelletBoilerSettingsEntry>();
  if (boilerMode(settings) === 'heat-pump') throw new DefinitionConflictError(UNLINK_IN_HEAT_PUMP_MODE);
}

// Nowy kocioł (zgłoszenie bez definicji): bez pompy ciepła.
export async function initBoilerDefinition(rootId: string) {
  await DeviceModel.updateOne(
    { _id: rootId, boilerConfig: { $exists: false } }, { $set: { boilerConfig: { heatPumpRootId: null } } });
}

// Przy starcie serwera: kotły sprzed powiązania (bez boilerConfig) dostają pierwszą pompę ciepła na koncie,
// tak jak działały dotąd; bez pompy — null.
export async function migrateBoilerDefinitions() {
  const boilers = await DeviceModel.find({ deviceType: DeviceType.PELLET_BOILER_PELUX200, boilerConfig: { $exists: false } })
    .select('_id').lean();
  if (boilers.length === 0) return;
  const heatPump = await DeviceModel.findOne({ deviceType: DeviceType.HP }).sort({ createdAt: 1 }).select('_id').lean();
  const heatPumpRootId = heatPump ? String(heatPump._id) : null;
  await DeviceModel.updateMany({ _id: { $in: boilers.map((b) => b._id) } }, { $set: { boilerConfig: { heatPumpRootId } } });
  console.log(`[pellet] powiązanie z pompą ciepła: kotłów ${boilers.length} → ${heatPumpRootId ?? 'bez pompy'}`);
}
