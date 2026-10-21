// Zakładka „Słońce i PV” strony pogody (makieta #pogoda-pv): prognoza produkcji fotowoltaiki na jutro i najbliższe dni,
// wykres mocy jutro (prognoza) z dzisiejszą produkcją z DTU, wschód / zachód, długość dnia, UV.
// Prognoza = nasłonecznienie Open-Meteo na pochyloną płaszczyznę (forecast.ts: 35°, południe) × współczynnik dopasowania:
// suma produkcji z DTU / suma nasłonecznienia z ostatnich 31 dni (dni z produkcją). Współczynnik zbiera moc paneli,
// ich prawdziwe nachylenie i kierunek oraz straty, więc nie trzeba ich wpisywać. Bez fotowoltaiki na koncie albo
// przy mniej niż MIN_CALIBRATION_DAYS dniach z produkcją strona pokazuje samo nasłonecznienie (kWh/m²).
import { useEffect, useState } from 'react';
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { cc, tooltipStyle } from '../../chartColors';
import { Requests } from '../../http';
import { WeatherCodeIcon } from '../../components/WeatherIcon';
import type { PvCurrent, PvDay, PvSummary } from '../../../devices/photovoltaic/types';
import { dayLabel, dayOf, Forecast, hourOf, nextDay, number1, todayIndex } from './forecast';
import { t as tr, useLang } from '../../i18n';

export type PvLink = { rootId: string; deviceId: string };
const MIN_CALIBRATION_DAYS = 5;
// dzień liczony do dopasowania: nasłonecznienie co najmniej 0,2 kWh/m² i jakakolwiek produkcja
const MIN_DAY_GTI = 200;
const LIST_DAYS = 7;

type PvData = { summaries: PvSummary[]; current: PvCurrent | null; day: PvDay | null };

const pvGet = <T,>(pv: PvLink, path: string) =>
  Requests.get(`${path}${path.includes('?') ? '&' : '?'}rootId=${encodeURIComponent(pv.rootId)}&deviceId=${encodeURIComponent(pv.deviceId)}`, false) as Promise<T | null>;

const warsawHour = (iso: string) => Number(new Date(iso).toLocaleString('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Europe/Warsaw' })) % 24;

function uvLabel(uv: number) {
  if (uv < 3) return tr('wx.uv.low');
  if (uv < 6) return tr('wx.uv.moderate');
  if (uv < 8) return tr('wx.uv.high');
  if (uv < 11) return tr('wx.uv.veryHigh');
  return tr('wx.uv.extreme');
}

const duration = (seconds: number) => `${Math.floor(seconds / 3600)} h ${String(Math.round((seconds % 3600) / 60)).padStart(2, '0')}`;

export function SunTab({ forecast, pv }: { forecast: Forecast; pv: PvLink | null }) {
  const { t, locale } = useLang();
  const [data, setData] = useState<PvData | null>(null);
  const today = dayOf(forecast.current.time);
  const tomorrow = nextDay(today);

  useEffect(() => {
    if (!pv) return;
    const month = today.slice(0, 7);
    const previous = new Date(`${month}-15T12:00:00Z`);
    previous.setUTCMonth(previous.getUTCMonth() - 1);
    Promise.all([
      pvGet<PvSummary>(pv, `/photovoltaic/summary?period=month&date=${previous.toISOString().slice(0, 7)}`),
      pvGet<PvSummary>(pv, `/photovoltaic/summary?period=month&date=${month}`),
      pvGet<PvCurrent>(pv, '/photovoltaic/current'),
      pvGet<PvDay>(pv, `/photovoltaic/day?date=${today}`),
    ]).then(([a, b, current, day]) => setData({ summaries: [a, b].filter((s): s is PvSummary => !!s), current, day }));
  }, [pv?.rootId, today]);

  if (pv && !data) return <p className="app-loading">{t('wx.loadingDtu')}</p>;

  // nasłonecznienie dnia [Wh/m²] i godziny [W/m²]
  const gtiDay = new Map<string, number>();
  const gtiHour = new Map<string, number>();
  forecast.hourly.time.forEach((time, index) => {
    const value = forecast.hourly.global_tilted_irradiance[index] ?? 0;
    gtiDay.set(dayOf(time), (gtiDay.get(dayOf(time)) ?? 0) + value);
    gtiHour.set(time, value);
  });

  // współczynnik dopasowania z dni przed dzisiejszym [Wh produkcji na Wh/m²]
  const actualByDay = new Map<string, number>();
  data?.summaries.forEach((summary) => summary.buckets.forEach((bucket) => actualByDay.set(bucket.key, bucket.energyWh)));
  let sumActual = 0;
  let sumGti = 0;
  let calibrationDays = 0;
  actualByDay.forEach((energy, day) => {
    const gti = gtiDay.get(day) ?? 0;
    if (day >= today || energy <= 0 || gti < MIN_DAY_GTI) return;
    sumActual += energy;
    sumGti += gti;
    calibrationDays += 1;
  });
  const factor = calibrationDays >= MIN_CALIBRATION_DAYS && sumGti > 0 ? sumActual / sumGti : null;
  const pvMode = factor !== null;
  // prognoza dnia: kWh z instalacji albo kWh/m² nasłonecznienia
  const dayValue = (day: string) => ((gtiDay.get(day) ?? 0) * (factor ?? 1)) / 1000;
  const unit = pvMode ? 'kWh' : 'kWh/m²';

  const index = todayIndex(forecast);
  const { daily } = forecast;
  const lengthChange = daily.daylight_duration[index + 1] !== undefined ? Math.round((daily.daylight_duration[index + 1] - daily.daylight_duration[index]) / 60) : 0;
  const uv = daily.uv_index_max[index] ?? 0;

  // wykres: godziny jutra z nasłonecznieniem (prognoza) i dzisiejsza moc z DTU (średnia godzinowa)
  const todayActual = new Map<number, number[]>();
  data?.day?.points.forEach((point) => {
    const hour = warsawHour(point.t);
    todayActual.set(hour, [...(todayActual.get(hour) ?? []), point.power]);
  });
  const chart = Array.from({ length: 24 }, (_, hour) => {
    const time = `${tomorrow}T${String(hour).padStart(2, '0')}:00`;
    const gti = gtiHour.get(time) ?? 0;
    const actual = todayActual.get(hour);
    return {
      label: `${hour}:00`, hour,
      forecast: pvMode ? (gti * factor!) / 1000 : gti,
      today: pvMode && actual ? actual.reduce((a, b) => a + b, 0) / actual.length / 1000 : null,
    };
  }).filter((row) => row.forecast > 0.005 || (row.today ?? 0) > 0.005);
  const peak = chart.reduce<(typeof chart)[number] | null>((best, row) => (!best || row.forecast > best.forecast ? row : best), null);

  const listDays = daily.time.slice(index, index + LIST_DAYS);
  const listMax = Math.max(...listDays.map(dayValue), 0.001);
  const todayWh = data?.current?.todayWh;
  const sunset = daily.sunset[index];
  const afterSunset = forecast.current.time >= sunset;
  const todayForecast = dayValue(today);
  const accuracy = pvMode && afterSunset && todayWh !== undefined && todayForecast > 0
    ? Math.max(0, Math.round(100 - (Math.abs(todayWh / 1000 - todayForecast) / todayForecast) * 100)) : null;

  const noteParts = [
    pvMode && todayWh !== undefined ? `${t('wx.todayDtu', { actual: number1(todayWh / 1000), forecast: number1(todayForecast) })}${accuracy !== null ? ` (${t('wx.accuracy', { value: accuracy })})` : ''}` : null,
    peak ? t('wx.peakTomorrow', { value: pvMode ? `${number1(peak.forecast)} kW` : `${Math.round(peak.forecast)} W/m²`, hour: peak.hour }) : null,
    lengthChange ? t(lengthChange < 0 ? 'wx.dayShorter' : 'wx.dayLonger', { minutes: Math.abs(lengthChange) }) : null,
  ].filter(Boolean);

  return (
    <>
      <section className="card card-hero">
        <div className="hero-main">
          <span className="hero-label">{pvMode ? t('wx.pvTomorrow') : t('wx.irradianceTomorrow')}</span>
          <div className="hero-value"><span className="hero-num">{number1(dayValue(tomorrow))}</span><span className="hero-unit">{unit}</span></div>
          <span className="hero-note">{noteParts.join(' · ')}</span>
        </div>
        <div className="hero-side"><div className="hero-kpis">
          <div className="kpi"><span className="kpi-label">{t('wx.sunrise')}</span><span className="kpi-value">{hourOf(daily.sunrise[index])}</span></div>
          <div className="kpi"><span className="kpi-label">{t('wx.sunset')}</span><span className="kpi-value">{hourOf(sunset)}</span></div>
          <div className="kpi"><span className="kpi-label">{t('wx.dayLength')}</span><span className="kpi-value">{duration(daily.daylight_duration[index])}<small>min</small></span></div>
          <div className="kpi"><span className="kpi-label">{t('wx.uvMax')}</span><span className="kpi-value">{Math.round(uv)}<small>{uvLabel(uv)}</small></span></div>
        </div></div>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>{pvMode ? t('wx.pvPowerTomorrow') : t('wx.irradianceTomorrowShort')}</h2>
          <span className="legend">
            <span className="lg"><i style={{ background: cc().sun }} />{pvMode ? t('wx.tomorrowForecast') : 'W/m²'}</span>
            {pvMode && <span className="lg"><i style={{ background: cc().axis }} />{t('wx.todayDtuLegend')}</span>}
          </span>
        </div>
        <div className="wx-chart">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chart} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid stroke={cc().grid} vertical={false} />
              <XAxis dataKey="label" stroke={cc().line} tickLine={false} tick={{ fill: cc().axis, fontSize: 11 }} interval="preserveStartEnd" minTickGap={24} />
              <YAxis stroke={cc().line} axisLine={false} tickLine={false} width={44} tick={{ fill: cc().axis, fontSize: 11 }}
                tickFormatter={(value: number) => pvMode ? `${value.toLocaleString(locale)} kW` : String(Math.round(value))} />
              <Tooltip {...tooltipStyle()} cursor={{ fill: cc().grid }}
                formatter={(value, name) => [pvMode ? `${Number(value).toLocaleString(locale, { maximumFractionDigits: 2 })} kW` : `${Math.round(Number(value))} W/m²`, name === 'today' ? t('wx.today') : t('wx.tomorrow')]} />
              <Bar dataKey="forecast" fill={cc().sun} radius={[1.5, 1.5, 0, 0]} maxBarSize={28} isAnimationActive={false} />
              {pvMode && <Line dataKey="today" type="monotone" stroke={cc().axis} strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="card">
        <div className="card-head"><h2>{t('wx.nextDays')}</h2><span className="card-hint">{pvMode ? t('wx.productionForecast') : t('wx.panelIrradiance')}</span></div>
        <ul className="wx-pv-days">
          {listDays.map((day, offset) => {
            const isToday = day === today;
            const value = dayValue(day);
            return (
              <li key={day} className="wx-pv-day">
                <span className="wx-day-name">{isToday ? t('wx.todayCap') : dayLabel(forecast, day).split(' ')[0]}
                  <small>{isToday && pvMode && todayWh !== undefined ? t('wx.fromDtu', { value: number1(todayWh / 1000) }) : day.slice(8, 10) + '.' + day.slice(5, 7)}</small>
                </span>
                <WeatherCodeIcon code={daily.weather_code[index + offset]} isDay size={26} />
                <span className="wx-pv-bar"><span style={{ '--p': `${Math.round((value / listMax) * 100)}%` } as React.CSSProperties} /></span>
                <span className="wx-pv-val">{number1(value)} <small>{unit}</small></span>
              </li>
            );
          })}
        </ul>
        <p className="help">
          {pvMode ? t('wx.pvHelpCalibrated', { days: calibrationDays }) : pv ? t('wx.pvHelpTooFew', { days: calibrationDays, needed: MIN_CALIBRATION_DAYS }) : t('wx.pvHelpNoPv')}
        </p>
      </section>
    </>
  );
}
