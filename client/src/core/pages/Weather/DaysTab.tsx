// Zakładka „Najbliższe dni” strony pogody (makieta #pogoda-dni): wczoraj, dziś i kolejne dni z ikoną dnia i nocy,
// szansą opadu, max i min; 8 dni, przycisk rozwija do 16.
import { useState } from 'react';
import { weatherDescription, WeatherCodeIcon } from '../../components/WeatherIcon';
import { dayOf, deg, Forecast, nightCode, shortDate, todayIndex, weekday } from './forecast';
import { DropIcon } from './NowTab';

const DAYS_SHORT = 8;

export function DaysTab({ forecast }: { forecast: Forecast }) {
  const [all, setAll] = useState(false);
  const { daily } = forecast;
  const today = dayOf(forecast.current.time);
  const index0 = todayIndex(forecast);
  const first = Math.max(0, index0 - 1);
  const days = daily.time.slice(first, all ? undefined : first + DAYS_SHORT);
  return (
    <section className="card">
      <div className="card-head"><h2>Prognoza dzienna</h2><span className="card-hint">dzień · noc</span></div>
      <ul className="wx-days">
        {days.map((day, offset) => {
          const index = first + offset;
          const past = day < today;
          const night = nightCode(forecast, day);
          const rain = daily.precipitation_probability_max[index];
          return (
            <li key={day} className={`wx-day${past ? ' is-past' : ''}`}>
              <span className="wx-day-name">
                {day === today ? 'Dzisiaj' : past ? 'Wczoraj' : weekday(day)}
                <small>{shortDate(day)}</small>
              </span>
              <span className="wx-day-rain">{!past && rain !== null && <><DropIcon />{rain}%</>}</span>
              <span className="wx-day-icons" title={`dzień: ${weatherDescription(daily.weather_code[index])}${night !== null ? `, noc: ${weatherDescription(night)}` : ''}`}>
                <WeatherCodeIcon code={daily.weather_code[index]} isDay size={28} />
                {night !== null ? <WeatherCodeIcon code={night} isDay={false} size={28} /> : <span className="wx-icon-gap" />}
              </span>
              <span className="wx-day-max">{deg(daily.temperature_2m_max[index])}</span>
              <span className="wx-day-min">{deg(daily.temperature_2m_min[index])}</span>
            </li>
          );
        })}
      </ul>
      {daily.time.length - first > DAYS_SHORT && (
        <div className="actions">
          <button type="button" className="btn btn-ghost" onClick={() => setAll(!all)}>
            {all ? 'Krótsza prognoza' : `Prognoza ${daily.time.length - index0}-dniowa`} ›
          </button>
        </div>
      )}
    </section>
  );
}
