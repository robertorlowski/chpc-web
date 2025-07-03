import "./style.css"
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Header } from './components/Header';
import Settings from "./pages/Settings";
import HP from "./pages/HP";
import { NotFound } from "./pages/_404";

function App() {

	return <>{
		<BrowserRouter>
			<Header />
			<Routes>
				<Route path="/" element={<HP />} />
				<Route path="/hp" element={<HP />}/>
				<Route path="/settings" element={<Settings />}/>
				<Route path="*" element={<NotFound/>} />
			</Routes>
			</BrowserRouter>
	}</>	
  }


const container = document.getElementById('root');
const root = createRoot(container); // Nowe API od React 18
root.render(<App />);
