// Zakładka Wykres kotła pelletowego (/chart), układ „Instrument” (#s-boiler-wykres): temperatury z wybranego dnia
// (GET /pellet-boiler-pelux200/list) albo spalony pellet z kosztem ogrzewania (cena pelletu w ustawieniach kotła,
// properties.pellet_price_per_ton; od 2026-10-13). Pasek filtrów: przełącznik Temperatury / Spalony pellet, nawigacja
// po dniach, chipy serii (kocioł, CWU, mieszacz 1 = CO, mieszacz 2, zewnętrzna; domyślnie wszystkie poza zewnętrzną,
// decyzja użytkownika 2026-10-13). Legenda w nagłówku karty; okresy palenia (stany stabilizacja, rozpalanie, praca,
// nadzór, wygaszanie) podświetlone pasem na wykresie. Oś X to czas (ms), nie kolejne odczyty: od 2026-10-07 serwer
// nie zapisuje identycznych odczytów, więc odstępy między punktami są nierówne. Kolory serii z core/chartColors.ts
// (tokeny --ch-1…4), czytane przy renderze, bo zależą od motywu.
import { FormEvent, useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { cc, tooltipStyle } from '../../../core/chartColors';
import { DeviceRequests } from '../../../core/api';
import Notification, { useSaveNotice } from '../../../core/components/Notification';
import { DeviceProperties } from '../../../core/types';
import { PelletBoilerRequests } from '../api';
import { DateNav, Segmented } from '../components/ui';
import { PelletBoilerFuel, PelletBoilerFuelPeriod, PelletBoilerReading } from '../types';
import { formatNumber, formatTemp, isBurning, todayWarsaw } from '../utils/boiler';
import { getLang, locale, t as tr, useLang } from '../../../core/i18n';
import './style.css';

type SeriesKey = 'mixer1_temp' | 'water_heater_temp' | 'heating_temp' | 'mixer2_temp' | 'outside_temp';

// etykiety serii ze słownika pb.chart.series.<klucz>
const SERIES_DEF: { key: SeriesKey; color: keyof ReturnType<typeof cc>; visible: boolean }[] = [
  { key: 'heating_temp', color: 's1', visible: true },
  { key: 'water_heater_temp', color: 's2', visible: true },
  { key: 'mixer1_temp', color: 's3', visible: true },
  { key: 'mixer2_temp', color: 's4', visible: true },
  { key: 'outside_temp', color: 'axis', visible: false },
];
const seriesColors = () => { const c = cc(); return SERIES_DEF.map((series) => ({ ...series, label: tr(`pb.chart.series.${series.key}`), color: c[series.color] })); };

const timeLabel = (ms: number) =>
  Number.isFinite(ms) ? new Date(ms).toLocaleTimeString(locale(getLang()), { timeZone: 'Europe/Warsaw', hour: '2-digit', minute: '2-digit' }) : '';

const monthShort = (month: number) => new Date(2026, month - 1, 1).toLocaleDateString(locale(getLang()), { month: 'short' }).replace('.', '');
const periods = (): { value: PelletBoilerFuelPeriod; label: string }[] => [
  { value: 'day', label: tr('period.day') }, { value: 'month', label: tr('period.month') }, { value: 'year', label: tr('period.year') },
];

// cena pelletu [zł/t], gdy kocioł nie ma jej w ustawieniach (serwer: DEFAULT_PELLET_PRICE_PER_TON)
const DEFAULT_PRICE_PER_TON = 2000;
const MAX_PRICE_PER_TON = 100000;
const formatMoney = (value: number) => value.toLocaleString(locale(getLang()), { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const axisProps = () => ({ tick: { fill: cc().axis, fontSize: 12 }, stroke: cc().line });

// Przedziały palenia [od, do] w ms z odczytów ułożonych od rana (koniec = czas pierwszego odczytu bez palenia).
const burningRanges = (data: { time: number; burning: boolean }[]) => {
  const ranges: [number, number][] = [];
  let start: number | null = null;
  data.forEach((point, index) => {
    if (point.burning && start === null) start = point.time;
    if (!point.burning && start !== null) { ranges.push([start, point.time]); start = null; }
    if (point.burning && index === data.length - 1 && start !== null) ranges.push([start, point.time]);
  });
  return ranges;
};

// Widok „Spalony pellet”: kg w godzinach dnia, dniach miesiąca albo miesiącach roku (GET …/fuel, licznik ze sterownika
// od firmware 1.7.1; szacunek regulatora z pracy podajnika). Pod nim koszt ogrzewania [zł] = kg / 1000 × cena pelletu
// (cała historia tą samą ceną) i karta z ceną pelletu do zapisu (przycisk skrajnie z prawej).
const FuelChart: React.FC<{ date: string; setDate: (date: string) => void }> = ({ date, setDate }) => {
  const { t } = useLang();
  const [period, setPeriod] = useState<PelletBoilerFuelPeriod>('day');
  const [fuel, setFuel] = useState<PelletBoilerFuel | null | undefined>(undefined);
  const [yearText, setYearText] = useState<string | null>(null);
  // cena pelletu z ustawień kotła; serwer zastępuje całe properties, więc zapis rozszerza wczytany obiekt
  const [properties, setProperties] = useState<DeviceProperties | null>(null);
  const [priceText, setPriceText] = useState('');
  const [priceError, setPriceError] = useState('');
  const { notice, showNotice, run, busy } = useSaveNotice();
  useEffect(() => {
    DeviceRequests.getDeviceProperties().then((result) => {
      setProperties(result ?? {});
      setPriceText(String(result?.pellet_price_per_ton ?? DEFAULT_PRICE_PER_TON));
    });
  }, []);
  const price = properties?.pellet_price_per_ton ?? DEFAULT_PRICE_PER_TON;
  useEffect(() => {
    setFuel(undefined);
    PelletBoilerRequests.getFuel(period, date).then(setFuel);
  }, [period, date]);
  const data = (fuel?.buckets ?? []).map((bucket) => ({
    label: period === 'year' ? monthShort(bucket.key) : String(bucket.key),
    kg: bucket.kg,
    cost: Math.round(bucket.kg * price / 10) / 100,
  }));
  const savePrice = async (event: FormEvent) => {
    event.preventDefault();
    const value = Number(priceText.replace(',', '.'));
    if (priceText.trim() === '' || !Number.isFinite(value) || value < 0 || value > MAX_PRICE_PER_TON) {
      return setPriceError(t('pb.chart.priceInvalid', { max: MAX_PRICE_PER_TON }));
    }
    setPriceError('');
    await run(async () => { try {
      const saved = await DeviceRequests.updateDeviceProperties({ ...(properties ?? {}), pellet_price_per_ton: value });
      setProperties(saved);
      showNotice(t('pb.chart.priceSaved'));
    } catch {
      setPriceError(t('pb.chart.priceSaveFailed'));
    } });
  };
  const bars = (key: 'kg' | 'cost', title: string, color: string, unit: string, name: string) => (
    <section className="card">
      <header className="card-head"><h2>{title}</h2></header>
      <div className="chart boiler-chart">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid stroke={cc().grid} strokeDasharray="3 3" />
            <XAxis {...axisProps()} dataKey="label" interval="preserveStartEnd" minTickGap={8} />
            <YAxis {...axisProps()} width={48} tickFormatter={(value) => formatNumber(Number(value))} />
            <Tooltip {...tooltipStyle()} formatter={(value) => [`${key === 'kg' ? formatNumber(Number(value)) : formatMoney(Number(value))} ${unit}`, name]} />
            <Bar dataKey={key} fill={color} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
  return (
    <>
      <div className="filters">
        <Segmented name="boiler-fuel-period" label={t('period.label')} inline value={period} options={periods()} onChange={setPeriod} />
        {period === 'day' && <DateNav date={date} today={todayWarsaw()} onChange={setDate} />}
        {period === 'month' && (
          <input className="boiler-period-input" type="month" value={date.slice(0, 7)} aria-label={t('period.month')}
            onChange={(event) => event.currentTarget.value && setDate(`${event.currentTarget.value}-01`)} />
        )}
        {period === 'year' && (
          <input className="boiler-period-input" type="number" min={2020} max={2100} aria-label={t('period.year')} value={yearText ?? date.slice(0, 4)}
            onBlur={() => setYearText(null)}
            onChange={(event) => {
              const text = event.currentTarget.value;
              setYearText(text);
              if (/^\d{4}$/.test(text)) setDate(`${text}-01-01`);
            }} />
        )}
      </div>
      {fuel === undefined && <section className="card"><span className="help">{t('common.loading')}</span></section>}
      {fuel === null && <section className="card"><span className="help danger-text">{t('pv.loadFailed')}</span></section>}
      {fuel && fuel.counterKg === null && <section className="card"><span className="help">{t('pb.chart.noCounter')}</span></section>}
      {fuel && fuel.counterKg !== null && (
        <>
          <div className="stat-row">
            <div className="stat"><span className="stat-label">{t('pb.chart.burned')}</span><span className="stat-value">{formatNumber(fuel.totalKg)}<small>kg</small></span></div>
            <div className="stat"><span className="stat-label">{t('pb.chart.heatingCost')}</span><span className="stat-value">{formatMoney(fuel.totalKg * price / 1000)}<small>zł</small></span></div>
          </div>
          {bars('kg', `${t('pb.chart.burned')} [kg]`, cc().heat, 'kg', t('pb.pellet'))}
          {bars('cost', `${t('pb.chart.heatingCost')} [zł]`, cc().s1, 'zł', t('pb.chart.cost'))}
        </>
      )}
      <form className="card" onSubmit={savePrice}>
        <header className="card-head"><h2>{t('pb.chart.pelletPrice')}</h2><span className="card-hint">{t('pb.chart.priceHint')}</span></header>
        <div className="form-grid">
          <label htmlFor="boiler-price">{t('pb.chart.pelletPrice')}</label>
          <div className="range-inputs">
            <input id="boiler-price" className="w-wide" type="number" min={0} max={MAX_PRICE_PER_TON} step="any" value={priceText}
              disabled={properties === null} onChange={(event) => setPriceText(event.currentTarget.value)} />
            <span className="unit-txt">zł/t</span>
          </div>
        </div>
        {priceError && <p className="help danger-text">{priceError}</p>}
        <div className="actions"><button type="submit" className="btn btn-primary" disabled={busy || properties === null}>{t('common.save')}</button></div>
      </form>
      <Notification message={notice} />
    </>
  );
};

type ChartMode = 'temperatures' | 'fuel';
const chartModes = (): { value: ChartMode; label: string }[] => [
  { value: 'temperatures', label: tr('hp.chart.temperatures') },
  { value: 'fuel', label: tr('pb.chart.burned') },
];

export const PelletBoilerChart: React.FC = () => {
  const { t } = useLang();
  const [mode, setMode] = useState<ChartMode>('temperatures');
  const [date, setDate] = useState(todayWarsaw());
  const [readings, setReadings] = useState<PelletBoilerReading[] | null>(null);
  const [visible, setVisible] = useState<Record<SeriesKey, boolean>>(
    () => Object.fromEntries(SERIES_DEF.map((series) => [series.key, series.visible])) as Record<SeriesKey, boolean>);

  useEffect(() => {
    setReadings(null);
    PelletBoilerRequests.getList(date).then((result) => setReadings(result ?? []));
  }, [date]);

  // serwer zwraca malejąco, wykres idzie od rana
  const data = [...(readings ?? [])].reverse().filter((r) => r.createdAt).map((r) => ({
    time: new Date(r.createdAt as string).getTime(),
    burning: isBurning(r.state),
    ...Object.fromEntries(SERIES_DEF.map((series) => [series.key, r[series.key]])),
  }));
  const series = seriesColors();
  const shown = series.filter((item) => visible[item.key]);

  return (
    <div className="page page-device boiler-page">
      <div className="filters">
        <Segmented name="boiler-chart-mode" label={t('pb.chart.kind')} inline value={mode} options={chartModes()} onChange={setMode} />
        {mode === 'temperatures' && (
          <>
            <DateNav date={date} today={todayWarsaw()} onChange={setDate} />
            <div className="chipset" role="group" aria-label={t('pb.chart.series')}>
              {series.map((item) => (
                <label key={item.key} className="chip-check">
                  <input type="checkbox" checked={visible[item.key]}
                    onChange={(event) => setVisible({ ...visible, [item.key]: event.currentTarget.checked })} />
                  <span>{item.label}</span>
                </label>
              ))}
            </div>
          </>
        )}
      </div>
      {mode === 'fuel' && <FuelChart date={date} setDate={setDate} />}
      {mode === 'temperatures' && (
        <section className="card">
          <header className="card-head">
            <h2>{t('pb.chart.boilerTemps')}</h2>
            <div className="legend">
              {shown.map((item) => <span key={item.key} className="lg"><i style={{ background: item.color }} />{item.label}</span>)}
            </div>
          </header>
          {readings === null && <span className="help">{t('common.loading')}</span>}
          {readings?.length === 0 && <span className="help">{t('pv.noneDay')}</span>}
          {readings && readings.length > 0 && (
            <div className="chart boiler-chart boiler-chart-lg">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data}>
                  <CartesianGrid stroke={cc().grid} strokeDasharray="3 3" />
                  <XAxis {...axisProps()} dataKey="time" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={timeLabel} minTickGap={24} />
                  <YAxis {...axisProps()} width={44} unit="°" domain={['auto', 'auto']} />
                  <Tooltip {...tooltipStyle()} labelFormatter={(value) => timeLabel(Number(value))}
                    formatter={(value, name) => [formatTemp(Number(value)), series.find((s) => s.key === name)?.label ?? name]} />
                  {/* okresy palenia: pas w kolorze rodzaju „ciepło” pod liniami */}
                  {burningRanges(data).map(([from, to]) => (
                    <ReferenceArea key={from} x1={from} x2={to} fill={cc().heat} fillOpacity={0.14} stroke="none" ifOverflow="extendDomain" />
                  ))}
                  {shown.map((item) => (
                    <Line key={item.key} type="monotone" dataKey={item.key} stroke={item.color} strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
          <p className="help">{t('pb.chart.burningHelp')}</p>
        </section>
      )}
    </div>
  );
};
