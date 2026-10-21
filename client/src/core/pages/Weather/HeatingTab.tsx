// Zakładka „Ogrzewanie” strony pogody (makieta #pogoda-ogrzewanie): najlepsze okno na grzanie CWU pompą ciepła
// (najcieplej w tańszej strefie G12w), najniższa temperatura, średnia jutro, stopniodni, sugerowany tryb kotła,
// wykres 48 h z tańszą strefą i uwagi (przymrozek, chłód). Strefy G12w z utils pompy ciepła (TAURON, ze świętami).
import { CartesianGrid, ComposedChart, Line, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { cc, tooltipStyle } from '../../chartColors';
import { ListIcon } from '../../components/DeviceTileCard';
import { getTauronG12wZone } from '../../../devices/heat-pump/utils/energy-cost-g12w';
import { dayLabel, dayOf, Forecast, hourOf, instantOf, nextHourIndex, number1, todayIndex } from './forecast';
import { useLang } from '../../i18n';

const HOURS = 48;
// okno CWU: tyle godzin pod rząd, wyszukiwane w najbliższych WINDOW_SEARCH_HOURS
const WINDOW_HOURS = 3;
const WINDOW_SEARCH_HOURS = 36;
const BASE_TEMPERATURE = 18;
const WEEK = 7;
// Średnia dobowa, poniżej której przy grzaniu CO pompa ciepła może nie nadążyć: podpowiedź trybu Pellet. Próg
// przyjęty roboczo (2026-10-17), do ustalenia z doświadczeń zimy.
const HEAT_PUMP_MIN_MEAN = 5;

type Hour = { index: number; time: string; temp: number; cheap: boolean };

export function HeatingTab({ forecast }: { forecast: Forecast }) {
  const { t } = useLang();
  const { hourly, daily } = forecast;
  const start = nextHourIndex(forecast);
  const hours: Hour[] = hourly.time.slice(start, start + HOURS).map((time, offset) => ({
    index: offset, time, temp: hourly.temperature_2m[start + offset], cheap: getTauronG12wZone(instantOf(forecast, time)) === 'offPeak',
  }));

  // najlepsze okno: wszystkie godziny w tańszej strefie, najwyższa średnia temperatura (przy remisie wcześniejsze)
  let best: { from: number; mean: number } | null = null;
  for (let from = 0; from + WINDOW_HOURS <= Math.min(WINDOW_SEARCH_HOURS, hours.length); from += 1) {
    const slice = hours.slice(from, from + WINDOW_HOURS);
    if (!slice.every((hour) => hour.cheap)) continue;
    const mean = slice.reduce((sum, hour) => sum + hour.temp, 0) / slice.length;
    if (!best || mean > best.mean + 0.05) best = { from, mean };
  }
  const window = best ? hours.slice(best.from, best.from + WINDOW_HOURS) : [];
  const windowEnd = window.length ? hourly.time[start + best!.from + WINDOW_HOURS] ?? window[window.length - 1].time : '';
  const windowWeekend = window.length > 0 && (() => { const day = instantOf(forecast, window[0].time).getUTCDay(); return day === 0 || day === 6; })();

  const today = todayIndex(forecast);
  // minimum dnia tylko z godzin, które jeszcze nie minęły (dziś wieczorem nie liczy się nocy, która była)
  const futureMin = (day: string) => {
    const temps = hourly.time.map((time, index) => ({ time, temp: hourly.temperature_2m[index] }))
      .filter((hour, index) => index >= start && dayOf(hour.time) === day);
    return temps.reduce<{ time: string; temp: number } | null>((low, hour) => (!low || hour.temp < low.temp ? hour : low), null);
  };
  const week = daily.time.slice(today, today + WEEK).map((day, offset) => ({
    day, low: futureMin(day), mean: daily.temperature_2m_mean[today + offset],
  })).filter((item) => item.low);
  const coldest = week.reduce((low, item) => (item.low!.temp < low.low!.temp ? item : low), week[0]);
  const tomorrowMean = week.find((item) => item.day === daily.time[today + 1])?.mean;
  const degreeDays = week.reduce((sum, item) => sum + Math.max(0, BASE_TEMPERATURE - item.mean), 0);
  const frost = week.find((item) => item.low!.temp <= 0);
  const cold = week.find((item) => item.day > dayOf(forecast.current.time) && item.mean <= HEAT_PUMP_MIN_MEAN);

  // tańsza strefa jako ciągłe zakresy na osi wykresu; koniec na początku następnej godziny (godzina 14:00 trwa do 15:00)
  const cheapRanges: { from: string; to: string }[] = [];
  hours.forEach((hour, i) => {
    if (!hour.cheap) return;
    const end = hours[i + 1]?.time ?? hour.time;
    const last = cheapRanges[cheapRanges.length - 1];
    if (last && hours[i - 1]?.cheap) last.to = end; else cheapRanges.push({ from: hour.time, to: end });
  });
  const windowLow = window.length ? Math.round(Math.min(...window.map((h) => h.temp))) : 0;
  const windowHigh = window.length ? Math.round(Math.max(...window.map((h) => h.temp))) : 0;
  // oś po pełnym czasie (godziny powtarzają się w dwóch dniach), podpis: godzina, o północy dzień
  const tick = (time: string) => hourOf(time) === '00:00' ? dayLabel(forecast, dayOf(time)) : hourOf(time);

  return (
    <>
      <section className="card card-hero">
        <div className="hero-main">
          <span className="hero-label">{t('wx.bestCwuWindow')}</span>
          {window.length ? (
            <>
              <div className="hero-value"><span className="hero-num wx-hero-time">{hourOf(window[0].time)}–{hourOf(windowEnd)}</span></div>
              <div className="wx-hero-desc">{dayLabel(forecast, dayOf(window[0].time))}</div>
              <span className="hero-note">
                {t('wx.warmestCheap', { range: windowLow === windowHigh ? windowLow : `${windowLow}–${windowHigh}` })}
                {windowWeekend ? ` ${t('wx.weekendCheap')}` : ''}
              </span>
            </>
          ) : (
            <span className="hero-note">{t('wx.noCheapWindow', { hours: WINDOW_HOURS, search: WINDOW_SEARCH_HOURS })}</span>
          )}
        </div>
        <div className="hero-side"><div className="hero-kpis">
          <div className="kpi"><span className="kpi-label">{t('wx.coldest')}</span><span className="kpi-value">{Math.round(coldest.low!.temp)}<small>°C · {dayLabel(forecast, coldest.day)} {hourOf(coldest.low!.time)}</small></span></div>
          {tomorrowMean !== undefined && <div className="kpi"><span className="kpi-label">{t('wx.meanTomorrow')}</span><span className="kpi-value">{Math.round(tomorrowMean)}<small>°C</small></span></div>}
          <div className="kpi"><span className="kpi-label">{t('wx.degreeDays7')}</span><span className="kpi-value">{Math.round(degreeDays)}<small>K·d</small></span></div>
          {tomorrowMean !== undefined && (
            <div className="kpi" title={t('wx.suggestedModeTitle', { value: HEAT_PUMP_MIN_MEAN })}>
              <span className="kpi-label">{t('wx.suggestedMode')}</span>
              <span className="kpi-value">{tomorrowMean <= HEAT_PUMP_MIN_MEAN ? t('wx.pellet') : <>{t('wx.heatPumpShort')}<small>{t('wx.heatPumpSmall')}</small></>}</span>
            </div>
          )}
        </div></div>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>{t('wx.next48')}</h2>
          <span className="legend">
            <span className="lg"><i style={{ background: cc().s1 }} />{t('wx.temperature')}</span>
            <span className="lg"><i className="wx-lg-cheap" />{t('wx.cheapZone')}</span>
            {window.length > 0 && <span className="lg"><i className="wx-lg-best" />{t('wx.cwuWindow')}</span>}
          </span>
        </div>
        <div className="wx-chart">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={hours} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid stroke={cc().grid} vertical={false} />
              {cheapRanges.map((range) => (
                <ReferenceArea key={range.from} x1={range.from} x2={range.to} fill={cc().ok} fillOpacity={0.12} ifOverflow="extendDomain" />
              ))}
              {window.length > 0 && <ReferenceArea x1={window[0].time} x2={hours[best!.from + WINDOW_HOURS]?.time ?? window[window.length - 1].time} fill={cc().accent} fillOpacity={0.25} />}
              <XAxis dataKey="time" tickFormatter={tick} stroke={cc().line} tickLine={false} tick={{ fill: cc().axis, fontSize: 11 }} interval="preserveStartEnd" minTickGap={28} />
              <YAxis stroke={cc().line} axisLine={false} tickLine={false} width={40} tick={{ fill: cc().axis, fontSize: 11 }} tickFormatter={(value: number) => `${value} °C`} />
              <Tooltip {...tooltipStyle()}
                labelFormatter={(_label, payload) => { const row = payload?.[0]?.payload as Hour | undefined; return row ? `${dayLabel(forecast, dayOf(row.time))} ${hourOf(row.time)}` : ''; }}
                formatter={(value, _name, item) => [`${number1(Number(value))} °C · ${(item.payload as Hour).cheap ? t('wx.cheapZoneShort') : t('wx.peakZoneShort')}`, t('wx.temperatureLower')]} />
              <Line dataKey="temp" type="monotone" stroke={cc().s1} strokeWidth={2} dot={false} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="card">
        <div className="card-head"><h2>{t('wx.notes')}</h2></div>
        {frost && (
          <div className="alert alert-warn"><ListIcon name="bell" /><div>
            <strong>{t('wx.frost')}: {dayLabel(forecast, frost.day)}</strong>
            <span>{t('wx.frostNote', { value: Math.round(frost.low!.temp), time: hourOf(frost.low!.time) })}</span>
          </div></div>
        )}
        {cold && (
          <div className="alert alert-info"><ListIcon name="fire" /><div>
            <strong>{t('wx.colderFrom')}: {dayLabel(forecast, cold.day)}</strong>
            <span>{t('wx.colderNote', { value: Math.round(cold.mean) })}</span>
          </div></div>
        )}
        {!frost && !cold && <p className="help">{t('wx.noFrostNote', { value: HEAT_PUMP_MIN_MEAN })}</p>}
        <p className="help">{t('wx.degreeDaysHelp')}</p>
      </section>
    </>
  );
}
