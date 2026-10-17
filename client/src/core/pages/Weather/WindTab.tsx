// Zakładka „Wiatr i opady” strony pogody (makieta #pogoda-wiatr): wiatr teraz z porywami, opad dziś i w 7 dni,
// śnieg, burze, ostrzeżenie o silnym wietrze (z południa: możliwy halny), wiatr na 48 h (kierunek, średnia, porywy)
// i słupki dobowej sumy opadu.
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { cc, tooltipStyle } from '../../chartColors';
import { ListIcon } from '../../components/DeviceTileCard';
import { dayLabel, Forecast, hourOf, nextHourIndex, number1, todayIndex, windDirection } from './forecast';
import { COLUMN, hourLabel } from './NowTab';

const HOURS = 48;
const WEEK = 7;
const RAIN_DAYS = 8;
// silny wiatr: porywy od 60 km/h; halny: wiatr z sektora południowego (135–225°) w Tatrach i na Podhalu.
// Reguła robocza (2026-10-17): Open-Meteo nie oznacza halnego.
const STRONG_GUSTS = 60;
const isSouth = (degrees: number) => degrees >= 135 && degrees <= 225;

export function WindTab({ forecast }: { forecast: Forecast }) {
  const { current, hourly, daily } = forecast;
  const today = todayIndex(forecast);
  const start = nextHourIndex(forecast);
  const week = daily.time.slice(today, today + WEEK).map((day, offset) => {
    const index = today + offset;
    return { day, rain: daily.precipitation_sum[index], snow: daily.snowfall_sum[index], gust: daily.wind_gusts_10m_max[index], dir: daily.wind_direction_10m_dominant[index], storm: daily.weather_code[index] >= 95 };
  });
  const strongest = week.reduce((top, item) => (item.gust > top.gust ? item : top), week[0]);
  const windy = week.filter((item) => item.gust >= STRONG_GUSTS);
  const storms = week.filter((item) => item.storm);
  const rain = daily.time.slice(today, today + RAIN_DAYS).map((day, offset) => ({ day, label: dayLabel(forecast, day).split(' ')[0], mm: daily.precipitation_sum[today + offset] }));
  const hours = hourly.time.slice(start, start + HOURS).map((time, offset) => ({
    time, speed: hourly.wind_speed_10m[start + offset], gust: hourly.wind_gusts_10m[start + offset], dir: hourly.wind_direction_10m[start + offset],
  }));

  return (
    <>
      <section className="card card-hero">
        <div className="hero-main">
          <span className="hero-label">Wiatr teraz</span>
          <div className="hero-value"><span className="hero-num">{Math.round(current.wind_speed_10m)}</span><span className="hero-unit">km/h {windDirection(current.wind_direction_10m)}</span></div>
          <span className="hero-note">
            porywy do {Math.round(current.wind_gusts_10m)} km/h · najsilniej {dayLabel(forecast, strongest.day)}: porywy do {Math.round(strongest.gust)} km/h z kierunku {windDirection(strongest.dir)}
          </span>
        </div>
        <div className="hero-side"><div className="hero-kpis">
          <div className="kpi"><span className="kpi-label">Opad dziś</span><span className="kpi-value">{number1(week[0].rain)}<small>mm</small></span></div>
          <div className="kpi"><span className="kpi-label">Opad 7 dni</span><span className="kpi-value">{Math.round(week.reduce((sum, item) => sum + item.rain, 0))}<small>mm</small></span></div>
          <div className="kpi"><span className="kpi-label">Śnieg 7 dni</span><span className="kpi-value">{Math.round(week.reduce((sum, item) => sum + item.snow, 0))}<small>cm</small></span></div>
          <div className="kpi"><span className="kpi-label">Burze 7 dni</span><span className="kpi-value">{storms.length ? storms.length : 'brak'}{storms.length > 0 && <small>{storms.length === 1 ? 'dzień' : 'dni'}</small>}</span></div>
        </div></div>
      </section>

      {windy.map((item) => (
        <div key={item.day} className="alert alert-warn"><ListIcon name="bell" /><div>
          <strong>{dayLabel(forecast, item.day)}: silny wiatr{isSouth(item.dir) ? ' z południa' : ` z kierunku ${windDirection(item.dir)}`}</strong>
          <span>porywy do {Math.round(item.gust)} km/h{isSouth(item.dir) ? ', możliwy halny' : ''} · zabezpiecz rzeczy na zewnątrz</span>
        </div></div>
      ))}

      <section className="card">
        <div className="card-head"><h2>Wiatr · najbliższe 48 godzin</h2><span className="card-hint">średnia · porywy [km/h]</span></div>
        <div className="wx-hourly" role="list" aria-label="Wiatr w najbliższych 48 godzinach">
          <div className="wx-hourly-row" style={{ width: hours.length * COLUMN }}>
            {hours.map((hour) => (
              <div key={hour.time} role="listitem" className={`wx-hour${hourOf(hour.time) === '00:00' ? ' is-midnight' : ''}`} style={{ width: COLUMN }}
                title={`${hourOf(hour.time)} · wiatr z kierunku ${windDirection(hour.dir)}`}>
                <span className="wx-hour-time">{hourLabel(hour.time)}</span>
                {/* strzałka wskazuje, dokąd wieje (kierunek z prognozy: skąd) */}
                <svg className="wx-wind-arrow" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" style={{ transform: `rotate(${hour.dir + 180}deg)` }}>
                  <path d="M12 3l5 9h-3.5v9h-3v-9H7z" fill="currentColor" />
                </svg>
                <span className="wx-hour-temp">{Math.round(hour.speed)}</span>
                <span className="wx-hour-gust">{Math.round(hour.gust)}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="card">
        <div className="card-head"><h2>Opady · najbliższe dni</h2><span className="card-hint">suma dobowa</span></div>
        <div className="wx-chart">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rain} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid stroke={cc().grid} vertical={false} />
              <XAxis dataKey="label" stroke={cc().line} tickLine={false} interval={0} tick={{ fill: cc().axis, fontSize: 11 }} />
              <YAxis stroke={cc().line} axisLine={false} tickLine={false} width={44} allowDecimals={false} tick={{ fill: cc().axis, fontSize: 11 }} tickFormatter={(value: number) => `${value} mm`} />
              <Tooltip {...tooltipStyle()} cursor={{ fill: cc().grid }} formatter={(value) => [`${number1(Number(value))} mm`, 'opad']} />
              <Bar dataKey="mm" fill={cc().water} radius={[1.5, 1.5, 0, 0]} maxBarSize={40} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
    </>
  );
}
