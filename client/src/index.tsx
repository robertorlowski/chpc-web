import "./style.css"
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import { Header } from './components/Header';
import { Settings } from "./pages/Settings";
import HP from "./pages/HP";
import { HeatPumpTable } from "./pages/Data"
import { HeatPumpChart  } from "./pages/Charts"
import { Schedules } from "./pages/Schedules";
import { Devices } from './pages/Devices';
import { DeviceProvider, deviceLabel, useDevice } from './context/DeviceContext';
import { Navigate, useLocation } from 'react-router-dom';
import { Fragment, useEffect, useState } from 'react';
import { DeviceRequests } from './core/api';
import { Device, DeviceType } from './core/types';
import { WaterHome } from './pages/WaterPressure/Home';
import { WaterData } from './pages/WaterPressure/Data';
import { WaterChart } from './pages/WaterPressure/Chart';
import { WaterSettings } from './pages/WaterPressure/Settings';

// Po otwarciu aplikacji raz na sesję przeglądarki przechodzi do sterownika
// domyślnego z bazy; późniejsza zmiana w stopce obowiązuje do końca sesji.
const defaultAppliedKey = 'chpc.defaultApplied';

const sameDevice = (a: Device, b: Device) =>
	a.deviceId === b.deviceId && a.name === b.name && a.deviceType === b.deviceType
	&& a.isDefault === b.isDefault;

function DeviceGuard({ children }: { children: React.ReactNode }) {
	const { device, selectDevice, clearDevice } = useDevice();
	const location = useLocation();

	// zapamiętany sterownik może nie istnieć w bazie (np. po przełączeniu z bazy lokalnej na produkcyjną);
	// wtedy każde żądanie kończy się 404, więc wybór jest czyszczony. Błąd sieci (null) niczego nie czyści.
	// Istniejący sterownik jest odświeżany z serwera, żeby w localStorage nie zostały stara nazwa czy deviceId.
	useEffect(() => {
		if (!device) return;
		DeviceRequests.getDevices().then((list) => {
			if (!list) return;
			const current = list.find((item) => item.rootId === device.rootId);
			if (!current) clearDevice();
			else if (!sameDevice(current, device)) selectDevice(current);
		});
	}, [device?.rootId]);

	useEffect(() => {
		if (!device || sessionStorage.getItem(defaultAppliedKey)) return;
		sessionStorage.setItem(defaultAppliedKey, '1');
		DeviceRequests.getDevices().then((list) => {
			const preferred = list?.find((item) => item.isDefault);
			if (preferred && preferred.rootId !== device.rootId) selectDevice(preferred);
		});
	}, []);

	if (!device && location.pathname !== '/devices') {
		return <Navigate to="/devices" replace state={{ auto: true }} />;
	}

	return <>{children}</>;
}

function DeviceFooter() {
	const { device } = useDevice();
	const [deviceCount, setDeviceCount] = useState<number | null>(null);

	// liczba sterowników z serwera przy każdym wyborze urządzenia: sterownik zarejestrowany
	// w międzyczasie od razu pokazuje stopkę z możliwością przełączenia
	useEffect(() => {
		if (!device) return;
		DeviceRequests.getDevices().then((list) => setDeviceCount(list ? list.length : null));
	}, [device?.rootId]);

	// przy jednym sterowniku nie ma na co przełączyć; do czasu odpowiedzi serwera stopka jest ukryta
	if (!device || deviceCount === null || deviceCount < 2) return null;

	return (
		<footer className="device-footer">
			<div className="device-footer-info">
				<span>Aktywne urządzenie</span>
				<strong>{deviceLabel(device)}</strong>
				{/* <small>Kod: {device.deviceId}</small> */}
			</div>
			<Link className="device-footer-change" to="/devices" aria-label="Zmień urządzenie" title="Zmień urządzenie">
				<svg viewBox="0 0 24 24" aria-hidden="true">
					<path d="M7 7h11l-3-3M18 7l-3 3M17 17H6l3 3M6 17l3-3" />
				</svg>
			</Link>
		</footer>
	);
}

// Widok zależny od typu wybranego sterownika; key daje stronie nowy stan po zmianie sterownika.
function ByType({ heatPump, waterPressure }: { heatPump: React.ReactElement; waterPressure: React.ReactElement }) {
	const { device } = useDevice();
	const element = device?.deviceType === DeviceType.WATER_PRESSURE ? waterPressure : heatPump;
	return <Fragment key={device?.rootId}>{element}</Fragment>;
}

function AppContent() {
	const location = useLocation();
	const isDeviceSelection = location.pathname === '/devices';

	return (
		<DeviceGuard>
			<div className="app-container">
				{!isDeviceSelection && <header className="app-header">
					<Header />
				</header>}

				<main className="app-main">
				<Routes>
					<Route path="/devices" element={<Devices />} />
					<Route path="/" element={<ByType heatPump={<HP />} waterPressure={<WaterHome />} />} />
					<Route path="/hp" element={<ByType heatPump={<HP />} waterPressure={<WaterHome />} />} />
					<Route path="/settings" element={<ByType heatPump={<Settings />} waterPressure={<WaterSettings />} />} />
					<Route path="/data" element={<ByType heatPump={<HeatPumpTable />} waterPressure={<WaterData />} />} />
					<Route path="/chart" element={<ByType heatPump={<HeatPumpChart />} waterPressure={<WaterChart />} />} />
					<Route path="/schedules" element={<ByType heatPump={<Schedules />} waterPressure={<Navigate to="/" replace />} />} />
				</Routes>
				</main>
				<DeviceFooter />
			</div>
		</DeviceGuard>
);
}

function App() {
	return (
		<BrowserRouter>
			<AppContent />
		</BrowserRouter>
	);
  }



const container = document.getElementById('root') as HTMLElement;
const root = createRoot(container);
root.render(
	<DeviceProvider>
		<App />
	</DeviceProvider>,
);
