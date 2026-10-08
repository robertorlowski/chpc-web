import { Link, useLocation } from "react-router-dom";
import { useDevice } from "../context/DeviceContext";
import { getDeviceTypeView } from "../device-types";
import { BackIcon } from "./icons";


// Menu górne (App.tsx, poza stroną /devices). Na początku strzałka powrotu do listy urządzeń (/devices),
// potem pozycje i ikony z rejestru rodzajów sterowników; na telefonie (≤ 560 px) CSS ukrywa .nav-label i zostają same ikony z title.
export function Header() {
	let location  = useLocation();
	// menu z rejestru rodzajów sterowników: każdy rodzaj ma swoje widoki (hydrofor bez harmonogramów)
	const { device } = useDevice();
	const { views } = getDeviceTypeView(device?.deviceType);

	// if (location.pathname === '/' || location.pathname === '/hp') {
    //   	//autorefresh
	// 	setInterval(() => {window.location.reload()}, 60000);
	// }

	return (
		<header>
			<nav>
				<Link to="/devices" className="nav-back" title="Lista urządzeń" aria-label="Wróć do listy urządzeń">
					<BackIcon />
				</Link>
				{views.map((view) => (
				<Link key={view.path} to={view.path} title={view.label} aria-label={view.label}
					className={location.pathname === view.path ? 'active' : ''}>
					{view.icon}
					<span className="nav-label">{view.label}</span>
				</Link>
				))}
			</nav>
		</header>
	);
}
