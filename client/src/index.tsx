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
import { useEffect, useState } from 'react';
import { HpRequests } from './api/api';

function DeviceGuard({ children }: { children: React.ReactNode }) {
	const { device, clearDevice } = useDevice();
	const location = useLocation();

	// zapamiętany sterownik może nie istnieć w bazie (np. po przełączeniu z bazy lokalnej na produkcyjną);
	// wtedy każde żądanie kończy się 404, więc wybór jest czyszczony. Błąd sieci (null) niczego nie czyści.
	useEffect(() => {
		if (!device) return;
		HpRequests.getDevices().then((list) => {
			if (list && !list.some((item) => item.rootId === device.rootId)) clearDevice();
		});
	}, [device?.rootId]);

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
		HpRequests.getDevices().then((list) => setDeviceCount(list ? list.length : null));
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
					<Route path="/" element={<HP />} />
					<Route path="/hp" element={<HP />} />
					<Route path="/settings" element={<Settings />} />
					<Route path="/data" element={<HeatPumpTable />} />
					<Route path="/chart" element={<HeatPumpChart/>} />
					<Route path="/schedules" element={<Schedules />} />
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
