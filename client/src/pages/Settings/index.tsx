import './style.css';
import { HpRequests } from '../../devices/heat-pump/api';
import { HpEntry, OperationEntry } from '../../devices/heat-pump/types';
import { useEffect, useMemo, useState } from 'react';
import Notification from '../../components/Notification';
import { DeviceEditModal } from '../../components/DeviceEditModal';
import { useDevice } from '../../context/DeviceContext';
import { errorLine, ERROR_LOCK_LIMIT, isLocked } from '../../utils/errors';

const RUNNING_LOCK_HINT = "Sprężarka pracuje: pompy działają automatycznie, a wymuszenie pompa przyjmuje tylko w spoczynku";

export const Settings: React.FC = () => {
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

	
	// co włącza przekaźniki CO/CWU tylko w trybach CO; w CWU i OFF co_pomp nic nie zmienia
	const selectedWorkMode = valueOpration.work_mode || defaultOperation.work_mode;
	const coPompEditable = selectedWorkMode === 'M' || selectedWorkMode === 'A';
	// w OFF co zawsze wysyła do pompy force 0; w czasie pracy CHPC ignoruje force
	const forceEditable = selectedWorkMode !== 'OFF' && !running;

	const enableSave = useMemo(() => {
		return Object.entries(valueOpration).length > 0;
	}, [valueOpration]);

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

	const handleSave = () => {
		console.log(valueOpration);
		if ( Object.entries(valueOpration).length == 0 ) {
			return;
		}

		HpRequests.setOperation(valueOpration).then(response => {
			setError( response?.status === 201 ? false : true );
			if (response?.status === 201) {
				showSaveNotice();
				// telemetria pokaże zmianę dopiero po 10-30 s; bez tego pola wracają do starych wartości
				// zmiana trybu bez co_pomp: serwer przywraca "1", a co włącza pompy tylko w trybach CO
				const saved = {...defaultOperation, ...valueOpration};
				if (valueOpration.work_mode) {
					const coMode = valueOpration.work_mode === 'M' || valueOpration.work_mode === 'A';
					saved.co_pomp = coMode ? (valueOpration.co_pomp ?? "1") : "0";
					if (valueOpration.work_mode === 'OFF') saved.force = "0";
				}
				setDefaultOperation(saved);
			}
			setValueOperation({});
			HpRequests.getOperation()
				.then((resp) => {
					console.log(resp)
				})
				.catch((err) => {
					console.log(err);
				}
			);
		});
	}

	return (
		<div className="settings">
			<Notification message={saveNotice} />
			<h2>Aktualne ustawienia</h2>
			<section>
				<div className="resource">
					<h3 className="settings-section-title">Ustaw</h3>
					<div style={{ minWidth: '200px' }}>
						<span className="label">Tryb pracy:</span>
						<select
							name="work_mode"
							className="dict-select"
							onChange={(e) => setValueOperation( {...valueOpration, work_mode: e.currentTarget.value})}
							value={ !!valueOpration.work_mode ? valueOpration.work_mode : defaultOperation.work_mode }
						>
							<option value="M">CO</option>
							<option value="A">CO Harmonogram</option>
							<option value="CWU">CWU Harmonogram</option>
							<option value="OFF">OFF</option>
						</select>
					</div>

					<h3 className="settings-section-title">Aktualne ustawienia temperatur</h3>

					<div style={{ minWidth: '200px' }}>
						<span className="label" style={{ width: '160px' }}>Temperatura CWU:</span>
						<input
							className="temperature"
							type="number"
							name="cwu_min"
							placeholder={defaultOperation.cwu_min}
							value={valueOpration.cwu_min}
							onChange={(e) => setValueOperation({...valueOpration, cwu_min: e.currentTarget.value})}
						/>
						<input
							className="temperature"
							type="number"
							name="cwu_max"
							placeholder={defaultOperation.cwu_max}
							value={valueOpration.cwu_max}
							onChange={(e) => setValueOperation({...valueOpration, cwu_max: e.currentTarget.value})}
						/>
					</div>

					<div style={{ minWidth: '200px' }}>
						<span className="label" style={{ width: '160px' }}>Temperatura CO:</span>
						<input
							className="temperature"
							type="number"
							name="co_min"
							placeholder={defaultOperation.co_min}
							value={valueOpration.co_min}
							onChange={(e) => setValueOperation({...valueOpration, co_min: e.currentTarget.value})}
						/>
						<input
							className="temperature"
							type="number"
							name="co_max"
							placeholder={defaultOperation.co_max}
							value={valueOpration.co_max}
							onChange={(e) => setValueOperation({...valueOpration, co_max: e.currentTarget.value})}
						/>
					</div>

					<h3 className="settings-section-title">Aktualne ustawienia HP</h3>

					<div style={{ minWidth: '200px' }}>
						<span className="label" style={{ width: '160px' }}>EEV temp.:</span>
						<input
							className="temperature"
							type="number"
							name="eev_setpoint"
							step="any"
							placeholder={defaultOperation.eev_setpoint}
							value={ valueOpration.eev_setpoint }
							onChange={(e) => setValueOperation({...valueOpration, eev_setpoint: !e.currentTarget.value ? "0" : e.currentTarget.value.replace(',', '.')
							})}
						/>
					</div>

					<div style={{ minWidth: '200px' }}>
						<span className="label" style={{ width: '160px' }}>EEV max pulse:</span>
						<input
							className="temperature"
							type="number"
							name="eev_max_pulse_open"
							placeholder= {defaultOperation.eev_max_pulse_open}
							value={ valueOpration.eev_max_pulse_open }
							onChange={(e) => setValueOperation({...valueOpration, eev_max_pulse_open: e.currentTarget.value})}
						/>
					</div>

					<div style={{ minWidth: '200px' }}>
						<span className="label" style={{ width: '160px' }}>EEV min pulse:</span>
						<input
							className="temperature"
							type="number"
							name="eev_min_pulse_open"
							min={25}
							placeholder= {defaultOperation.eev_min_pulse_open}
							value={ valueOpration.eev_min_pulse_open }
							onChange={(e) => setValueOperation({...valueOpration, eev_min_pulse_open: e.currentTarget.value})}
						/>
					</div>

					<div style={{ minWidth: '200px' }}>
						<span className="label" style={{ width: '160px' }} title="Maksymalna moc sprężarki; 1001-4000 W, powyżej 3200 W włącza ochronę przepływu">Limit mocy [W]:</span>
						<input
							className="temperature"
							type="number"
							name="working_watt"
							placeholder= {defaultOperation.working_watt}
							value={ valueOpration.working_watt }
							onChange={(e) => setValueOperation({...valueOpration, working_watt: e.currentTarget.value})}
						/>
					</div>

					<h3 className="settings-section-title">Uruchom</h3>
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
						<span className="label">Pompy CO/CWU:</span>
						<input
							title={coPompEditable
								? "Pompy CO/CWU (sterownik przełącza obie razem)"
								: "Tylko w trybach CO; w CWU i OFF sterownik trzyma pompy wyłączone"}
							type="checkbox"
							name="coPomp"
							disabled={!coPompEditable}
							checked={(valueOpration.co_pomp ?? defaultOperation.co_pomp) === "1"}
							onChange={(e) => setValueOperation({...valueOpration, co_pomp: e.target.checked ? "1" : "0" })}
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
{/* 
					<div style={{ minWidth: '240px' }}>
						<span className="label">Grzałka krateru:</span>
						<input
							title="Grzałka krateru"
							name="sumpHeater"
							type="checkbox"
							placeholder= {defaultOperation.sump_heater}
							checked={ valueOpration.sump_heater ==="1" }
							onChange={(e) => setValueOperation({...valueOpration, sump_heater: e.target.checked ? "1" : "0" })}
						/>
					</div> */}
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
					<h3 className="settings-section-title">Sterownik</h3>
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
					<div className="settings-error-actions">
						<button type="button" className="settings-change" disabled={!device} onClick={() => setEditingDevice(true)}>Zmień</button>
					</div>
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
