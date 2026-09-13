import './style.css';
import '../../api/api';
import { HpRequests } from '../../api/api';
import { DeviceProperties, OperationEntry } from '../../api/type';
import { useEffect, useMemo, useState } from 'react';
import Notification from '../../components/Notification';

export const Settings: React.FC = () => {
	const [defaultOperation, setDefaultOperation] = useState<OperationEntry>({});
	const [valueOpration, setValueOperation] = useState<OperationEntry>({});
	const [temperatureDefaults, setTemperatureDefaults] = useState<DeviceProperties>({});
	const [propertiesSaving, setPropertiesSaving] = useState(false);
	const [saveNotice, setSaveNotice] = useState('');
	const [error, setError] = useState<boolean>(false);
	
	const enableSave = useMemo(() => {
		return Object.entries(valueOpration).length > 0;
	}, [valueOpration]);

	useEffect( () => {
		HpRequests.prepareOperation()
			.then((resp) => {
				console.log(resp);
				setDefaultOperation(resp);
			})
			.catch((err) => {
				console.log(err);
				setError(true);
			} 
		);
		HpRequests.getDeviceProperties()
			.then((value) => setTemperatureDefaults(value ?? {}))
			.catch(() => setError(true));
	}, []);

	const updateTemperatureDefault = (field: keyof DeviceProperties, value: string) => {
		setTemperatureDefaults((current) => ({ ...current, [field]: value }));
	};

	const showSaveNotice = () => {
		setSaveNotice('Dane zostały zapisane.');
		window.setTimeout(() => setSaveNotice(''), 3000);
	};

	const handleSaveTemperatureDefaults = async () => {
		setPropertiesSaving(true);
		try {
			await HpRequests.updateDeviceProperties(temperatureDefaults);
			showSaveNotice();
		} catch {
			setError(true);
		} finally {
			setPropertiesSaving(false);
		}
	};

	const handleSave = () => {
		console.log(valueOpration);
		if ( Object.entries(valueOpration).length == 0 ) {
			return;
		}

		HpRequests.setOperation(valueOpration).then(response => {
			setError( response?.status === 201 ? false : true );
			if (response?.status === 201) showSaveNotice();
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
							defaultValue={defaultOperation.work_mode}
						>
							<option value="M">CO</option>
							<option value="A">CO harmonogram</option>
							<option value="CWU">CWU harmonogram</option>
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
							onChange={(e) => setValueOperation({...valueOpration, co_max: e.target.value})}
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
						<span className="label" style={{ width: '160px' }}>Params:</span>
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
							title="Wymuszenie pracy:"
							type="checkbox"
							placeholder = { valueOpration.force }
							checked={ valueOpration.force === "1" }
							onChange={(e) => setValueOperation({...valueOpration, force: e.target.checked ? "1" : "0" })}
						/>
					</div>

					<div style={{ minWidth: '240px' }}>
						<span className="label">Pompa zimnej wody:</span>
						<input
							title="Pompa zimnej wody"
							type="checkbox"
							name="coldPomp"
							placeholder = {defaultOperation.cold_pomp }
							checked={ valueOpration.cold_pomp === "1" }
							onChange={(e) => setValueOperation({...valueOpration, cold_pomp: e.target.checked ? "1" : "0" })}
						/>
					</div>

					<div style={{ minWidth: '240px' }}>
						<span className="label">Pompa ciepłej wody:</span>
						<input
							title="Pompa ciepłej wody"
							type="checkbox"
							name="hotPomp"
							placeholder= {defaultOperation.hot_pomp}
							checked={ valueOpration.hot_pomp === "1" }
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
						disabled ={!enableSave}
						onClick={handleSave}>
						Zapisz
					</button>
				</div>	
				</div>

			</section>
			<h3>Domyślne ustawienia</h3>
			<section>
				<div className="resource">
					<h3 className="settings-section-title">Domyślne ustawienia temperatur</h3>
					<div className="settings-default-temperatures">
						<div>
							<span className="label">Temperatura CWU:</span>
							<input className="temperature" type="number" value={temperatureDefaults.cwu_min ?? ''} onChange={(e) => updateTemperatureDefault('cwu_min', e.currentTarget.value)} />
							<input className="temperature" type="number" value={temperatureDefaults.cwu_max ?? ''} onChange={(e) => updateTemperatureDefault('cwu_max', e.currentTarget.value)} />
						</div>
						<div >
							<span className="label">Temperatura CO:</span>
							<input className="temperature" type="number" value={temperatureDefaults.co_min ?? ''} onChange={(e) => updateTemperatureDefault('co_min', e.currentTarget.value)} />
							<input className="temperature" type="number" value={temperatureDefaults.co_max ?? ''} onChange={(e) => updateTemperatureDefault('co_max', e.currentTarget.value)} />
						</div>
						<div className="settings-section-actions">
			<button type="button" disabled={propertiesSaving} onClick={handleSaveTemperatureDefaults}>{propertiesSaving ? 'Zapisywanie...' : 'Zapisz'}</button>
						</div>
					</div>

				</div>
			</section>
		</div>
	);
}
