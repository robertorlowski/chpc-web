// Zakładka Ustawienia pompy (/settings) w układzie makiety „Instrument” (#s-hp-ustawienia): po lewej karta „Ustaw”
// (operacja ręczna, POST /operation/set: tryb pracy, temperatura od–do, limit mocy, EEV, przełączniki wymuszenia
// i pomp obiegu), po prawej karty „Błędy sterownika” (ostatni błąd, licznik, Odblokuj i Restart przez
// POST /operation/action), „Sterownik” (core ControllerCard: nazwa, SN, Root ID, adres IP, firmware, klucz poczty; popup DeviceEditModal) i „Udostępnianie”.
// Wartości początkowe (placeholdery i przełączniki) to rzeczywisty stan pompy z telemetrii (GET /operation),
// a nie ostatnio wysłane ustawienie. Stan jest wczytywany tylko przy wejściu na stronę.
import '../style.css';
import './style.css';
import { HpRequests } from '../../api';
import { HpEntry, OperationEntry, pumpWorkMode } from '../../types';
import { useEffect, useMemo, useState } from 'react';
import Notification, { useSaveNotice } from '../../../../core/components/Notification';
import { DeviceEditModal } from '../../../../core/components/DeviceEditModal';
import { ControllerCard } from '../../../../core/components/ControllerCard';
import { DeviceSharing } from '../../../../core/components/DeviceSharing';
import { useDevice } from '../../../../core/context/DeviceContext';
import { errorDescription, ERROR_LOCK_LIMIT, isLocked } from '../../utils/errors';
import { Segmented, WORK_MODE_OPTIONS } from '../../components/Segmented';
import { Switch } from '../../components/Switch';
import { BellIcon, CheckIcon } from '../../components/icons';

// przegrzanie EEV [°C]: z panelu pompy najmniej 0,1, po restarcie CHPC wartość powyżej 8 wraca do domyślnej
const EEV_SETPOINT_MIN = 0.1;
const EEV_SETPOINT_MAX = 8;

const RUNNING_LOCK_HINT ="Sprężarka pracuje: pompy działają automatycznie, a wymuszenie pompa przyjmuje tylko w spoczynku";

export const Settings: React.FC = () => {
	// defaultOperation: stan z serwera; valueOpration: tylko pola zmienione przez użytkownika,
	// bo operacja ręczna nadpisuje harmonogram wyłącznie w przekazanych polach
	const [defaultOperation, setDefaultOperation] = useState<OperationEntry>({});
	const [valueOpration, setValueOperation] = useState<OperationEntry>({});
	// komunikat po wysłaniu; przyciski wysyłania nieaktywne w trakcie i dopóki widać komunikat
	const { notice: saveNotice, showNotice, run, busy } = useSaveNotice();
	const [error, setError] = useState<boolean>(false);
	const { device, selectDevice } = useDevice();
	const [editingDevice, setEditingDevice] = useState(false);
	const [lastError, setLastError] = useState<HpEntry | null>(null);
	const [errorCount, setErrorCount] = useState<number | undefined>(undefined);
	// sprężarka pracuje: pompa sama steruje pompami, a wymuszenie przyjmuje tylko w spoczynku
	const [running, setRunning] = useState(false);

	useEffect(() => {
		HpRequests.getHpLastError()
			.then((resp) => setLastError(resp))
			.catch((err) => console.log(err));
		HpRequests.getCoData()
			.then((resp) => {
				setErrorCount(resp?.HP?.ERRc);
				// HPS przychodzi z CHPC jako 0/1
				setRunning(Number(resp?.HP?.HPS) > 0);
			})
			.catch((err) => console.log(err));
	}, []);

	// akcja jednorazowa: serwer budzi co przez WebSocket, więc dociera do pompy w kilka sekund
	const runAction = (action: 'error_reset' | 'restart', notice: string) => {
		run(() => HpRequests.runOperationAction(action).then(response => {
			const ok = response?.status === 201;
			setError(!ok);
			if (ok) showNotice(notice, 4000);
		}));
	};

	const handleRestart = () => {
		if (!window.confirm('Zrestartować sterownik pompy? Sprężarka i pompy zostaną zatrzymane, a start nastąpi po ok. 90 s.')) {
			return;
		}
		runAction('restart', 'Polecenie restartu wysłane do sterownika.');
	};

	// tryb pracy urządzenia (ręczny / automatyczny / OFF): zmiana tutaj = zmiana w Harmonogramie
	const selectedWorkMode = pumpWorkMode(valueOpration.work_mode || defaultOperation.work_mode);
	// w OFF co zawsze wysyła do pompy force 0; w czasie pracy CHPC ignoruje force
	// running pochodzi z telemetrii przy wejściu na stronę i nie odświeża się; po starcie lub
	// zatrzymaniu sprężarki blokady zmieniają się dopiero po ponownym otwarciu zakładki
	const forceEditable = selectedWorkMode !== 'OFF' && !running;

	// przegrzanie EEV: zakres jak w co (operation_parser.cpp); CHPC zapisuje je w EEPROM bez sprawdzania
	const eevSetpoint = valueOpration.eev_setpoint;
	const eevSetpointValid = eevSetpoint === undefined
		|| (Number(eevSetpoint) >= EEV_SETPOINT_MIN && Number(eevSetpoint) <= EEV_SETPOINT_MAX);

	// temperatura od–do jak na serwerze (pump-mode.service.ts): 1–50 °C, od ≤ do (z wartością pompy dla pola niezmienionego).
	// UWAGA: podniesienie maksymalnej temperatury pompy powyżej 50 °C wymaga podniesienia progu wstrzymania pompy przy gorącym kotle
	// (BOILER_BLOCK_FROM 52 °C = maks. 50 + 2, server/src/modules/heat-pump/services/cwu-loading.service.ts), inaczej pompa
	// zatrzyma się na wodzie, którą sama nagrzała.
	const temperatureProblem = useMemo(() => {
		const changed = [valueOpration.temp_min, valueOpration.temp_max].filter((value) => value !== undefined);
		if (changed.some((value) => !Number.isFinite(Number(value)) || Number(value) < 1 || Number(value) > 50)) {
			return 'Temperatura: 1–50 °C.';
		}
		const min = Number(valueOpration.temp_min ?? defaultOperation.temp_min);
		const max = Number(valueOpration.temp_max ?? defaultOperation.temp_max);
		return changed.length > 0 && Number.isFinite(min) && Number.isFinite(max) && min > max
			? 'Temperatura od nie może być wyższa niż do.'
			: '';
	}, [valueOpration, defaultOperation]);

	// pole wyczyszczone znika ze zmian (nie idzie jako "" ani "0")
	const setOptional = (field: keyof OperationEntry, value: string) => {
		const { [field]: _cleared, ...rest } = valueOpration;
		setValueOperation(value.trim() ? { ...rest, [field]: value.trim() } : rest);
	};

	const enableSave = useMemo(() => {
		return Object.entries(valueOpration).length > 0 && eevSetpointValid && !temperatureProblem;
	}, [valueOpration, eevSetpointValid, temperatureProblem]);

	useEffect( () => {
		HpRequests.prepareOperation()
			.then((resp) => {
				// przy błędzie HTTP Requests.get zwraca null; bez tego render wywraca się na defaultOperation.work_mode
				setDefaultOperation(resp ?? {});
				if (!resp) setError(true);
			})
			.catch((err) => {
				console.log(err);
				setError(true);
			}
		);
	}, []);

	const showSaveNotice = () => showNotice('Polecenie wysłane do sterownika.', 4000);

	// Wysyła tylko zmienione pola (POST /operation/set): tryb pracy zapisuje serwer w ustawieniach
	// urządzenia (jak Harmonogram, ręczne ustawienia znikają), temperatury i reszta idą od razu na pompę
	// jako ustawienie ręczne. Temperatura 1–50 °C i przegrzanie EEV 0,1–8 °C są sprawdzane tutaj; limity
	// mocy i EEV stosują dopiero co i CHPC, a faktycznie użyte wartości widać w telemetrii.
	const handleSave = () => {
		if (Object.entries(valueOpration).length == 0) {
			return;
		}

		run(() => HpRequests.setOperation(valueOpration).then(response => {
			setError( response?.status === 201 ? false : true );
			if (response?.status === 201) {
				showSaveNotice();
				// telemetria pokaże zmianę dopiero po kilku sekundach; bez tego pola wracają do starych wartości
				const saved = {...defaultOperation, ...valueOpration};
				if (valueOpration.work_mode === 'OFF') saved.force = "0";
				setDefaultOperation(saved);
			}
			setValueOperation({});
		}));
	}

	const locked = isLocked(errorCount);
	const errorText = lastError?.error_code ? errorDescription(lastError.error_code) : '';
	const toggle = (field: 'force' | 'hot_pomp' | 'cold_pomp') => (on: boolean) =>
		setValueOperation({ ...valueOpration, [field]: on ? "1" : "0" });

	return (
		<div className="page page-device hp-view hp-settings">
			<Notification message={saveNotice} />
			<div className="grid-2 grid-settings">
				<section className="card">
					<header className="card-head"><h2>Ustaw</h2><span className="card-hint">polecenie do sterownika</span></header>
					<Segmented name="u-tryb" label="Tryb pracy" value={selectedWorkMode} options={WORK_MODE_OPTIONS}
						onChange={(mode) => {
							// tryb zapisany = tryb urządzenia; ten sam wybór co w danych nie jest wysyłany
							const { work_mode: _previous, ...rest } = valueOpration;
							setValueOperation(mode === pumpWorkMode(defaultOperation.work_mode) ? rest : { ...rest, work_mode: mode });
						}} />
					<div className="form-grid">
						<label htmlFor="u-tmin">Temperatura od / do</label>
						<div className="range-inputs">
							<input type="number" id="u-tmin" name="temp_min" aria-label="Temperatura od" aria-invalid={!!temperatureProblem}
								placeholder={defaultOperation.temp_min} value={valueOpration.temp_min ?? ''}
								onChange={(e) => setOptional('temp_min', e.currentTarget.value)} />
							<span className="dash">–</span>
							<input type="number" name="temp_max" aria-label="Temperatura do" aria-invalid={!!temperatureProblem}
								placeholder={defaultOperation.temp_max} value={valueOpration.temp_max ?? ''}
								onChange={(e) => setOptional('temp_max', e.currentTarget.value)} />
							<span className="unit-txt">°C</span>
						</div>
						<label htmlFor="u-watt" title="Maksymalna moc sprężarki; 1001–4000 W, powyżej 3200 W włącza ochronę przepływu">Limit mocy</label>
						<div className="range-inputs">
							<input type="number" id="u-watt" name="working_watt" className="w-wide"
								placeholder={defaultOperation.working_watt} value={valueOpration.working_watt ?? ''}
								onChange={(e) => setOptional('working_watt', e.currentTarget.value)} />
							<span className="unit-txt">W</span>
						</div>
						<label htmlFor="u-eevmin">EEV min / max</label>
						<div className="range-inputs">
							<input type="number" id="u-eevmin" name="eev_min_pulse_open" aria-label="EEV min" min={25}
								placeholder={defaultOperation.eev_min_pulse_open} value={valueOpration.eev_min_pulse_open ?? ''}
								onChange={(e) => setOptional('eev_min_pulse_open', e.currentTarget.value)} />
							<span className="dash">–</span>
							<input type="number" name="eev_max_pulse_open" aria-label="EEV max"
								placeholder={defaultOperation.eev_max_pulse_open} value={valueOpration.eev_max_pulse_open ?? ''}
								onChange={(e) => setOptional('eev_max_pulse_open', e.currentTarget.value)} />
						</div>
						<label htmlFor="u-eevsp" title={`Przegrzanie EEV ${EEV_SETPOINT_MIN}–${EEV_SETPOINT_MAX} °C`}>Przegrzanie EEV</label>
						<div className="range-inputs">
							<input type="number" id="u-eevsp" name="eev_setpoint" step="0.1" min={EEV_SETPOINT_MIN} max={EEV_SETPOINT_MAX}
								aria-invalid={!eevSetpointValid} placeholder={defaultOperation.eev_setpoint} value={valueOpration.eev_setpoint ?? ''}
								onChange={(e) => setOptional('eev_setpoint', e.currentTarget.value.replace(',', '.'))} />
							<span className="unit-txt">°C</span>
						</div>
					</div>
					{temperatureProblem && <p className="field-error">{temperatureProblem}</p>}
					{!eevSetpointValid && <p className="field-error">Przegrzanie EEV: {EEV_SETPOINT_MIN}–{EEV_SETPOINT_MAX} °C.</p>}
					<ul className="toggle-list">
						<li>
							<span className="t-name">Wymuszenie pracy <small>tylko w spoczynku sprężarki</small></span>
							<Switch label="Wymuszenie pracy" disabled={!forceEditable}
								title={running ? RUNNING_LOCK_HINT : forceEditable ? 'Wymuszenie pracy (pompa kasuje je po zatrzymaniu sprężarki)' : 'W trybie OFF sterownik nie wymusza pracy'}
								on={(valueOpration.force ?? defaultOperation.force) === "1"} onChange={toggle('force')} />
						</li>
						<li>
							<span className="t-name">Pompa ciepłej wody</span>
							<Switch label="Pompa ciepłej wody" disabled={running} title={running ? RUNNING_LOCK_HINT : 'Pompa ciepłej wody'}
								on={(valueOpration.hot_pomp ?? defaultOperation.hot_pomp) === "1"} onChange={toggle('hot_pomp')} />
						</li>
						<li>
							<span className="t-name">Pompa zimnej wody</span>
							<Switch label="Pompa zimnej wody" disabled={running} title={running ? RUNNING_LOCK_HINT : 'Pompa zimnej wody'}
								on={(valueOpration.cold_pomp ?? defaultOperation.cold_pomp) === "1"} onChange={toggle('cold_pomp')} />
						</li>
					</ul>
					<p className="help">Wyszarzone przełączniki pokazują stan z pompy; przy pracującej sprężarce pompa steruje nimi sama. Puste pole = wartość bez zmian (w polu stan z pompy).</p>
					{error && <p className="field-error">Wystąpił błąd podczas wykonywania operacji.</p>}
					<div className="actions">
						<button type="button" className="btn btn-primary" data-action="send-operation" disabled={!enableSave || busy} onClick={handleSave}>Zmień</button>
					</div>
					{saveNotice && <div className="toast toast-ok" role="status"><CheckIcon />{saveNotice} Sterownik zastosuje je przy następnym odczycie (10–30 s).</div>}
				</section>

				<div className="stack">
					<section className="card">
						<header className="card-head">
							<h2>Błędy sterownika</h2>
							<span className="card-hint">licznik {errorCount === undefined ? '---' : `${errorCount}/${ERROR_LOCK_LIMIT}`} · blokada przy {ERROR_LOCK_LIMIT}</span>
						</header>
						{errorText || locked ? (
							<div className="alert alert-err">
								<BellIcon />
								<div>
									<strong>{locked ? 'Sterowanie zablokowane' : `Błąd ${lastError?.error_code} · ${errorText}`}</strong>
									<span>{locked ? `${errorCount}/${ERROR_LOCK_LIMIT} błędów; odblokuj, żeby pompa wróciła do pracy` : lastError?.time}</span>
								</div>
							</div>
						) : (
							<p className="help"><span className="ok-text">Brak błędów</span> w ostatnich 24 godzinach.</p>
						)}
						<div className="actions actions-split">
							<button type="button" className="btn" disabled={!locked || busy}
								title={locked ? 'Zeruje licznik błędów i zdejmuje blokadę; pompa działa dalej' : 'Sterownik nie jest zablokowany'}
								onClick={() => runAction('error_reset', 'Polecenie odblokowania wysłane do sterownika.')}>
								Odblokuj
							</button>
							<button type="button" className="btn btn-danger-ghost" title="Uruchamia sterownik od nowa (przerwa startowa ok. 90 s)"
								disabled={busy} onClick={handleRestart}>
								Restart sterownika
							</button>
						</div>
					</section>

					<ControllerCard device={device} onEdit={() => setEditingDevice(true)} />

					{/* udostępnianie sterownika (tylko właściciel; konta użytkowników) */}
					{device && <DeviceSharing device={device} />}
				</div>
			</div>

			{editingDevice && device && (
				<DeviceEditModal
					device={device}
					onClose={() => setEditingDevice(false)}
					onSaved={(updated) => {
						// nowa nazwa trafia też do zapamiętanego wyboru (stopka, localStorage)
						selectDevice(updated);
						setEditingDevice(false);
					}}
				/>
			)}
		</div>
	);
}
