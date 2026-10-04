// Opis rodzaju „pellet-boiler-pelux200” (kocioł pelletowy Plum Pellux 200, regulator ecoMAX) dla
// rejestru core/device-types.tsx: ikona płomienia na kafelku, menu i widoki. Ścieżki spoza listy
// prowadzą na stronę główną.
import { DeviceType, DeviceTypeView } from '../../core/types';
import { ChartIcon, DataIcon, SettingsIcon } from '../../core/components/icons';
import { ClockIcon, FLAME_PATH, FlameIcon } from './components/icons';
import { PelletBoilerHome } from './pages/Home';
import { PelletBoilerData } from './pages/Data';
import { PelletBoilerChart } from './pages/Chart';
import { PelletBoilerSchedules } from './pages/Schedules';
import { PelletBoilerSettings } from './pages/Settings';

// Kocioł pelletowy: podgląd, dane z dnia, wykres temperatur, harmonogram (sezon, CWU od–do) i ustawienia.
export const pelletBoilerDeviceType: DeviceTypeView = {
	type: DeviceType.PELLET_BOILER_PELUX200,
	tileIcon: (
		<svg className="device-selection-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
			<path d={FLAME_PATH} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
		</svg>
	),
	views: [
		{ path: '/', label: 'Kocioł', icon: <FlameIcon />, element: <PelletBoilerHome /> },
		{ path: '/data', label: 'Dane', icon: <DataIcon />, element: <PelletBoilerData /> },
		{ path: '/chart', label: 'Wykres', icon: <ChartIcon />, element: <PelletBoilerChart /> },
		{ path: '/schedules', label: 'Harmonogram', icon: <ClockIcon />, element: <PelletBoilerSchedules /> },
		{ path: '/settings', label: 'Ustawienia', icon: <SettingsIcon />, element: <PelletBoilerSettings /> },
	],
};
