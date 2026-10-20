// Zakładka „Teraz” strony pogody (makieta #pogoda-teraz): temperatura, opis, max/min dnia, odczuwalna, wiatr,
// wilgotność, ciśnienie, słońce; prognoza 48 h (ikona, temperatura z linią, szansa opadu) i porównanie jutra z dziś.
import { ListIcon } from '../../components/DeviceTileCard';
import { weatherDescription, WeatherCodeIcon } from '../../components/WeatherIcon';
import { capital, deg, dayOf, Forecast, hourOf, nextHourIndex, todayIndex, weekday, windDirection } from './forecast';

const HOURS = 48;
export const COLUMN = 58;

export const DropIcon = () => (
  <svg className="wx-drop" viewBox="0 0 10 12" width="8" height="10" aria-hidden="true"><path d="M5 0C3.3 3 1 5.2 1 7.6A4 4 0 0 0 9 7.6C9 5.2 6.7 3 5 0z" fill="currentColor" /></svg>
);

// etykieta kolumny godzinowej: o północy skrót dnia tygodnia
export const hourLabel = (time: string) => hourOf(time) === '00:00' ? weekday(dayOf(time)) : hourOf(time);

// Zdanie pod prognozą godzinową: najczęstszy opis nieba w najbliższych 12 h i skrajna temperatura
// (wieczorem i w nocy najniższa, w dzień najwyższa).
function summary(forecast: Forecast, start: number): string {
  const codes = forecast.hourly.weather_code.slice(start, start + 12);
  const temps = forecast.hourly.temperature_2m.slice(start, start + 12);
  if (!codes.length) return '';
  const counts = new Map<string, number>();
  codes.forEach((code) => { const text = weatherDescription(code); counts.set(text, (counts.get(text) ?? 0) + 1); });
  const text = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const hour = Number(hourOf(forecast.current.time).slice(0, 2));
  const evening = hour >= 15 || hour < 4;
  return `${capital(text)}. ${evening ? 'Min.' : 'Maks.'} temp. ${Math.round(evening ? Math.min(...temps) : Math.max(...temps))} °C.`;
}

function tomorrowText(diff: number) {
  if (diff <= -4) return 'Temperatury wyraźnie niższe niż dzisiaj';
  if (diff < 0) return 'Temperatury nieco niższe niż dzisiaj';
  if (diff === 0) return 'Temperatury podobne do dzisiejszych';
  if (diff < 4) return 'Temperatury nieco wyższe niż dzisiaj';
  return 'Temperatury wyraźnie wyższe niż dzisiaj';
}

// Prognoza godzinowa: kolumny w poziomym przewijaniu (strona się nie przewija), pod temperaturami linia z kropkami.
function Hourly({ forecast, start }: { forecast: Forecast; start: number }) {
  const { hourly } = forecast;
  const hours = hourly.time.slice(start, start + HOURS).map((time, offset) => {
    const index = start + offset;
    return { time, temp: hourly.temperature_2m[index], code: hourly.weather_code[index], day: hourly.is_day[index] === 1, rain: hourly.precipitation_probability[index] };
  });
  const temps = hours.map((hour) => hour.temp);
  const high = Math.max(...temps);
  const low = Math.min(...temps);
  const y = (temp: number) => 6 + (high === low ? 14 : ((high - temp) / (high - low)) * 28);
  const width = hours.length * COLUMN;
  const points = hours.map((hour, index) => `${index * COLUMN + COLUMN / 2},${y(hour.temp)}`).join(' ');
  return (
    <div className="wx-hourly" role="list" aria-label={`Prognoza na ${HOURS} godziny`}>
      <div className="wx-hourly-row" style={{ width }}>
        {hours.map((hour) => (
          <div key={hour.time} role="listitem" className={`wx-hour${hourOf(hour.time) === '00:00' ? ' is-midnight' : ''}`} style={{ width: COLUMN }}>
            <span className="wx-hour-time">{hourLabel(hour.time)}</span>
            <WeatherCodeIcon code={hour.code} isDay={hour.day} size={28} />
            <span className="wx-hour-temp">{deg(hour.temp)}</span>
          </div>
        ))}
      </div>
      <svg className="wx-hourly-line" width={width} height="40" viewBox={`0 0 ${width} 40`} aria-hidden="true">
        <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.5" />
        {hours.map((hour, index) => <circle key={hour.time} cx={index * COLUMN + COLUMN / 2} cy={y(hour.temp)} r="3.5" />)}
      </svg>
      <div className="wx-hourly-row" style={{ width }}>
        {hours.map((hour) => (
          <span key={hour.time} className="wx-hour-rain" style={{ width: COLUMN }}><DropIcon />{hour.rain ?? 0}%</span>
        ))}
      </div>
    </div>
  );
}

// sensor: temperatura z czujnika zewnętrznego kotła („Dom”, od 2026-10-21) — w nagłówku zamiast modelu, model w dopisku;
// bez świeżego pomiaru (piec wyłączony) zostaje model
export function NowTab({ forecast, name, sensor }: { forecast: Forecast; name: string; sensor?: number | null }) {
  const { current, daily } = forecast;
  const today = todayIndex(forecast);
  const start = nextHourIndex(forecast);
  const diff = daily.time[today + 1] ? Math.round(daily.temperature_2m_max[today + 1]) - Math.round(daily.temperature_2m_max[today]) : null;
  return (
    <>
      <section className="card card-hero">
        <div className="hero-main">
          <span className="hero-label wx-place"><ListIcon name="pin" />{name}</span>
          <div className="hero-value">
            <span className="hero-num">{Math.round(typeof sensor === 'number' ? sensor : current.temperature_2m)}</span><span className="hero-unit">°C</span>
          </div>
          <div className="wx-hero-desc">{capital(weatherDescription(current.weather_code))}</div>
          <div className="wx-hero-range">↑{deg(daily.temperature_2m_max[today])} / ↓{deg(daily.temperature_2m_min[today])}</div>
          <span className="hero-note">
            {typeof sensor === 'number' ? `Czujnik kotła · model ${deg(current.temperature_2m)} · odczuwalna ${deg(current.apparent_temperature)}` : `Odczuwalna ${deg(current.apparent_temperature)}`}
          </span>
        </div>
        <div className="hero-side"><div className="hero-kpis">
          <div className="kpi"><span className="kpi-label">Wiatr</span><span className="kpi-value">{Math.round(current.wind_speed_10m)}<small>km/h {windDirection(current.wind_direction_10m)}</small></span></div>
          <div className="kpi"><span className="kpi-label">Wilgotność</span><span className="kpi-value">{Math.round(current.relative_humidity_2m)}<small>%</small></span></div>
          <div className="kpi"><span className="kpi-label">Ciśnienie</span><span className="kpi-value">{Math.round(current.pressure_msl)}<small>hPa</small></span></div>
          <div className="kpi"><span className="kpi-label">Słońce</span><span className="kpi-value">{hourOf(daily.sunrise[today])}<small>– {hourOf(daily.sunset[today])}</small></span></div>
        </div></div>
      </section>

      <section className="card">
        <div className="card-head"><h2>Najbliższe 48 godzin</h2><span className="card-hint">przewiń w bok</span></div>
        <p className="wx-summary">{summary(forecast, start)}</p>
        <Hourly forecast={forecast} start={start} />
      </section>

      {diff !== null && (
        <section className="card wx-tomorrow">
          <div>
            <span className="wx-tomorrow-label">Jutrzejsza temperatura</span>
            <strong>{tomorrowText(diff)}</strong>
          </div>
          <span className="wx-tomorrow-value">{Math.abs(diff)}°{diff < 0 ? '↓' : diff > 0 ? '↑' : ''}</span>
        </section>
      )}
    </>
  );
}
