import { fetchWeatherApi } from 'openmeteo';

const params = { 
	latitude: 49.374298,
	longitude: 20.007237,
	timezone: "Europe/Warsaw",
	current: "temperature_2m",
};

const url = "https://api.open-meteo.com/v1/forecast";

let temperature_2m :number | null | undefined;

export const prepareMeteoData = async () => {
	const responses = await fetchWeatherApi(url, params);
	const current = responses[0].current()!;
	temperature_2m =  Math.trunc(current.variables(0)?.value()! * 10) / 10;
	// console.log(temperature_2m)
}

export function getTemperature() :number|null|undefined {
    return temperature_2m;
}
