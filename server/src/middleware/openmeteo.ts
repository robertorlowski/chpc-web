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