import './style.css';
import { useEffect, useState } from 'react';
import {
  LineChart,
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
} from 'recharts';
import { THPL } from '../../api/type';
import DateDict from '../../components/DateDict';
import {
  fetchData,
  fetchMonthlySummary,
  formatDateYMD,
} from '../../utils/utils';
import { ClipLoader } from 'react-spinners';
import { energyCostG12w } from '../../utils/energy-cost-g12w';

type ChartPeriod = 'day' | 'month' | 'year';

type ChartPoint = {
  time: string;
  timeValue?: number;
  Watts?: number;
  pv?: number;
  cost?: number;
  Tbe?: number;
  Tae?: number;
  Tho?: number;
  Ttarget?: number;
};

const parseSelectedDate = (value: string): Date => {
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})/);

  if (iso) {
    return new Date(
      Number(iso[1]),
      Number(iso[2]) - 1,
      Number(iso[3]),
    );
  }

  const polish = value.match(/^(\d{2})[./-](\d{2})[./-](\d{4})/);

  if (polish) {
    return new Date(
      Number(polish[3]),
      Number(polish[2]) - 1,
      Number(polish[1]),
    );
  }

  return new Date(value);
};

const toDateString = (date: Date): string => {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
};

const getRowDate = (time: string): string => {
  const date = time.split(/[ T]/)[0] || '';
  const parts = date.split(/[./-]/);

  if (parts.length !== 3) return date;
  if (parts[0].length === 4) return parts.join('-');
  return `${parts[2]}-${parts[1]}-${parts[0]}`;
};

const getDates = (
  selectedDate: string,
  period: ChartPeriod,
): string[] => {
  const selected = parseSelectedDate(selectedDate);
  const year = selected.getFullYear();

  let start: Date;
  let end: Date;

  if (period === 'year') {
    start = new Date(year, 0, 1);
    end = new Date(year, 11, 31);
  } else if (period === 'month') {
    start = new Date(year, selected.getMonth(), 1);
    end = new Date(year, selected.getMonth() + 1, 0);
  } else {
    start = selected;
    end = selected;
  }

  const dates: string[] = [];

  for (
    const date = new Date(start);
    date <= end;
    date.setDate(date.getDate() + 1)
  ) {
    dates.push(toDateString(date));
  }

  return dates;
};

const isCompressorWorking = (row: THPL): boolean => {
  const value = (row as THPL & { HPS?: unknown }).HPS;

  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;

  return ['true', '1', 'on', 'active', 'working', 'yes'].includes(
    String(value).trim().toLowerCase(),
  );
};

const getMonthName = (month: number): string => {
  return String(month + 1);
};

const getTimeValue = (time: string): number => {
  const match = time.match(/[ T](\d{2}):(\d{2})/);
  if (!match) return 0;

  return Number(match[1]) * 60 + Number(match[2]);
};

const formatTimeValue = (value: number): string => {
  const minutes = Math.max(0, Math.min(24 * 60, Math.round(value)));
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;

  return `${String(hours).padStart(2, '0')}:${String(restMinutes).padStart(2, '0')}`;
};

const dayTicks = Array.from({ length: 13 }, (_, index) => index * 120);

const getDayTicks = (endMinutes: number): number[] => {
  const ticks = dayTicks.filter((tick) => tick < endMinutes);

  if (endMinutes > 0 && !ticks.includes(endMinutes)) {
    ticks.push(endMinutes);
  }

  return ticks;
};

const formatTooltipLabel = (name: unknown): string => ({
  Watts: 'Energia pob.',
  pv: 'PV',
  cost: 'Koszt',
  Tbe: 'T. przed parownikiem',
  Tae: 'T. za parownikiem',
  Tho: 'T. wody wyj.',
  Ttarget: 'T. docelowa',
  'Energia pob. [W]': 'Energia pob.',
  'PV [W]': 'PV',
  'Koszt [PLN]': 'Koszt',
  'Energia pobrana [kWh]': 'Energia pobrana',
  'PV [kWh]': 'PV [kWh]',
}[String(name)] ?? String(name));

const formatTooltipValue = (item: ChartTooltipItem, isDay: boolean): string => {
  const dataKey = String(item.dataKey ?? item.name);
  const value = String(item.value ?? '---');
  const unit = dataKey === 'cost'
    ? 'PLN'
    : ['Tbe', 'Tae', 'Tho', 'Ttarget'].includes(dataKey)
      ? '\u00B0C'
      : dataKey === 'Watts' || dataKey === 'pv'
        ? (isDay ? 'W' : 'kWh')
        : '';

  return unit ? `${value}${unit}` : value;
};

type ChartTooltipItem = {
  dataKey?: string | number;
  name?: string | number;
  value?: unknown;
  color?: string;
};

type ChartTooltipProps = {
  active?: boolean;
  payload?: ChartTooltipItem[];
  label?: string | number;
  isDay: boolean;
  allData: boolean;
};

const ChartTooltip: React.FC<ChartTooltipProps> = ({
  active,
  payload,
  label,
  isDay,
  allData,
}) => {
  if (!active || !payload?.length) return null;

  const labelText = isDay && allData
    ? formatTimeValue(Number(label))
    : String(label ?? '');

  return (
    <div className="chart-tooltip">
      <span className="chart-tooltip-label">{labelText}</span>
      {payload.map((item, index) => (
        <span className="chart-tooltip-item" key={`${String(item.dataKey ?? item.name)}-${index}`}>
          <i
            className="chart-tooltip-color"
            style={{ backgroundColor: item.color ?? '#666' }}
          />
          {formatTooltipLabel(item.dataKey ?? item.name)}:{' '}{formatTooltipValue(item, isDay)}
        </span>
      ))}
    </div>
  );
};

export const HeatPumpChart: React.FC = () => {
  const [filteredData, setFilteredData] = useState<ChartPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState(
    formatDateYMD(new Date()),
  );
  const [period, setPeriod] = useState<ChartPeriod>('day');
  const [allData, setAllData] = useState(true);
  const [kwh, setKwh] = useState(0);
  const [kwhPV, setKwhPV] = useState(0);
  const [cTemp, setTemp] = useState(true);
  const [cPower, setPower] = useState(true);
  const [cPV, setPV] = useState(false);
  const [cCost, setCostVisible] = useState(true);
  const [cost, setCost] = useState(0);
  const [currentTime, setCurrentTime] = useState(new Date());

  const selected = parseSelectedDate(selectedDate);
  const selectedYear = selected.getFullYear();
  const selectedMonth = selected.getMonth();
  const isCurrentDay = selectedDate === formatDateYMD(currentTime);
  const currentDayEnd = currentTime.getHours() * 60 + currentTime.getMinutes();
  const dayEndMinutes = isCurrentDay ? Math.max(currentDayEnd, 1) : 24 * 60;
  const visibleDayTicks = getDayTicks(dayEndMinutes);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCurrentTime(new Date());
    }, 60 * 1000);

    return () => window.clearInterval(timer);
  }, []);

  const years = Array.from(
    { length: 4 },
    (_, index) => new Date().getFullYear() - 3 + index,
  );

  const changeYear = (year: number) => {
    setSelectedDate(
      toDateString(new Date(year, selectedMonth, 1)),
    );
  };

  useEffect(() => {
    let active = true;

    const loadData = async () => {
      setLoading(true);

      try {
        const dates = getDates(selectedDate, period);

        if (period === 'year') {
          const summaries = await fetchMonthlySummary(
            dates[0],
            dates[dates.length - 1],
          );

          if (!active) return;

          const monthlyData = summaries || [];
          const total = monthlyData.reduce(
            (value, item) => ({
              energy: value.energy + Number(item.consumptionKWh || 0),
              grid: value.grid + Number(item.gridEnergyKWh || 0),
              cost: value.cost + Number(
                Number(item.totalVariableCostPLN || 0).toFixed(2),
              ),
            }),
            { energy: 0, grid: 0, cost: 0 },
          );

          setKwh(Number(total.energy.toFixed(2)));
          setKwhPV(Number(total.grid.toFixed(2)));
          setCost(Number(total.cost.toFixed(2)));
          setFilteredData(Array.from({ length: 12 }, (_, monthIndex) => {
            const item = monthlyData.find(
              (summary) => summary.month === monthIndex + 1,
            );

            return {
              time: getMonthName(monthIndex),
              Watts: Number(Number(item?.consumptionKWh || 0).toFixed(2)),
              pv: Number(Number(item?.pvUsedKWh || 0).toFixed(2)),
              cost: Number(Number(item?.totalVariableCostPLN || 0).toFixed(2)),
            };
          }));
          return;
        }

        if (period === 'month') {
          const summaries = await fetchMonthlySummary(
            dates[0],
            dates[dates.length - 1],
            'day',
          );

          if (!active) return;

          const dailyData = summaries || [];
          const total = dailyData.reduce(
            (value, item) => ({
              energy: value.energy + Number(item.consumptionKWh || 0),
              grid: value.grid + Number(item.gridEnergyKWh || 0),
              cost: value.cost + Number(item.totalVariableCostPLN || 0),
            }),
            { energy: 0, grid: 0, cost: 0 },
          );

          setKwh(Number(total.energy.toFixed(2)));
          setKwhPV(Number(total.grid.toFixed(2)));
          setCost(Number(total.cost.toFixed(2)));
          setFilteredData(dates.map((date) => {
            const day = Number(date.slice(8, 10));
            const item = dailyData.find((summary) => summary.day === day);

            return {
              time: String(day),
              Watts: Number(Number(item?.consumptionKWh || 0).toFixed(2)),
              pv: Number(Number(item?.pvUsedKWh || 0).toFixed(2)),
              cost: Number(Number(item?.totalVariableCostPLN || 0).toFixed(2)),
            };
          }));
          return;
        }

        const data = await fetchData(
          true,
          dates[0],
          dates[dates.length - 1],
        );

        if (!active) return;

        const rowsByDate = new Map<string, THPL[]>();
        data.forEach((row) => {
          const dateRows = rowsByDate.get(getRowDate(row.time)) || [];
          dateRows.push(row);
          rowsByDate.set(getRowDate(row.time), dateRows);
        });

        const dailyResults = dates.map((date) => {
          const rows = rowsByDate.get(date) || [];

          const result = energyCostG12w(rows, {
            maxGapMinutes: 15,
          });

          return {
            date,
            rows,
            energy: Number(result.consumptionKWh || 0),
            pv: Number(result.pvUsedKWh || 0),
            cost: Number(result.totalVariableCostPLN || 0),
          };
        });

        const periodTotal = dailyResults.reduce(
          (total, item) => ({
            energy: total.energy + item.energy,
            pv: total.pv + item.pv,
            cost: total.cost + item.cost,
          }),
          { energy: 0, pv: 0, cost: 0 },
        );

        setKwh(Number(periodTotal.energy.toFixed(2)));
        setKwhPV(Number((periodTotal.energy - periodTotal.pv).toFixed(2)));
        setCost(periodTotal.cost);

        if (period === 'day') {
          const points = data
            .filter((row) => row?.time)
            .filter((row) => allData || isCompressorWorking(row))
            .filter((_, index) => index % 5 === 0)
            .sort((a, b) => a.time.localeCompare(b.time))
            .map((row) => ({
              ...row,
              timeValue: getTimeValue(row.time),
              time: row.time.split(' ')[1]?.slice(0, 5) || row.time,
              Tbe: row.Tbe != null ? Number(row.Tbe) : undefined,
              Tae: row.Tae != null ? Number(row.Tae) : undefined,
              Tho: row.Tho != null ? Number(row.Tho) : undefined,
              Ttarget: row.Ttarget != null ? Number(row.Ttarget) : undefined,
              Watts: row.Watts != null ? Number(row.Watts) : undefined,
              pv: row.pv != null ? Number(row.pv) : undefined,
            }));

          setFilteredData(points);
        } else {
          setFilteredData(dailyResults.map((item) => ({
            time: String(Number(item.date.slice(8, 10))),
            Watts: Number(item.energy.toFixed(2)),
            pv: Number(item.pv.toFixed(2)),
            cost: Number(item.cost.toFixed(2)),
          })));
        }
      } catch (error) {
        console.error('Błąd ładowania danych:', error);
      } finally {
        if (active) setLoading(false);
      }
    };

    loadData();

    return () => {
      active = false;
    };
  }, [selectedDate, period, allData]);

  const isDay = period === 'day';

  const renderLegend = () => (
    <div className="custom-legend">
      {cPower && (
          <span>
            <i className="legend-color power-color" />
            Energia pob.
        </span>
      )}

      {cPV && (
        <span>
          <i className="legend-color pv-color" />
          PV
        </span>
      )}

      {!isDay && cCost && (
        <span>
          <i className="legend-color cost-color" />
          Szcowany koszt [PLN]
        </span>
      )}

      {isDay && cTemp && (
        <>
          <span>
            <i className="legend-color tbe-color" />
            T. przed parownikiem
          </span>
          <span>
            <i className="legend-color tae-color" />
            T. za parownikiem
          </span>
          <span>
            <i className="legend-color tho-color" />
            T. wody wyj.
          </span>
          <span>
            <i className="legend-color target-color" />
            T. docelowa
          </span>
        </>
      )}
    </div>
  );

  return (
    <div className="charts-page">
      <div className="period-selector">
        <button
          className={period === 'day' ? 'active' : ''}
          onClick={() => setPeriod('day')}
        >
          Dzień
        </button>

        <button
          className={period === 'month' ? 'active' : ''}
          onClick={() => setPeriod('month')}
        >
          Miesiąc
        </button>

        <button
          className={period === 'year' ? 'active' : ''}
          onClick={() => setPeriod('year')}
        >
          Rok
        </button>
      </div>

      {isDay && (
        <div className="period-filter">
          <label>Dzień:
          <DateDict
            id="date-select"
            initValue={selectedDate}
            onDateChange={setSelectedDate}
          />
          </label>
        </div>
      )}

      {period !== 'day' && (
        <div className="period-filter">
          <label>
            Rok:
            <select value={selectedYear} onChange={(event) => changeYear(Number(event.target.value))}>{years.map((year) => <option key={year} value={year}>{year}</option>)}</select>
          </label>

          {period === 'month' && (
            <label>
              Miesiąc:
              <select value={selectedMonth} onChange={(event) => setSelectedDate(toDateString(new Date(selectedYear, Number(event.target.value), 1)))}>{Array.from({ length: 12 }, (_, month) => <option key={month} value={month}>{getMonthName(month)}</option>)}</select>
            </label>
          )}
        </div>
      )}

      {loading && (
        <div className="loader">
          <ClipLoader size={60} color="#333" />
        </div>
      )}

      <div className="chart-checkbox">
        {isDay && (
          <>
            <label className="label">
              <input
                type="checkbox"
                checked={allData}
                onChange={(event) =>
                  setAllData(event.target.checked)
                }
              />
              Cały dzień
            </label>

            <label className="label">
              <input
                type="checkbox"
                checked={cTemp}
                onChange={(event) =>
                  setTemp(event.target.checked)
                }
              />
              Temperatura
            </label>
          </>
        )}

        <label className="label">
          <input
            type="checkbox"
            checked={cPower}
            onChange={(event) =>
              setPower(event.target.checked)
            }
          />
          Energia pob.
        </label>

        {!isDay && (
          <label className="label">
            <input
              type="checkbox"
              checked={cCost}
              onChange={(event) => setCostVisible(event.target.checked)}
            />
            Koszt
          </label>
        )}

        <label className="label">
          <input
            type="checkbox"
            checked={cPV}
            onChange={(event) => setPV(event.target.checked)}
          />
          PV
        </label>
      </div>

      <div className="energy-summary">
        <span>
        Zużycie: {kwhPV.toFixed(2)} / {kwh.toFixed(2)} kWh
        </span>
        <span>
        Koszt: {cost.toFixed(2)} PLN
        </span>
      </div>

      <div className="chart-area">
      <ResponsiveContainer width="100%" height="100%">
        {isDay ? <LineChart data={filteredData}>
          <CartesianGrid strokeDasharray="1 1" />
          {allData ? (
            <XAxis
              type="number"
              dataKey="timeValue"
              domain={[0, dayEndMinutes]}
              ticks={visibleDayTicks}
              tickFormatter={formatTimeValue}
              allowDataOverflow={false}
            />
          ) : (
            <XAxis dataKey="time" />
          )}
          <YAxis
            yAxisId="left"
            label={{
              value: isDay ? 'Temperatura [°C]' : 'Energia [kWh]',
              angle: -90,
              position: 'insideLeft',
            }}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            label={{
              value: isDay ? 'Moc [W]' : 'Koszt [PLN]',
              angle: -90,
              position: 'insideRight',
            }}
          />
          <Tooltip
            content={<ChartTooltip isDay={isDay} allData={allData} />}
            position={{ x: 0, y: -30 }}
            allowEscapeViewBox={{ x: false, y: true }}
            wrapperStyle={{ width: '100%', pointerEvents: 'none' }}
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="Watts"
            name="Energia pob. [W]"
            stroke="#5f5050"
            strokeWidth={1}
            dot={{ r: 1 }}
            hide={!cPower}
          />

          <Line
            yAxisId="right"
            type="monotone"
            dataKey="pv"
            name="PV [W]"
            stroke="#ec30a4"
            strokeWidth={1}
            dot={{ r: 1 }}
            hide={!cPV}
          />

          <Line
            yAxisId="right"
            type="monotone"
            dataKey="cost"
            name="Koszt [PLN]"
            stroke="#e06b2f"
            strokeWidth={1}
            dot={{ r: 2 }}
            hide={isDay || !cCost}
          />

          <Line
            yAxisId="left"
            type="monotone"
            dataKey="Tbe"
            name="T. przed parownikiem [°C]"
            stroke="#463de0"
            strokeWidth={1}
            dot={{ r: 1 }}
            connectNulls
            hide={period !== 'day' || !cTemp}
          />

          <Line
            yAxisId="left"
            type="monotone"
            dataKey="Tae"
            name="T. za parownikiem [°C]"
            stroke="#0ace55"
            strokeWidth={1}
            dot={{ r: 1 }}
            connectNulls
            hide={period !== 'day' || !cTemp}
          />

          <Line
            yAxisId="left"
            type="monotone"
            dataKey="Tho"
            name="T. wody wyj. [°C]"
            stroke="#c4922f"
            strokeWidth={1}
            dot={{ r: 1 }}
            connectNulls
            hide={period !== 'day' || !cTemp}
          />

          <Line
            yAxisId="left"
            type="monotone"
            dataKey="Ttarget"
            name="T. docelowa [°C]"
            stroke="#ec1b4f"
            strokeWidth={1}
            dot={{ r: 1 }}
            connectNulls
            hide={period !== 'day' || !cTemp}
          />
        </LineChart> : <ComposedChart data={filteredData}>
          <CartesianGrid strokeDasharray="1 1" />
          <XAxis dataKey="time" />
          <YAxis
            yAxisId="left"
            label={{
              value: 'Energia [kWh]',
              angle: -90,
              position: 'insideLeft',
            }}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            label={{
              value: 'Koszt [PLN]',
              angle: -90,
              position: 'insideRight',
            }}
          />
          <Tooltip
            content={<ChartTooltip isDay={false} allData={allData} />}
            position={{ x: 0, y: -48 }}
            allowEscapeViewBox={{ x: false, y: true }}
            wrapperStyle={{ width: '100%', pointerEvents: 'none' }}
          />
          <Bar
            yAxisId="left"
            dataKey="Watts"
            name="Energia pobrana [kWh]"
            fill="#1481a5"
            hide={!cPower}
          />
          <Line
            yAxisId="left"
            dataKey="pv"
            name="PV [kWh]"
            stroke="#ec30a4"
            strokeWidth={3}
            type="monotone"
            dot={{ r: 2 }}
            hide={!cPV}
          />
          <Line
            yAxisId="right"
            dataKey="cost"
            name="Koszt [PLN]"
            stroke="#e06b2f"
            strokeWidth={3}
            type="monotone"
            dot={{ r: 2 }}
            hide={!cCost}
          />
        </ComposedChart>}
      </ResponsiveContainer>
      </div>
      <div className="chart-legend-bottom">
        {renderLegend()}
      </div>
    </div>
  );
};


