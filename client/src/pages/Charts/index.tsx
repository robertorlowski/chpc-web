import './style.css';
import { useEffect, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  ResponsiveContainer,
} from 'recharts';
import { THPL } from '../../api/type';
import DateDict from '../../components/DateDict';
import { fetchData, formatDateYMD } from '../../utils/utils';
import { ClipLoader } from 'react-spinners';
import { energyCostG12w } from '../../utils/energy-cost-g12w';

type ChartPeriod = 'day' | 'week' | 'month';

type ChartPoint = {
  time: string;
  Watts?: number;
  pv?: number;
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

const getDates = (
  selectedDate: string,
  period: ChartPeriod,
): string[] => {
  const selected = parseSelectedDate(selectedDate);
  const year = selected.getFullYear();
  const month = selected.getMonth();

  let start: Date;
  let end: Date;

  if (period === 'month') {
    start = new Date(year, 0, 1);
    end = new Date(year, 11, 31);
  } else if (period === 'week') {
    start = new Date(year, month, 1);
    end = new Date(year, month + 1, 0);
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

const getMonday = (date: Date): Date => {
  const result = new Date(date);
  const day = result.getDay() || 7;

  result.setDate(result.getDate() - day + 1);
  return result;
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
  return new Intl.DateTimeFormat('pl-PL', {
    month: 'long',
  }).format(new Date(2020, month, 1));
};

export const HeatPumpChart: React.FC = () => {
  const [filteredData, setFilteredData] = useState<ChartPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState(
    formatDateYMD(new Date()),
  );
  const [period, setPeriod] = useState<ChartPeriod>('day');
  const [allData, setAllData] = useState(false);
  const [kwh, setKwh] = useState(0);
  const [kwhPV, setKwhPV] = useState(0);
  const [cTemp, setTemp] = useState(true);
  const [cPower, setPower] = useState(true);
  const [cPV, setPV] = useState(false);
  const [cost, setCost] = useState(0);

  const selected = parseSelectedDate(selectedDate);
  const selectedYear = selected.getFullYear();
  const selectedMonth = selected.getMonth();

  const years = Array.from(
    { length: 4 },
    (_, index) => new Date().getFullYear() - 3 + index,
  );

  const changeYear = (year: number) => {
    setSelectedDate(
      toDateString(new Date(year, selectedMonth, 1)),
    );
  };

  const changeMonth = (month: number) => {
    setSelectedDate(
      toDateString(new Date(selectedYear, month, 1)),
    );
  };

  useEffect(() => {
    let active = true;

    const loadData = async () => {
      setLoading(true);

      try {
        const dates = getDates(selectedDate, period);

        const responses = await Promise.all(
          dates.map((date) => fetchData(true, date)),
        );

        if (!active) return;

        const dailyResults = responses.map((response, index) => {
          const rows = Array.isArray(response)
            ? (response as THPL[])
            : [];

          const result = energyCostG12w(rows, {
            maxGapMinutes: 15,
          });

          return {
            date: dates[index],
            rows,
            energy: Number(result.consumptionKWh || 0),
            pv: Number(result.pvUsedKWh || 0),
          };
        });

        const data = responses.flat() as THPL[];
        const total = energyCostG12w(data, {
          maxGapMinutes: 15,
        });

        setKwh(total.consumptionKWh || 0);
        setKwhPV(
          (total.consumptionKWh || 0) - (total.pvUsedKWh || 0),
        );
        setCost(total.totalVariableCostPLN || 0);

        if (period === 'day') {
          const points = (responses[0] as THPL[])
            .filter((row) => row?.time)
            .filter((row) => allData || isCompressorWorking(row))
            .filter((_, index) => index % 5 === 0)
            .sort((a, b) => a.time.localeCompare(b.time))
            .map((row) => ({
              ...row,
              time: row.time.split(' ')[1]?.slice(0, 5) || row.time,
              Tbe: row.Tbe != null ? Number(row.Tbe) : undefined,
              Tae: row.Tae != null ? Number(row.Tae) : undefined,
              Tho: row.Tho != null ? Number(row.Tho) : undefined,
              Ttarget: row.Ttarget != null ? Number(row.Ttarget) : undefined,
              Watts: row.Watts != null ? Number(row.Watts) : undefined,
              pv: row.pv != null ? Number(row.pv) : undefined,
            }));

          setFilteredData(points);
        } else if (period === 'month') {
          const points = Array.from({ length: 12 }, (_, month) => {
            const monthData = dailyResults.filter((item) => {
              return new Date(`${item.date}T00:00:00`).getMonth() === month;
            });

            return {
              time: getMonthName(month),
              Watts: Number(monthData.reduce(
                (sum, item) => sum + item.energy,
                0,
              ).toFixed(2)),
              pv: Number(monthData.reduce(
                (sum, item) => sum + item.pv,
                0,
              ).toFixed(2)),
            };
          });

          setFilteredData(points);
        } else {
          const weeks = new Map<
            string,
            { energy: number; pv: number }
          >();

          dailyResults.forEach((item) => {
            const monday = toDateString(
              getMonday(new Date(`${item.date}T00:00:00`)),
            );

            const current = weeks.get(monday) || {
              energy: 0,
              pv: 0,
            };

            weeks.set(monday, {
              energy: current.energy + item.energy,
              pv: current.pv + item.pv,
            });
          });

          setFilteredData(
            Array.from(weeks.entries()).map(([week, value]) => ({
              time: `Tydz. ${week}`,
              Watts: parseFloat(value.energy.toFixed(2)),
              pv: parseFloat(value.pv.toFixed(2)),
            })),
          );
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
          Pobrana energia
        </span>
      )}

      {cPV && (
        <span>
          <i className="legend-color pv-color" />
          PV
        </span>
      )}

      {isDay && cTemp && (
        <>
          <span>
            <i className="legend-color tbe-color" />
            Tbe
          </span>
          <span>
            <i className="legend-color tae-color" />
            Tae
          </span>
          <span>
            <i className="legend-color tho-color" />
            Tho
          </span>
          <span>
            <i className="legend-color target-color" />
            Temperatura docelowa
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
          className={period === 'week' ? 'active' : ''}
          onClick={() => setPeriod('week')}
        >
          Tydzień
        </button>

        <button
          className={period === 'month' ? 'active' : ''}
          onClick={() => setPeriod('month')}
        >
          Miesiąc
        </button>
      </div>

      {isDay && (
        <DateDict
          id="date-select"
          initValue={selectedDate}
          onDateChange={setSelectedDate}
        />
      )}

      {period === 'week' && (
        <div className="period-filter">
          <label>
            Rok:
            <select
              value={selectedYear}
              onChange={(event) =>
                changeYear(Number(event.target.value))
              }
            >
              {years.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </label>

          <label>
            Miesiąc:
            <select
              value={selectedMonth}
              onChange={(event) =>
                changeMonth(Number(event.target.value))
              }
            >
              {Array.from({ length: 12 }, (_, month) => (
                <option key={month} value={month}>
                  {getMonthName(month)}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {period === 'month' && (
        <div className="period-filter">
          <label>
            Rok:
            <select
              value={selectedYear}
              onChange={(event) =>
                changeYear(Number(event.target.value))
              }
            >
              {years.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </label>
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
          Pobrana energia
        </label>

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
        Zużycie: {kwhPV.toFixed(2)} / {kwh.toFixed(2)} kWh
        <br />
        Koszt: {cost.toFixed(2)} PLN
      </div>

      <ResponsiveContainer width="100%" height="75%">
        <LineChart data={filteredData}>
          <CartesianGrid strokeDasharray="1 1" />
          <XAxis dataKey="time" />
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
              value: isDay ? 'Moc [W]' : 'Energia [kWh]',
              angle: -90,
              position: 'insideRight',
            }}
          />
          <Tooltip />
          <Legend content={renderLegend} />

          <Line
            yAxisId="right"
            type="monotone"
            dataKey="Watts"
            name={isDay ? 'Moc [W]' : 'Pobrana energia [kWh]'}
            stroke="#5f5050"
            dot={{ r: 1 }}
            hide={!cPower}
          />

          <Line
            yAxisId="right"
            type="monotone"
            dataKey="pv"
            name={isDay ? 'PV [W]' : 'PV [kWh]'}
            stroke="#ec30a4"
            dot={{ r: 1 }}
            hide={!cPV}
          />

          <Line
            yAxisId="left"
            type="monotone"
            dataKey="Tbe"
            name="Tbe [°C]"
            stroke="#463de0"
            dot={{ r: 1 }}
            connectNulls
            hide={period !== 'day' || !cTemp}
          />

          <Line
            yAxisId="left"
            type="monotone"
            dataKey="Tae"
            name="Tae [°C]"
            stroke="#0ace55"
            dot={{ r: 1 }}
            connectNulls
            hide={period !== 'day' || !cTemp}
          />

          <Line
            yAxisId="left"
            type="monotone"
            dataKey="Tho"
            name="Tho [°C]"
            stroke="#c4922f"
            dot={{ r: 1 }}
            connectNulls
            hide={period !== 'day' || !cTemp}
          />

          <Line
            yAxisId="left"
            type="monotone"
            dataKey="Ttarget"
            name="Temperatura docelowa [°C]"
            stroke="#ec1b4f"
            dot={{ r: 1 }}
            connectNulls
            hide={period !== 'day' || !cTemp}
          />

          <Line
            yAxisId="left"
            type="monotone"
            dataKey="HPS"
            name="Czynność kompresora"
            stroke="#f4f4f4"
            dot={{ r: 1 }}
            hide={!cPower}
            isCompressorWorking={isCompressorWorking}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};


