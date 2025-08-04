import "./style.css"
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Header } from './components/Header';
import Settings from "./pages/Settings";
import HP from "./pages/HP";
import { HeatPumpTable } from "./pages/Data"
import { HeatPumpChart  } from "./pages/Charts"

function App() {

	return <>{
		<BrowserRouter>
			<div className="app-container">
				<header className="app-header">
				<Header />
				</header>

				<main className="app-main">
				<Routes>
					<Route path="/" element={<HP />} />
					<Route path="/hp" element={<HP />} />
					<Route path="/settings" element={<Settings />} />
					<Route path="/data" element={<HeatPumpTable />} />
					<Route path="/chart" element={<HeatPumpChart/>} />
				</Routes>
				</main>
			</div>
		</BrowserRouter>
	}</>	
  }



const container = document.getElementById('root') as HTMLElement;
const root = createRoot(container);
root.render(<App />);