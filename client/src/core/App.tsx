// Szkielet aplikacji: router, logowanie (AuthGate: konta użytkowników od 2026-10-11), strażnik wyboru sterownika
// (DeviceGuard), menu, trasy z rejestru rodzajów sterowników (device-types.tsx) i stopka „Aktywne urządzenie”.
// Montowany w index.tsx.
// Serwer: GET /api/devices (lista sterowników). Sterownika domyślnego ani automatycznego wyboru nie ma.
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import { Header } from './components/Header';
import { DEVICES_HEADER_ACTIONS_ID, Devices } from './pages/Devices';
import { Firmware } from './pages/Firmware';
import { deviceLabel, useDevice } from './context/DeviceContext';
import { Navigate, useLocation } from 'react-router-dom';
import { Fragment, useEffect, useState } from 'react';
import { DeviceRequests } from './api';
import { Device } from './types';
import { allDevicePaths, getDeviceTypeView } from './device-types';
import { useAuth } from './context/AuthContext';
import { Login } from './pages/Login';
import { Account, DeleteAccountConfirm } from './pages/Account';
import { ProfileForm } from './components/ProfileForm';
import { RememberDialog } from './components/RememberDialog';
import { UserMenu } from './components/UserMenu';
import { BackIcon } from './components/icons';
import './components/account.css';

// Klucz sesji przeglądarki: otwarcie aplikacji zawsze zaczyna od listy kafelków (/devices), także gdy w
// localStorage został wybrany sterownik; późniejsze przeładowania w tej samej sesji zostają na bieżącej stronie.
const startedKey = 'chpc.startedOnList';

// porównanie pól pokazywanych w interfejsie; rootId jest już równy (szukany po nim)
// (z kontami także dostęp i zakładki udostępnienia, bo od nich zależy menu)
const sameDevice = (a: Device, b: Device) =>
	a.deviceId === b.deviceId && a.name === b.name && a.deviceType === b.deviceType
	&& a.access === b.access && JSON.stringify(a.tabs ?? null) === JSON.stringify(b.tabs ?? null);

// Bez sesji: ekran logowania (każda ścieżka; link z maila to /login?token=…). Nowe konto: formularz danych
// (imię, nazwisko, kraj obowiązkowe). Po zalogowaniu kodem albo linkiem: pytanie o zapamiętanie na 7 dni.
// /account/delete?token=… (link usunięcia konta z maila) działa także bez zalogowania.
function AuthGate({ children }: { children: React.ReactNode }) {
	const { status, user, askRemember, retry, setUser } = useAuth();
	const location = useLocation();
	if (location.pathname === '/account/delete') return <DeleteAccountConfirm />;
	if (status === 'loading') return <p className="app-loading">Ładowanie…</p>;
	if (status === 'offline') {
		return (
			<div className="app-loading">
				<p>Brak połączenia z serwerem.</p>
				<button type="button" onClick={retry}>Spróbuj ponownie</button>
			</div>
		);
	}
	if (status === 'anonymous' || !user) {
		return (
			<>
				<header className="app-header app-header-plain"><span>Logowanie</span></header>
				<main className="app-main"><Login /></main>
			</>
		);
	}
	if (!user.profileComplete) {
		return (
			<>
				<header className="app-header app-header-plain"><span>Nowe konto</span><UserMenu /></header>
				<main className="app-main">
					<div className="account-page account-narrow">
						<h1>Uzupełnij dane</h1>
						<p className="account-lead">Pola z * są obowiązkowe.</p>
						<ProfileForm user={user} onSaved={setUser} />
					</div>
				</main>
			</>
		);
	}
	return <>{children}{askRemember && <RememberDialog />}</>;
}

// Pasek pod menu sterownika udostępnionego przez inną osobę: kto udostępnił i które zakładki.
function SharedBanner() {
	const { device } = useDevice();
	if (device?.access !== 'shared') return null;
	const views = getDeviceTypeView(device.deviceType).views;
	const tabs = (device.tabs ?? []).map((path) => path === '/' ? 'Podgląd' : views.find((view) => view.path === path)?.label ?? path);
	return <div className="shared-banner">Udostępnione przez {device.owner?.name ?? 'innego użytkownika'} · dostęp: {tabs.join(', ')}</div>;
}

// Strażnik: bez wybranego sterownika każda ścieżka poza /devices przekierowuje na listę kafelków (pages/Devices).
function DeviceGuard({ children }: { children: React.ReactNode }) {
	const { device, selectDevice, clearDevice } = useDevice();
	const location = useLocation();
	const [startOnList, setStartOnList] = useState(() => {
		if (sessionStorage.getItem(startedKey)) return false;
		sessionStorage.setItem(startedKey, '1');
		return location.pathname === '/';
	});
	// po przejściu na /devices przekierowanie startowe jest zużyte; bez tego strażnik zwracałby samo <Navigate>
	// zamiast stron i pierwsze wejście dawało pustą aplikację aż do odświeżenia (błąd z 2026-10-08)
	useEffect(() => {
		if (location.pathname !== '/') setStartOnList(false);
	}, [location.pathname]);

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

	if (startOnList && location.pathname === '/') return <Navigate to="/devices" replace />;

	// /firmware/:deviceType wskazuje rodzaj w adresie, a /account to dane konta: bez wyboru sterownika
	if (!device && location.pathname !== '/devices' && !location.pathname.startsWith('/firmware') && !location.pathname.startsWith('/account')) {
		return <Navigate to="/devices" replace />;
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
	// sterownik udostępniony: tylko wybrane zakładki (/hp to widok główny pompy, jak /)
	if (device?.access === 'shared') {
		const tabs = device.tabs ?? [];
		if (!tabs.includes(path === '/hp' ? '/' : path)) {
			const first = view.views.find((item) => tabs.includes(item.path));
			return first && first.path !== path ? <Navigate to={first.path} replace /> : <p className="app-loading">Brak dostępu do tej zakładki.</p>;
		}
	}
	return <Fragment key={device?.rootId}>{element}</Fragment>;
}

// Na liście sterowników (/devices) nie ma menu: bez wybranego sterownika nie wiadomo, jakie widoki pokazać.
// Trasy powstają dla sumy ścieżek wszystkich rodzajów; który widok się pokaże, decyduje DeviceRoute.
function AppContent() {
	const location = useLocation();
	// bez menu: /devices (lista sterowników) i /firmware/:deviceType (firmware rodzaju sterownika)
	const isDeviceSelection = location.pathname === '/devices' || location.pathname.startsWith('/firmware') || location.pathname.startsWith('/account');

	return (
		<DeviceGuard>
			<div className="app-container">
				{!isDeviceSelection && <header className="app-header">
					<Header />
				</header>}
				{/* /devices: sam pasek w kolorze menu (bez pozycji menu, bo nie wybrano sterownika) */}
				{location.pathname === '/devices' && <header className="app-header app-header-plain">
					<span>Lista sterowników</span>
					{/* miejsce na przyciski strony (trybik „Zmień kolejność” wstawia tu pages/Devices) */}
					<span id={DEVICES_HEADER_ACTIONS_ID} className="app-header-actions" />
					<UserMenu />
				</header>}
				{location.pathname.startsWith('/account') && <header className="app-header app-header-plain">
					<Link to="/devices" className="nav-back" title="Lista urządzeń" aria-label="Wróć do listy urządzeń"><BackIcon /></Link>
					<span>Moje dane</span>
					<UserMenu />
				</header>}

				<main className="app-main">
				{/* w treści strony, nie pod stałym nagłówkiem */}
				{!isDeviceSelection && <SharedBanner />}
				<Routes>
					<Route path="/devices" element={<Devices />} />
					<Route path="/account" element={<Account />} />
					{/* link z maila po zalogowaniu (adres zostaje /login): lista sterowników */}
					<Route path="/login" element={<Navigate to="/devices" replace />} />
					<Route path="/firmware/:deviceType" element={<Firmware />} />
					{allDevicePaths().map((path) => (
						<Route key={path} path={path} element={<DeviceRoute path={path} />} />
					))}
				</Routes>
				</main>
				{/* na /devices własna stopka z zajętością bazy; „Aktywne urządzenie” prowadzi tutaj, więc jej nie ma */}
				{location.pathname !== '/devices' && <DeviceFooter />}
			</div>
		</DeviceGuard>
);
}

export function App() {
	return (
		<BrowserRouter>
			<AuthGate>
				<AppContent />
			</AuthGate>
		</BrowserRouter>
	);
  }
