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
			</Routes>
			</BrowserRouter>
	}</>	
  }



const container = document.getElementById('root') as HTMLElement;
const root = createRoot(container);
root.render(<App />);