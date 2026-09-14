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
import { DeviceProvider, useDevice } from './context/DeviceContext';
import { Navigate, useLocation } from 'react-router-dom';

function DeviceGuard({ children }: { children: React.ReactNode }) {
	const { device } = useDevice();
	const location = useLocation();

	if (!device && location.pathname !== '/devices') {
		return <Navigate to="/devices" replace />;
	}

	return <>{children}</>;
}

function DeviceFooter() {
	const { device, hideDeviceFooter } = useDevice();

	if (!device || hideDeviceFooter) return null;

	return (
		<footer className="device-footer">
			<div className="device-footer-info">
				<span>Aktywne urządzenie</span>
				<strong>{device.name}</strong>
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
