import "./theme.css"
import "./style.css"
import "./makieta.css"
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
// PWA (2026-10-21): service worker public/sw.js (powłoka z pamięci podręcznej, strona offline, Web Push) tylko w buildzie,
// bo w trybie dev buforowałby moduły Vite; core/push.ts rejestruje go też przy włączaniu powiadomień
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => undefined); });
}
const container = document.getElementById('root') as HTMLElement;
const root = createRoot(container);
root.render(
	<DeviceProvider>
		<AuthProvider>
			<App />
		</AuthProvider>
	</DeviceProvider>,
);
