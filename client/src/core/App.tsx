// Szkielet aplikacji: router, strażnik wyboru sterownika (DeviceGuard), menu, trasy z rejestru
// rodzajów sterowników (device-types.tsx) i stopka „Aktywne urządzenie”. Montowany w index.tsx.
// Serwer: GET /api/devices (lista sterowników, sterownik domyślny isDefault).
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import { Header } from './components/Header';
import { Devices } from './pages/Devices';
import { Firmware } from './pages/Firmware';
import { deviceLabel, useDevice } from './context/DeviceContext';
import { Navigate, useLocation } from 'react-router-dom';
import { Fragment, useEffect, useState } from 'react';
import { DeviceRequests } from './api';
import { Device } from './types';
import { allDevicePaths, getDeviceTypeView } from './device-types';

// Po otwarciu aplikacji raz na sesję przeglądarki przechodzi do sterownika
// domyślnego z bazy; późniejsza zmiana w stopce obowiązuje do końca sesji.
const defaultAppliedKey = 'chpc.defaultApplied';

// porównanie pól pokazywanych w interfejsie; rootId jest już równy (szukany po nim)
const sameDevice = (a: Device, b: Device) =>
	a.deviceId === b.deviceId && a.name === b.name && a.deviceType === b.deviceType
	&& a.isDefault === b.isDefault;

// Strażnik: bez wybranego sterownika każda ścieżka poza /devices przekierowuje na listę
// z state.auto, a lista sama wybiera wtedy sterownik domyślny albo jedyny (pages/Devices).
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

	// tylko przy montowaniu (otwarcie aplikacji albo przeładowanie strony): gdy wybór był już
	// w localStorage, a w bazie domyślny jest inny sterownik, przełącza na domyślny. Bez wyboru
	// flaga nie jest ustawiana, bo domyślny wybierze strona /devices (state.auto).
	useEffect(() => {
		if (!device || sessionStorage.getItem(defaultAppliedKey)) return;
		sessionStorage.setItem(defaultAppliedKey, '1');
		DeviceRequests.getDevices().then((list) => {
			const preferred = list?.find((item) => item.isDefault);
			if (preferred && preferred.rootId !== device.rootId) selectDevice(preferred);
		});
	}, []);

	// /firmware/:deviceType wskazuje rodzaj w adresie, więc nie wymaga wyboru sterownika
	if (!device && location.pathname !== '/devices' && !location.pathname.startsWith('/firmware')) {
		return <Navigate to="/devices" replace state={{ auto: true }} />;
	}

	return <>{children}</>;
}

// Stała stopka z nazwą aktywnego sterownika i przejściem na /devices (zmiana sterownika).
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

// Widok ścieżki dla rodzaju wybranego sterownika (rejestr w device-types.tsx); ścieżka, której
// ten rodzaj nie ma (np. /schedules hydroforu), prowadzi na stronę główną. key daje stronie
// nowy stan po zmianie sterownika.
function DeviceRoute({ path }: { path: string }) {
	const { device } = useDevice();
	const view = getDeviceTypeView(device?.deviceType);
	const element = view.views.find((item) => item.path === path)?.element
		?? view.extraRoutes?.find((route) => route.path === path)?.element;
	if (!element) return <Navigate to="/" replace />;
	return <Fragment key={device?.rootId}>{element}</Fragment>;
}

// Na liście sterowników (/devices) nie ma menu: bez wybranego sterownika nie wiadomo, jakie widoki pokazać.
// Trasy powstają dla sumy ścieżek wszystkich rodzajów; który widok się pokaże, decyduje DeviceRoute.
function AppContent() {
	const location = useLocation();
	// bez menu: /devices (lista sterowników) i /firmware/:deviceType (firmware rodzaju sterownika)
	const isDeviceSelection = location.pathname === '/devices' || location.pathname.startsWith('/firmware');

	return (
		<DeviceGuard>
			<div className="app-container">
				{!isDeviceSelection && <header className="app-header">
					<Header />
				</header>}

				<main className="app-main">
				<Routes>
					<Route path="/devices" element={<Devices />} />
					<Route path="/firmware/:deviceType" element={<Firmware />} />
					{allDevicePaths().map((path) => (
						<Route key={path} path={path} element={<DeviceRoute path={path} />} />
					))}
				</Routes>
				</main>
				<DeviceFooter />
			</div>
		</DeviceGuard>
);
}

export function App() {
	return (
		<BrowserRouter>
			<AppContent />
		</BrowserRouter>
	);
  }
