// Temperatura zewnętrzna z IMGW (stacja synoptyczna Zakopane), odświeżana co 10 min
// przez server.ts. Trafia do rekordów hp (t_out), do odpowiedzi /hp/add dla
// ekranu sterownika co i do GET /temperature. Trzymana tylko w pamięci.

// undefined/null do pierwszego udanego pobrania; nieudane pobranie zostawia starą wartość
let temperature_2m :number | null;

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

export function getTemperature() :number|null {
    return temperature_2m;
}


export const prepareMeteoData = async () => {
	try { 
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