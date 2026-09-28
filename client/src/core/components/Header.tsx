import { Link, useLocation } from "react-router-dom";
import { useDevice } from "../context/DeviceContext";
import { getDeviceTypeView } from "../device-types";


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
