import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { deviceLabel, useDevice } from "../context/DeviceContext";
import { useAuth } from "../context/AuthContext";
import { getDeviceTypeView } from "../device-types";
import { DeviceTile, DeviceTiles } from "../types";
import { BackIcon, OperationsIcon } from "./icons";
import { UserMenu } from "./UserMenu";

// Pasek sterownika (App.tsx, strony poza /devices), wygląd „Instrument” z makiet/ (2026-10-16): strzałka powrotu do listy,
// nazwa sterownika z chipem stanu (Online / Offline z pamięci kafelków listy, pulsująca kropka przy pracy sprężarki albo
// paleniu w piecu), zakładki z rejestru rodzajów sterowników i konto. Zakładki rysuje <nav class="app-tabs">: na
// komputerze (≥ 900 px) boczne menu po lewej, na telefonie ukryte — zamiast nich <BottomNav>: cztery pierwsze widoki
// i „Więcej” (arkusz z resztą widoków i listą sterowników).
// Stan kafelka: localStorage chpc.deviceTiles.<id konta> (pages/Devices zapisuje odpowiedź GET /api/devices/summary).

function readTile(userId: string | undefined, rootId: string | undefined): DeviceTile | undefined {
	if (!userId || !rootId) return undefined;
	try {
		const raw = localStorage.getItem(`chpc.deviceTiles.${userId}`);
		if (!raw) return undefined;
		return (JSON.parse(raw) as DeviceTiles)[rootId];
	} catch {
		return undefined;
	}
}

export function useDeviceViews() {
	const { device } = useDevice();
	const { views: allViews } = getDeviceTypeView(device?.deviceType);
	// sterownik udostępniony: w menu tylko udostępnione zakładki (konta użytkowników)
	return device?.access === 'shared' ? allViews.filter((view) => device.tabs?.includes(view.path)) : allViews;
}

// Chip stanu z pamięci kafelków: „Online” / „Offline”; przy pracy pulsująca kropka. Bez danych kafelka chipu nie ma.
function StatusChip() {
	const { device } = useDevice();
	const { user } = useAuth();
	const [tile, setTile] = useState<DeviceTile | undefined>(() => readTile(user?.id, device?.rootId));
	useEffect(() => {
		setTile(readTile(user?.id, device?.rootId));
		const refresh = () => setTile(readTile(user?.id, device?.rootId));
		window.addEventListener('storage', refresh);
		const timer = window.setInterval(refresh, 30000);
		return () => { window.removeEventListener('storage', refresh); window.clearInterval(timer); };
	}, [user?.id, device?.rootId]);
	if (!tile) return null;
	const online = tile.chip === 'Online';
	const level = online ? 'ok' : tile.level === 'ok' ? 'off' : tile.level;
	return (
		<>
			<span className={`chip chip-${level}${tile.running ? ' is-running' : ''}`} title={tile.running ? 'Pracuje' : undefined}>
				{(online || tile.running) && <i className="dot" />}{tile.chip}
			</span>
			<span className="sep">·</span>
		</>
	);
}

export function Header() {
	const location = useLocation();
	const { device } = useDevice();
	const views = useDeviceViews();
	return (
		<>
			<Link to="/devices" className="nav-back" title="Lista sterowników" aria-label="Wróć do listy sterowników">
				<BackIcon />
			</Link>
			<div className="device-title">
				<h1>{device ? deviceLabel(device) : 'Sterownik'}</h1>
				{device && (
					<span className="device-sub">
						<StatusChip />
						<span>SN {device.deviceId}</span>
					</span>
				)}
			</div>
			<nav className="app-tabs" aria-label="Widoki sterownika">
				{views.map((view) => (
					<Link key={view.path} to={view.path} title={view.label} aria-label={view.label}
						className={location.pathname === view.path ? 'active' : ''}>
						{view.icon}
						<span className="nav-label">{view.label}</span>
					</Link>
				))}
			</nav>
			{/* konto zalogowanego: po prawej stronie paska */}
			<UserMenu />
		</>
	);
}

// Dolna nawigacja telefonu: 4 pierwsze widoki + „Więcej” z resztą i listą sterowników (CSS ukrywa ją od 900 px).
export function BottomNav() {
	const location = useLocation();
	const views = useDeviceViews();
	const [open, setOpen] = useState(false);
	useEffect(() => { setOpen(false); }, [location.pathname]);
	useEffect(() => {
		if (!open) return;
		const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
		document.addEventListener('keydown', close);
		return () => document.removeEventListener('keydown', close);
	}, [open]);
	const first = views.slice(0, 4);
	const rest = views.slice(4);
	const restActive = rest.some((view) => view.path === location.pathname);
	return (
		<>
			<nav className="bottom-nav" aria-label="Widoki sterownika (telefon)">
				{first.map((view) => (
					<Link key={view.path} to={view.path} className={location.pathname === view.path ? 'active' : ''} aria-label={view.label}>
						{view.icon}
						<span>{view.label}</span>
					</Link>
				))}
				<button type="button" className={restActive ? 'active' : ''} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
					<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /></svg>
					<span>Więcej</span>
				</button>
			</nav>
			{open && (
				<>
					<div className="more-sheet-scrim" onClick={() => setOpen(false)} />
					<div className="more-sheet" role="menu">
						<div className="more-sheet-grip" />
						{rest.map((view) => (
							<Link key={view.path} to={view.path} role="menuitem" className={location.pathname === view.path ? 'active' : ''}>
								{view.icon}{view.label}
							</Link>
						))}
						{rest.length > 0 && <div className="more-sheet-sep" />}
						<Link to="/devices" role="menuitem"><OperationsIcon />Lista sterowników</Link>
					</div>
				</>
			)}
		</>
	);
}
