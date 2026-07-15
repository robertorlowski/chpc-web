// import { fetchWeatherApi } from 'openmeteo';

// const params = { 
// 	latitude: 49.374298,
// 	longitude: 20.007237,
// 	timezone: "Europe/Warsaw",
// 	current: "temperature_2m",
// };

// const url = "https://api.open-meteo.com/v1/forecast";

let temperature_2m :number | null | undefined = null;

// export const prepareMeteoData = async () => {
// 	try { 
// 		const responses = await fetchWeatherApi(url, params);
// 		const current = responses[0].current()!;
// 		temperature_2m =  Math.trunc(current.variables(0)?.value()! * 10) / 10;
// 		console.log(`Temperture: ${getTemperature()?.toFixed(0)} °C`);
// 		return temperature_2m;
// 	} catch( e ) {
// 		console.log(e);
// 	}
// }

interface ImgwStacja {
  id_stacji: string;
  stacja: string;
  data_pomiaru: string;
  godzina_pomiaru: string;
  temperatura: string;
  predkosc_wiatru: string;
  kierunek_wiatru: string;
  wilgotnosc_wzgledna: string;
  suma_opadu: string;
  cisnienie: string;
}

export function getTemperature() :number|null|undefined {
    return temperature_2m;
}


export const prepareMeteoData = async () => {
	try { 
		/*
		const response = await fetch('https://danepubliczne.imgw.pl/api/data/synop');
		const stacje: ImgwStacja[] = await response.json(); // <-- Informujemy TS, że to tablica stacji
		// Teraz TypeScript wie, że 's' to obiekt typu ImgwStacja
		const lokalnaStacja = stacje.find((s: ImgwStacja) => s.stacja === "Zakopane");
		*/

		const response = await fetch('https://danepubliczne.imgw.pl/api/data/synop/station/zakopane');
		const lokalnaStacja: ImgwStacja = await response.json();
		
		if (lokalnaStacja) {
			// Ważne: IMGW zwraca temperaturę jako string (np. "18.2"), musisz ją sparsować na liczbę
			temperature_2m = parseFloat(lokalnaStacja.temperatura);
			console.log(`Temperture: ${temperature_2m} °C`);
			return temperature_2m;
		}

	} catch( e ) {
		console.log(e);
	}
}