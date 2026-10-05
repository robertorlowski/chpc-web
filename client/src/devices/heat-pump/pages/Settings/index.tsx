// Zakładka Ustawienia pompy (/settings): operacja ręczna (POST /operation/set), błędy sterownika
// z akcjami Odblokuj i Restart (POST /operation/action) oraz dane sterownika (popup DeviceEditModal).
// Wartości początkowe (placeholdery i checkboxy) to rzeczywisty stan pompy z telemetrii (GET /operation),
// a nie ostatnio wysłane ustawienie. Stan jest wczytywany tylko przy wejściu na stronę.
import './style.css';
import { HpRequests } from '../../api';
import { HpEntry, OperationEntry, pumpWorkMode } from '../../types';
import { WorkModeSwitch } from '../../components/WorkModeSwitch';
import { useEffect, useMemo, useState } from 'react';
import Notification from '../../../../core/components/Notification';
import { DeviceEditModal } from '../../../../core/components/DeviceEditModal';
import { DeviceAddress } from '../../../../core/components/DeviceAddress';
import { FirmwareStatus } from '../../../../core/components/FirmwareStatus';
import { ControllerCardTitle } from '../../../../core/components/ControllerCardTitle';
import { useDevice } from '../../../../core/context/DeviceContext';
import { errorLine, ERROR_LOCK_LIMIT, isLocked } from '../../utils/errors';

// przegrzanie EEV [°C]: z panelu pompy najmniej 0,1, po restarcie CHPC wartość powyżej 8 wraca do domyślnej
const EEV_SETPOINT_MIN = 0.1;
const EEV_SETPOINT_MAX = 8;

const RUNNING_LOCK_HINT ="Sprężarka pracuje: pompy działają automatycznie, a wymuszenie pompa przyjmuje tylko w spoczynku";

export const Settings: React.FC = () => {
	// defaultOperation: stan z serwera; valueOpration: tylko pola zmienione przez użytkownika,
	// bo operacja ręczna nadpisuje harmonogram wyłącznie w przekazanych polach
	const [defaultOperation, setDefaultOperation] = useState<OperationEntry>({});
	const [valueOpration, setValueOperation] = useState<OperationEntry>({});
	const [saveNotice, setSaveNotice] = useState('');
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
		HpRequests.runOperationAction(action).then(response => {
			const ok = response?.status === 201;
			setError(!ok);
			if (ok) {
				setSaveNotice(notice);
				window.setTimeout(() => setSaveNotice(''), 4000);
			}
		});
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

	// temperatura od–do jak na serwerze (pump-mode.service.ts): 1–50 °C, od ≤ do (z wartością pompy dla pola niezmienionego)
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
				console.log(resp);
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

	const showSaveNotice = () => {
		setSaveNotice('Polecenie wysłane do sterownika.');
		window.setTimeout(() => setSaveNotice(''), 3000);
	};

	// Wysyła tylko zmienione pola (POST /operation/set): tryb pracy zapisuje serwer w ustawieniach
	// urządzenia (jak Harmonogram, ręczne ustawienia znikają), temperatury i reszta idą od razu na pompę
	// jako ustawienie ręczne. Temperatura 1–50 °C i przegrzanie EEV 0,1–8 °C są sprawdzane tutaj; limity
	// mocy i EEV stosują dopiero co i CHPC, a faktycznie użyte wartości widać w telemetrii.
	const handleSave = () => {
		if (Object.entries(valueOpration).length == 0) {
			return;
		}

		HpRequests.setOperation(valueOpration).then(response => {
			setError( response?.status === 201 ? false : true );
			if (response?.status === 201) {
				showSaveNotice();
				// telemetria pokaże zmianę dopiero po kilku sekundach; bez tego pola wracają do starych wartości
				const saved = {...defaultOperation, ...valueOpration};
				if (valueOpration.work_mode === 'OFF') saved.force = "0";
				setDefaultOperation(saved);
			}
			setValueOperation({});
		});
	}

	return (
		<div className="settings">
			<Notification message={saveNotice} />
			<h2>Aktualne ustawienia</h2>
			<section>
				<div className="resource">
					<h3 className="settings-section-title">Ustaw</h3>
					<div className="settings-mode-row">
						<span className="label">Tryb pracy:</span>
						<WorkModeSwitch
							short
							value={selectedWorkMode}
							onChange={(mode) => {
								// tryb zapisany = tryb urządzenia; ten sam wybór co w danych nie jest wysyłany
								const { work_mode: _previous, ...rest } = valueOpration;
								setValueOperation(mode === pumpWorkMode(defaultOperation.work_mode) ? rest : { ...rest, work_mode: mode });
							}}
						/>
					</div>

					<div style={{ minWidth: '200px' }}>
						<span className="label" style={{ width: '160px' }}>Temperatura od / do:</span>
						<input
							className="temperature"
							type="number"
							name="temp_min"
							aria-label="Temperatura od"
							aria-invalid={!!temperatureProblem}
							placeholder={defaultOperation.temp_min}
							value={valueOpration.temp_min ?? ''}
							onChange={(e) => setOptional('temp_min', e.currentTarget.value)}
						/>
						<input
							className="temperature"
							type="number"
							name="temp_max"
							aria-label="Temperatura do"
							aria-invalid={!!temperatureProblem}
							placeholder={defaultOperation.temp_max}
							value={valueOpration.temp_max ?? ''}
							onChange={(e) => setOptional('temp_max', e.currentTarget.value)}
						/>
						<span> °C</span>
					</div>
					{temperatureProblem && <p className="settings-error-text settings-field-error">{temperatureProblem}</p>}

					<div style={{ minWidth: '240px' }}>
						<span className="label">Wymuszenie pracy:</span>
						<input
							title={running
								? RUNNING_LOCK_HINT
								: forceEditable
									? "Wymuszenie pracy (pompa kasuje je po zatrzymaniu sprężarki)"
									: "W trybie OFF sterownik nie wymusza pracy"}
							type="checkbox"
							disabled={!forceEditable}
							checked={(valueOpration.force ?? defaultOperation.force) === "1"}
							onChange={(e) => setValueOperation({...valueOpration, force: e.target.checked ? "1" : "0" })}
						/>
					</div>

					<div style={{ minWidth: '240px' }}>
						<span className="label">Pompa ciepłej wody:</span>
						<input
							type="checkbox"
							name="hotPomp"
							title={running ? RUNNING_LOCK_HINT : "Pompa ciepłej wody"}
							disabled={running}
							checked={(valueOpration.hot_pomp ?? defaultOperation.hot_pomp) === "1"}
							onChange={(e) => setValueOperation({...valueOpration, hot_pomp: e.target.checked ? "1" : "0" })}
						/>
					</div>

					<div style={{ minWidth: '240px' }}>
						<span className="label">Pompa zimnej wody:</span>
						<input
							type="checkbox"
							name="coldPomp"
							title={running ? RUNNING_LOCK_HINT : "Pompa zimnej wody"}
							disabled={running}
							checked={(valueOpration.cold_pomp ?? defaultOperation.cold_pomp) === "1"}
							onChange={(e) => setValueOperation({...valueOpration, cold_pomp: e.target.checked ? "1" : "0" })}
						/>
					</div>

					<div style={{ minWidth: '200px' }}>
						<span className="label" style={{ width: '160px' }} title="Maksymalna moc sprężarki; 1001-4000 W, powyżej 3200 W włącza ochronę przepływu">Limit mocy [W]:</span>
						<input
							className="temperature settings-watt"
							type="number"
							name="working_watt"
							placeholder= {defaultOperation.working_watt}
							value={ valueOpration.working_watt ?? '' }
							onChange={(e) => setOptional('working_watt', e.currentTarget.value)}
						/>
					</div>

					<div style={{ minWidth: '200px' }}>
						<span className="label" style={{ width: '160px' }}>EEV min / max:</span>
						<input
							className="temperature"
							type="number"
							name="eev_min_pulse_open"
							aria-label="EEV min"
							min={25}
							placeholder= {defaultOperation.eev_min_pulse_open}
							value={ valueOpration.eev_min_pulse_open ?? '' }
							onChange={(e) => setOptional('eev_min_pulse_open', e.currentTarget.value)}
						/>
						<input
							className="temperature"
							type="number"
							name="eev_max_pulse_open"
							aria-label="EEV max"
							placeholder= {defaultOperation.eev_max_pulse_open}
							value={ valueOpration.eev_max_pulse_open ?? '' }
							onChange={(e) => setOptional('eev_max_pulse_open', e.currentTarget.value)}
						/>
					</div>

					<div style={{ minWidth: '200px' }}>
						<span className="label" style={{ width: '160px' }}>Przegrzanie EEV:</span>
						<input
							className="temperature"
							type="number"
							name="eev_setpoint"
							step="0.1"
							min={EEV_SETPOINT_MIN}
							max={EEV_SETPOINT_MAX}
							title={`Przegrzanie EEV ${EEV_SETPOINT_MIN}–${EEV_SETPOINT_MAX} °C`}
							aria-invalid={!eevSetpointValid}
							placeholder={defaultOperation.eev_setpoint}
							value={ valueOpration.eev_setpoint ?? '' }
							onChange={(e) => setOptional('eev_setpoint', e.currentTarget.value.replace(',', '.'))}
						/>
						{!eevSetpointValid && <span className="settings-error-text"> {EEV_SETPOINT_MIN}–{EEV_SETPOINT_MAX} °C</span>}
					</div>
					<div className='header3'>
					<p>
						<span className={error ? `error show` : `error hide`}>
							Wystąpił błąd podczas wykonywania operacji..
						</span>
					</p>
							
					<button
						className="settings-change"
						data-action="send-operation"
						disabled ={!enableSave}
						onClick={handleSave}>
						Zmień
					</button>
				</div>
				</div>

				<div className="resource settings-errors">
					<h3 className="settings-section-title">Błędy sterownika</h3>
					<div>
						<span className={lastError?.error_code ? 'settings-error-text settings-error-lines' : ''}>
							{lastError?.error_code ? errorLine(lastError) : 'Brak błędów'}
						</span>
					</div>
					<div>
						<span className="settings-inline-label">Licznik błędów:</span>
						<span className={isLocked(errorCount) ? 'settings-error-text' : ''}>
							{errorCount === undefined ? '---' : `${errorCount}/${ERROR_LOCK_LIMIT}`}
							{isLocked(errorCount) ? ' (sterowanie zablokowane)' : ''}
						</span>
					</div>
					<div className="settings-error-actions">
						<button
							disabled={!isLocked(errorCount)}
							title={isLocked(errorCount)
								? 'Zeruje licznik błędów i zdejmuje blokadę; pompa działa dalej'
								: 'Sterownik nie jest zablokowany'}
							onClick={() => runAction('error_reset', 'Polecenie odblokowania wysłane do sterownika.')}>
							Odblokuj
						</button>
						<button
							title="Uruchamia sterownik od nowa (przerwa startowa ok. 90 s)"
							onClick={handleRestart}>
							Restart sterownika
						</button>
					</div>
				</div>

				<div className="resource settings-errors settings-device">
					<ControllerCardTitle disabled={!device} onEdit={() => setEditingDevice(true)} />
					<div>
						<span className="label">Nazwa:</span>
						<span>{device?.name?.trim() || '---'}</span>
					</div>
					<div>
						<span className="label">Identyfikator:</span>
						<code className="settings-root-id">{device?.deviceId ?? '---'}</code>
					</div>
					<div>
						<span className="label">Root ID:</span>
						<code className="settings-root-id">{device?.rootId ?? '---'}</code>
					</div>
					<DeviceAddress device={device} />
					<FirmwareStatus device={device} actionsClassName="settings-error-actions" />
				</div>

			</section>

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
