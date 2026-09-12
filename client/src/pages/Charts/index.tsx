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
  Legend,
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
              pv: value.pv + Number(item.pvUsedKWh || 0),
              cost: value.cost + Number(
                Number(item.totalVariableCostPLN || 0).toFixed(2),
              ),
            }),
            { energy: 0, pv: 0, cost: 0 },
          );

          setKwh(Number(total.energy.toFixed(2)));
          setKwhPV(Number(total.pv.toFixed(2)));
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
              pv: value.pv + Number(item.pvUsedKWh || 0),
              cost: value.cost + Number(item.totalVariableCostPLN || 0),
            }),
            { energy: 0, pv: 0, cost: 0 },
          );

          setKwh(Number(total.energy.toFixed(2)));
          setKwhPV(Number(total.pv.toFixed(2)));
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
          Koszt [PLN]
        </span>
      )}

      {isDay && cTemp && (
        <>
          <span>
            <i className="legend-color tbe-color" />
            Temp. przed parownikiem
          </span>
          <span>
            <i className="legend-color tae-color" />
            Temp. za parownikiem 
          </span>
          <span>
            <i className="legend-color tho-color" />
            Temp. wody wyj.
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

          {period === 'month' && (
            <label>
              Miesiąc:
              <select
                value={selectedMonth}
                onChange={(event) =>
                  setSelectedDate(
                    toDateString(new Date(
                      selectedYear,
                      Number(event.target.value),
                      1,
                    )),
                  )
                }
              >
                {Array.from({ length: 12 }, (_, month) => (
                  <option key={month} value={month}>
                    {getMonthName(month)}
                  </option>
                ))}
              </select>
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
        Zużycie: {kwhPV.toFixed(2)} / {kwh.toFixed(2)} kWh
        <br />
        Koszt: {cost.toFixed(2)} PLN
      </div>

      <ResponsiveContainer width="100%" height="75%">
        {isDay ? <LineChart data={filteredData}>
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
              value: isDay ? 'Moc [W]' : 'Koszt [PLN]',
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
            name="Temp. przed parownikiem [°C]"
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
            name="Temp. za parownikiem [°C]"
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
            name="Temp. wody wyj. [°C]"
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
            name="Temperatura docelowa [°C]"
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
          <Tooltip />
          <Legend content={renderLegend} />
          <Bar
            yAxisId="left"
            dataKey="Watts"
            name="Energia pobrana [kWh]"
            fill="#008CBA"
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
  );
};


