// Zakładka Dane pompy (/data) w układzie makiety „Instrument” (#s-hp-dane): pasek filtrów (nawigacja po dniach
// z danymi, „Wszystkie odczyty”, CSV) i karta „Odczyty dnia” z tabelą telemetrii jednego dnia (GET /hp/4day przez
// fetchData). Domyślnie tylko praca sprężarki i rekordy z błędem; wiersz z error_code jest podświetlony i ma chip
// z kodem błędu (opis w podpowiedzi). Eksport CSV obejmuje cały bieżący rok (GET /hp/all). Bez automatycznego
// odświeżania. Przewijanie w poziomie tylko w .table-wrap.
import '../style.css';
import './style.css';
import { HpRequests } from '../../api';
import { THPL } from '../../types';
import React, { useEffect, useState } from 'react';
import { compressorSeconds, fetchData, formatDateYMD, formatDuration } from '../../utils/utils';
import { errorDescription } from '../../utils/errors';
import { ClipLoader } from 'react-spinners';
import { cc } from '../../../../core/chartColors';
import { DateNav, formatDayLabel, isToday, useHpDates } from '../../components/DateNav';
import { DownloadIcon } from '../../components/icons';

// co od 1.2.0: MANUAL / AUTO / OFF = MAN / AUTO / OFF (krótko, żeby kolumna nie nachodziła na sąsiednią; 2026-10-12).
// Starsze rekordy: A i M (grzanie CO) = CO, CWU, OFF i PV bez zmian (decyzja 2026-10-04: dawnych kodów nie przerabiać).
const WORK_MODE_LABELS: Record<string, string> = { MANUAL: 'MAN', AUTO: 'AUTO', OFF: 'OFF', A: 'CO', M: 'CO' };
const formatDataWorkMode = (workMode?: string): string => (
  (workMode && WORK_MODE_LABELS[workMode]) || workMode || '---'
);

// kolumny tabeli: nagłówek, pole rekordu, opis skrótu (podpowiedź nagłówka), liczba miejsc po przecinku
type Column = { header: string; key: keyof THPL; hint: string; digits?: number; unit?: string };
const COLUMNS: Column[] = [
  { header: 'Moc', key: 'Watts', hint: 'moc pobierana przez pompę [W]', digits: 0, unit: ' W' },
  { header: 'PV', key: 'pv', hint: 'moc instalacji fotowoltaicznej [W]', digits: 0, unit: ' W' },
  { header: 'T. zbiornik', key: 'Ttarget', hint: 'temperatura czujnika w środku zbiornika [°C]' },
  { header: 'T. wyj.', key: 'Tho', hint: 'temperatura wody wychodzącej [°C]' },
  { header: 'T. przed par.', key: 'Tbe', hint: 'temperatura przed parownikiem [°C]' },
  { header: 'T. za par.', key: 'Tae', hint: 'temperatura za parownikiem [°C]' },
  { header: 'T. spręż.', key: 'Tsump', hint: 'temperatura karteru sprężarki [°C]' },
  { header: 'EEV', key: 'EEV_pos', hint: 'pozycja zaworu rozprężnego (EEV pozycja)', digits: 0 },
  { header: 'ΔT', key: 'EEV_dt', hint: 'EEV dt, różnica temperatur zaworu rozprężnego' },
  { header: 'T. zewn.', key: 't_out' as keyof THPL, hint: 'temperatura zewnętrzna [°C]' },
];

const formatCell = (value: unknown, digits = 1, unit = ''): string => {
  if (value === undefined || value === null || value === '') return '—';
  const number = Number(value);
  if (Number.isNaN(number)) return String(value);
  return number.toLocaleString('pl-PL', { minimumFractionDigits: digits, maximumFractionDigits: digits }) + unit;
};

export const HeatPumpTable: React.FC = () => {
	const [rows, setRows] = useState<THPL[]>([]);
	const [loading, setLoading] = useState<boolean>(false);
	const [error, setError] = useState<string | null>(null);
	const [selectedDate, setSelectedDate] = useState<string>( formatDateYMD( new Date()));
	const [allData, setAllData] = useState<boolean>(false);
	const [downloading, setDownloading] = useState(false);
	// czas pracy sprężarki w dniu (z pełnych rekordów, niezależnie od filtra)
	const [workSeconds, setWorkSeconds] = useState(0);
	// dni z danymi; start od dzisiejszej daty przeglądarki, bez danych dziś hook przełącza na najnowszy dzień
	const dates = useHpDates(selectedDate, setSelectedDate);

	// CSV dla Excela z polskimi ustawieniami: separator ';', przecinek dziesiętny (w napisach zamieniana
	// jest tylko pierwsza kropka), flagi jako 1/0, time bez zmian. Kolumny z kluczy pierwszego
	// (najnowszego) rekordu; eksport nie filtruje po pracy sprężarki.
	const handleDownloadCsv = async () => {
		setDownloading(true);
		try {
		const data = await HpRequests.getHpAllData();
		const jsonData: THPL[] = data.map(row => ({
			...row.HP,
			time: row.time,
			work_mode: formatDataWorkMode(row.work_mode),
			pv: row.PV?.total_power ?? '',
		}));
		if (jsonData.length === 0) return;
		const headers = Object.keys(jsonData[0]);
		const csvContent = [headers.join(';'), ...jsonData.map(row => headers.map(field => {
			const value = row[field as keyof THPL];
			if (field === 'time') return value;
			if (typeof value === 'boolean') return value ? '1' : '0';
			if (typeof value === 'number') return `"${String(value).replace('.', ',')}"`;
			if (typeof value === 'string') return `"${value.replace(/"/g, '""').replace('.', ',')}"`;
			return value;
		}).join(';'))].join('\n');
		const url = URL.createObjectURL(new Blob([csvContent], { type: 'text/csv;charset=utf-8;' }));
		const link = document.createElement('a');
		link.href = url;
		link.download = 'dane.csv';
		link.click();
		URL.revokeObjectURL(url);
		} finally {
			setDownloading(false);
		}
	};

	// selectedDate w formacie YYYY.MM.DD (jak time z co), więc startsWith odcina rekordy spoza dnia;
	// w tabeli zostaje sama godzina (timeOfDay niżej). Czas pracy sprężarki liczony z pełnego dnia.
	useEffect(() => {
			if (!selectedDate) return;
			let active = true; // guard przeciwko setState po unmount

			(async () => {
				if (!active) return;
				setLoading(true);
				try {
					const data = await fetchData(allData, selectedDate);
					if (!active) return;
					const dayRows = data.filter(d => d.time?.startsWith(selectedDate));
					setRows(dayRows);
					setWorkSeconds(compressorSeconds(allData ? dayRows : await fetchData(true, selectedDate)));
				} catch (err) {
					if (active) setError((err as Error).message);
				} finally {
					if (active) setLoading(false);
				}
			})();

			return () => {
				active = false;
			};
		},
		[allData, selectedDate]
	);

	if (error) return <div className="page page-device hp-view"><p className="help">Błąd: {error}</p></div>;

	const timeOfDay = (time?: string) => time?.split(' ')[1] ?? '';

  return (
    <div className="page page-device hp-view hp-data">
      <div className="filters">
        <DateNav unit="dzień" value={selectedDate} onChange={setSelectedDate} note={isToday(selectedDate) ? 'dziś' : undefined}
          items={dates.map((date) => ({ value: date, label: formatDayLabel(date) }))} />
        <label className="check">
          <input type="checkbox" name="allData" checked={allData} onChange={(e) => setAllData(e.target.checked)} />
          <span>Wszystkie odczyty</span>
          <small>domyślnie praca sprężarki i błędy</small>
        </label>
        <button type="button" className="btn btn-ghost btn-sm" disabled={downloading} onClick={handleDownloadCsv}
          title="Pobierz wszystkie odczyty bieżącego roku (CSV)">
          <DownloadIcon />{downloading ? 'Pobieranie…' : 'CSV'}
        </button>
      </div>

      <section className="card card-table">
        <header className="card-head">
          <h2>Odczyty dnia</h2>
          <span className="card-hint">
            {loading ? 'ładowanie…' : `${rows.length} odczytów · sprężarka pracowała ${formatDuration(workSeconds)}`}
          </span>
        </header>
        {loading && <div className="loading"><ClipLoader size={32} color={cc().axis} /></div>}
        {!loading && rows.length === 0 && <p className="help">Brak odczytów {allData ? 'z tego dnia' : 'z pracy sprężarki w tym dniu'}.</p>}
        {rows.length > 0 && (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Czas</th>
                  <th title="tryb pracy zgłoszony przez sterownik">Praca</th>
                  {COLUMNS.map((column) => <th key={column.key} className="num" title={column.hint}>{column.header}</th>)}
                  <th className="num" title="sprężarka pracuje (HPS)">Spręż.</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={`${row.time}-${index}`} className={row.error_code ? 'is-err' : ''}>
                    <td>
                      {timeOfDay(row.time)}
                      {row.error_code ? <> <span className="chip chip-err" title={errorDescription(row.error_code)}>błąd {row.error_code}</span></> : null}
                    </td>
                    <td>{formatDataWorkMode(row.work_mode)}</td>
                    {COLUMNS.map((column) => (
                      <td key={column.key} className="num">{formatCell(row[column.key], column.digits, column.unit)}</td>
                    ))}
                    <td className="num">{row.HPS === true || Number(row.HPS) > 0 ? <><i className="dot dot-run" />tak</> : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <footer className="table-foot">Wiersz z błędem sterownika jest podświetlony (opis błędu po najechaniu na chip). Przewijanie w poziomie tylko w tabeli.</footer>
      </section>
    </div>
  );
};
