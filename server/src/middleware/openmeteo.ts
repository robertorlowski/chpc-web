import { fetchWeatherApi } from 'openmeteo';

const params = { 
	latitude: 49.3803,
	longitude: 20.0131,
	timezone: "Europe/Warsaw",
	hourly: "temperature_2m",
};

const url = "https://api.open-meteo.com/v1/ecmwf";

let temperature_2m :number | null | undefined;

export const prepareMeteoDate = async () => {
	const responses = await fetchWeatherApi(url, params);
	const hourly = responses[0].hourly()!;
	temperature_2m = hourly.variables(0)?.values(0);
}

export function getTemperature() :number|null|undefined {
    return temperature_2m;
}
