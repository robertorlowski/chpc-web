import "./theme.css"
import "./style.css"
import { createRoot } from 'react-dom/client';
import { DeviceProvider } from './core/context/DeviceContext';
import { App } from './core/App';
import { AuthProvider } from './core/context/AuthContext';
import { applyTheme, getTheme } from './core/theme';

// Punkt wejścia: aplikacja (core/App.tsx) w kontekście wybranego urządzenia i konta (AuthProvider czyści wybór
// sterownika przy zmianie użytkownika, więc jest wewnątrz DeviceProvider).
// theme.css to tokeny kolorów i motyw jasny / ciemny (core/theme.ts), style.css to style globalne (układ, pasek,
// nawigacja, karty, reguły telefonu); widoki mają własne pliki CSS, które korzystają z tokenów.
applyTheme(getTheme());
const container = document.getElementById('root') as HTMLElement;
const root = createRoot(container);
root.render(
	<DeviceProvider>
		<AuthProvider>
			<App />
		</AuthProvider>
	</DeviceProvider>,
);
