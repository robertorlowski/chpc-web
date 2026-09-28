import { DeviceType, DeviceTypeView } from '../../core/types';
import { ChartIcon, DataIcon, SettingsIcon } from '../../core/components/icons';
import { WaterHome } from './pages/Home';
import { WaterData } from './pages/Data';
import { WaterChart } from './pages/Chart';
import { WaterSettings } from './pages/Settings';

const DropIcon = () => (
	<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
		<path d="M12 3C12 3 5.5 10.2 5.5 14.5C5.5 18.1 8.4 21 12 21C15.6 21 18.5 18.1 18.5 14.5C18.5 10.2 12 3 12 3Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
	</svg>
);

// Hydrofor: podgląd, dane, wykres wody i ustawienia; bez harmonogramów.
export const waterPressureDeviceType: DeviceTypeView = {
	type: DeviceType.WATER_PRESSURE,
	tileIcon: (
		<svg className="device-selection-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
			<path d="M12 3C12 3 5.5 10.2 5.5 14.5C5.5 18.1 8.4 21 12 21C15.6 21 18.5 18.1 18.5 14.5C18.5 10.2 12 3 12 3Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
			<path d="M9 15C9 16.7 10.3 18 12 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
		</svg>
	),
	views: [
		{ path: '/', label: 'Hydrofor', icon: <DropIcon />, element: <WaterHome /> },
		{ path: '/data', label: 'Dane', icon: <DataIcon />, element: <WaterData /> },
		{ path: '/chart', label: 'Wykres', icon: <ChartIcon />, element: <WaterChart /> },
		{ path: '/settings', label: 'Ustawienia', icon: <SettingsIcon />, element: <WaterSettings /> },
	],
};
