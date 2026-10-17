import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { deviceLabel, useDevice } from "../context/DeviceContext";
import { useAuth } from "../context/AuthContext";
import { getDeviceTypeView } from "../device-types";
import { Device, DeviceTile, DeviceTiles, DeviceType } from "../types";
import { BackIcon, OperationsIcon } from "./icons";
import { UserMenu } from "./UserMenu";

// Pasek sterownika (App.tsx, strony poza /devices), wygląd „Instrument” z makiet/ (2026-10-16, linia .device-sub jak w
// makiecie 2026-10-17): strzałka powrotu do listy, nazwa sterownika, pod nią chip stanu (Online / Offline z pamięci
// kafelków listy, pulsująca kropka przy pracy), chip „pracuje” (sprężarka pompy, palenie w piecu) i opis zależny od
// rodzaju (DeviceSub), zakładki z rejestru rodzajów sterowników i konto. Zakładki rysuje <nav class="app-tabs">: na
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

// Kafelek wybranego sterownika z pamięci listy; odświeżany po zapisie listy (storage) i co 30 s.
function useDeviceTile(): DeviceTile | undefined {
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
	return tile;
}

// SN skrócony jak w makiecie: „A0B1…E4F5”
const shortSn = (sn: string) => (sn.length > 10 ? `${sn.slice(0, 4)}…${sn.slice(-4)}` : sn);
const plural = (n: number, one: string, few: string, many: string) =>
	`${n} ${n === 1 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? few : many}`;

// Opis pod nazwą zależny od rodzaju (makieta renderChrome: „tryb automatyczny · SN A0B1…E4F5”, „4 panele · DTU Hoymiles”,
// „2 przekaźniki · firmware 1.2.0”, „ecoMAX 860P2 · odczyt co 5 min”, „ostatnie uruchomienie 13:56”) z danych, które pasek
// ma: wybrany sterownik (nazwa, SN, firmware, ustawienia) i kafelek listy (tryb, panele, przekaźniki, stopka).
function deviceSubText(device: Device, tile: DeviceTile | undefined): string {
	const sn = `SN ${shortSn(device.deviceId)}`;
	switch (device.deviceType) {
		case DeviceType.HP: {
			const mode = tile?.row?.[0]?.value;
			return mode ? `tryb ${mode} · ${sn}` : sn;
		}
		case DeviceType.PHOTOVOLTAIC: {
			const panels = tile?.side?.find((fact) => fact.icon === 'panel')?.value.split('/').pop()?.trim();
			const count = panels ? Number(panels) : NaN;
			return `${Number.isFinite(count) ? plural(count, 'panel', 'panele', 'paneli') : sn} · DTU Hoymiles`;
		}
		case DeviceType.WATER_PRESSURE_TANK:
			return tile?.foot ?? sn;
		case DeviceType.SWITCH: {
			const relays = tile?.relays?.length;
			const firmware = device.firmwareVersion ? `firmware ${device.firmwareVersion}` : sn;
			return relays ? `${plural(relays, 'przekaźnik', 'przekaźniki', 'przekaźników')} · ${firmware}` : firmware;
		}
		case DeviceType.PELLET_BOILER_PELUX200: {
			const seconds = device.properties?.poll_interval_seconds;
			const poll = seconds ? `odczyt co ${seconds % 60 === 0 ? `${seconds / 60} min` : `${seconds} s`}` : sn;
			return `ecoMAX 860P2 · ${poll}`;
		}
		default:
			return sn;
	}
}

// Linia pod nazwą (makieta .device-sub): chip Online / Offline (przy pracy pulsująca kropka), przy pracy sprężarki albo
// paleniu w piecu chip stanu „pracuje” (.state.sub-run; czasu pracy kafelek nie podaje) i opis rodzaju po kropce.
function DeviceSub({ device }: { device: Device }) {
	const tile = useDeviceTile();
	const online = tile?.chip === 'Online';
	const level = online ? 'ok' : tile?.level === 'ok' ? 'off' : tile?.level;
	const runs = !!tile?.running && (device.deviceType === DeviceType.HP || device.deviceType === DeviceType.PELLET_BOILER_PELUX200);
	return (
		<span className="device-sub">
			{tile && (
				<>
					<span className={`chip chip-${level}${tile.running ? ' is-running' : ''}`} title={tile.running ? 'Pracuje' : undefined}>
						{(online || tile.running) && <i className="dot" />}{tile.chip}
					</span>
					{runs && <span className="state state-on sub-run" title={device.deviceType === DeviceType.HP ? 'Sprężarka pracuje' : 'Palenie'}><i className="dot" />pracuje</span>}
					<span className="sep">·</span>
				</>
			)}
			<span className="device-sub-text">{deviceSubText(device, tile)}</span>
		</span>
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
				{device && <DeviceSub device={device} />}
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
