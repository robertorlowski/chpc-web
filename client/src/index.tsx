import "./style.css"
import { createRoot } from 'react-dom/client';
import { DeviceProvider } from './core/context/DeviceContext';
import { App } from './core/App';

// Punkt wejścia: aplikacja (core/App.tsx) w kontekście wybranego urządzenia.
// style.css to style globalne (układ, menu, reguły telefonu ≤ 560 px); widoki mają własne pliki CSS.
const container = document.getElementById('root') as HTMLElement;
const root = createRoot(container);
root.render(
	<DeviceProvider>
		<App />
	</DeviceProvider>,
);
