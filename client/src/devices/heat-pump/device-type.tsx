import { DeviceType, DeviceTypeView } from '../../core/types';
import { ChartIcon, DataIcon, SettingsIcon } from '../../core/components/icons';
import HP from './pages/Home';
import { HeatPumpTable } from './pages/Data';
import { HeatPumpChart } from './pages/Charts';
import { Settings } from './pages/Settings';
import { Schedules } from './pages/Schedules';

const HeatPumpIcon = () => (
	<svg x="0px" y="0px" width="25" height="25" fill="none" xmlns="http://www.w3.org/2000/svg" stroke="#ffffff">
		<path d="M11.0007 3C11.0007 3 9.86264 7.5 11.9313 12C14 16.5 13.5 21 13.5 21M18.9313 21C18.9313 21 19.6008 16.5 17.5007 13C15.4007 9.5 16.0007 6 16.0007 6M7.92989 21C7.92989 21 8.5993 16.5 6.49927 13C4.39924 9.5 4.99927 6 4.99927 6"
			stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
	</svg>
);

const ScheduleIcon = () => (
	<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
		<rect x="4" y="5" width="16" height="15" rx="2" stroke="currentColor" strokeWidth="2" />
		<path d="M8 3V7M16 3V7M4 10H20M8 14H10M12 14H14M16 14H18M8 17H10M12 17H14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
	</svg>
);

// Pompa ciepła (sterownik co): widok główny, dane, wykresy, ustawienia i harmonogramy.
export const heatPumpDeviceType: DeviceTypeView = {
	type: DeviceType.HP,
	tileIcon: (
		<svg className="device-selection-icon" viewBox="0 0 25 25" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
			<path d="M11.0007 3C11.0007 3 9.86264 7.5 11.9313 12C14 16.5 13.5 21 13.5 21M18.9313 21C18.9313 21 19.6008 16.5 17.5007 13C15.4007 9.5 16.0007 6 16.0007 6M7.92989 21C7.92989 21 8.5993 16.5 6.49927 13C4.39924 9.5 4.99927 6 4.99927 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	),
	views: [
		{ path: '/', label: 'HP', icon: <HeatPumpIcon />, element: <HP /> },
		{ path: '/data', label: 'Dane', icon: <DataIcon />, element: <HeatPumpTable /> },
		{ path: '/chart', label: 'Wykres', icon: <ChartIcon />, element: <HeatPumpChart /> },
		{ path: '/settings', label: 'Ustawienia', icon: <SettingsIcon />, element: <Settings /> },
		{ path: '/schedules', label: 'Harmonogram', icon: <ScheduleIcon />, element: <Schedules /> },
	],
	extraRoutes: [{ path: '/hp', element: <HP /> }],
};
