// Zakładka „Powietrze” strony pogody (makieta #pogoda-powietrze): europejski indeks jakości powietrza (EAQI) z oceną,
// PM2.5, PM10, NO₂, ozon, słupki na 24 h i pyłki (Open-Meteo Air Quality, CAMS Europe; pobierane dopiero po otwarciu
// zakładki). Pyłki są tylko w Europie i w sezonie; poza nim Open-Meteo podaje brak albo 0.
import { useEffect, useState } from 'react';
import { AirQuality, fetchAirQuality, hourOf } from './forecast';
import { t as tr, useLang } from '../../i18n';

const HOURS = 24;
// progi EAQI (Europejska Agencja Środowiska): ocena słowna i kolor (dobra / umiarkowana–dostateczna / zła)
const AQI_LEVELS: { max: number; key: string; tone: 'ok' | 'warn' | 'err' }[] = [
  { max: 20, key: 'veryGood', tone: 'ok' }, { max: 40, key: 'good', tone: 'ok' },
  { max: 60, key: 'moderate', tone: 'warn' }, { max: 80, key: 'fair', tone: 'warn' },
  { max: 100, key: 'poor', tone: 'err' }, { max: Infinity, key: 'veryPoor', tone: 'err' },
];
const aqiLevel = (value: number) => { const level = AQI_LEVELS.find((item) => value <= item.max)!; return { ...level, label: tr(`wx.aqi.${level.key}`) }; };
const CHIP: Record<'ok' | 'warn' | 'err', string> = { ok: 'chip-ok', warn: 'chip-warn', err: 'chip-err' };

const POLLEN: (keyof Omit<AirQuality['hourly'], 'time' | 'european_aqi'>)[] = ['alder_pollen', 'birch_pollen', 'grass_pollen', 'mugwort_pollen', 'ragweed_pollen'];
// stężenie pyłków [ziarna/m³] słownie; progi przybliżone, wspólne dla gatunków
function pollenLevel(value: number | null): { label: string; chip: string } {
  if (value === null || value < 1) return { label: tr(value === null ? 'wx.pollen.noData' : 'wx.pollen.offSeason'), chip: 'chip-off' };
  if (value < 10) return { label: tr('wx.pollen.low'), chip: 'chip-ok' };
  if (value < 50) return { label: tr('wx.pollen.medium'), chip: 'chip-warn' };
  if (value < 200) return { label: tr('wx.pollen.high'), chip: 'chip-err' };
  return { label: tr('wx.pollen.veryHigh'), chip: 'chip-err' };
}

const micro = (value: number | null) => value === null ? '—' : String(Math.round(value));

export function AirTab({ lat, lon }: { lat: number; lon: number }) {
  const { t } = useLang();
  const [air, setAir] = useState<AirQuality | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    fetchAirQuality(lat, lon)
      .then((data) => { if (!cancelled) { setAir(data); setError(''); } })
      .catch(() => { if (!cancelled) setError(t('wx.airFailed')); });
    return () => { cancelled = true; };
  }, [lat, lon]);

  if (error) return <div className="alert alert-err"><div><strong>{error}</strong></div></div>;
  if (!air) return <p className="app-loading">{t('wx.loadingAir')}</p>;

  const { current, hourly } = air;
  const start = Math.max(0, hourly.time.findIndex((time) => time >= current.time.slice(0, 13) + ':00'));
  const hours = hourly.time.slice(start, start + HOURS).map((time, offset) => ({ time, aqi: hourly.european_aqi[start + offset] }));
  const worst = hours.reduce<(typeof hours)[number] | null>((found, hour) => (hour.aqi !== null && (!found || hour.aqi > (found.aqi ?? -1)) ? hour : found), null);
  const level = current.european_aqi !== null ? aqiLevel(current.european_aqi) : null;
  // pyłki: najwyższe stężenie w najbliższych 24 h
  const pollen = POLLEN.map((key) => {
    const values = hourly[key].slice(start, start + HOURS).filter((value): value is number => value !== null);
    return { key, label: t(`wx.pollen.${key}`), value: values.length ? Math.max(...values) : null };
  });

  return (
    <>
      <section className="card card-hero">
        <div className="hero-main">
          <span className="hero-label">{t('wx.airQualityLabel')}</span>
          <div className="hero-value"><span className="hero-num">{micro(current.european_aqi)}</span><span className="hero-unit">EAQI</span></div>
          {level && <div className="wx-hero-desc"><span className={`chip ${CHIP[level.tone]}`}>{level.label}</span></div>}
          {worst?.aqi != null && worst.aqi > (current.european_aqi ?? 0) && (
            <span className="hero-note">{t('wx.worstAt', { when: worst.time.slice(0, 10) > current.time.slice(0, 10) ? `${t('wx.tomorrow')} ` : '', time: hourOf(worst.time), value: worst.aqi, label: aqiLevel(worst.aqi).label })}</span>
          )}
        </div>
        <div className="hero-side"><div className="hero-kpis">
          <div className="kpi"><span className="kpi-label">PM2.5</span><span className="kpi-value">{micro(current.pm2_5)}<small>µg/m³</small></span></div>
          <div className="kpi"><span className="kpi-label">PM10</span><span className="kpi-value">{micro(current.pm10)}<small>µg/m³</small></span></div>
          <div className="kpi"><span className="kpi-label">NO₂</span><span className="kpi-value">{micro(current.nitrogen_dioxide)}<small>µg/m³</small></span></div>
          <div className="kpi"><span className="kpi-label">{t('wx.ozone')}</span><span className="kpi-value">{micro(current.ozone)}<small>µg/m³</small></span></div>
        </div></div>
      </section>

      <section className="card">
        <div className="card-head"><h2>{t('wx.next24')}</h2><span className="card-hint">EAQI</span></div>
        <div className="wx-aq" role="list" aria-label={t('wx.airNext24')}>
          {hours.map((hour, index) => (
            <div key={hour.time} className="wx-aq-col" role="listitem" title={`${hourOf(hour.time)} · EAQI ${hour.aqi ?? '—'}`}>
              <span className={`wx-aq-bar wx-aq-${hour.aqi !== null ? aqiLevel(hour.aqi).tone : 'ok'}`} style={{ '--h': `${Math.min(100, Math.round(((hour.aqi ?? 0) / 80) * 100))}%` } as React.CSSProperties} />
              <span className="wx-aq-time">{index % 3 === 0 ? Number(hourOf(hour.time).slice(0, 2)) : ''}</span>
            </div>
          ))}
        </div>
        <div className="legend">
          <span className="lg"><i className="wx-aq-ok" />{t('wx.aqiLegendGood')}</span>
          <span className="lg"><i className="wx-aq-warn" />{t('wx.aqiLegendModerate')}</span>
          <span className="lg"><i className="wx-aq-err" />{t('wx.aqiLegendPoor')}</span>
        </div>
      </section>

      <section className="card">
        <div className="card-head"><h2>{t('wx.pollenTitle')}</h2><span className="card-hint">{t('wx.pollenHint')}</span></div>
        <dl className="kv">
          {pollen.map((item) => {
            const state = pollenLevel(item.value);
            return (
              <div key={item.key}>
                <dt>{item.label}</dt>
                <dd><span className={`chip ${state.chip}`}>{state.label}</span>{item.value !== null && item.value >= 1 && <small> {Math.round(item.value)} {t('wx.grainsPerM3')}</small>}</dd>
              </div>
            );
          })}
        </dl>
      </section>
    </>
  );
}
