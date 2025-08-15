import './style.css';
import '../../api/api';
import { HpRequests } from '../../api/api';
import { THPL, OperationEntry, SettingsEntry } from '../../api/type';
import { useEffect, useMemo, useState } from 'react';
import { ResourceBlock } from '../../components/ResourceBlock';



	// handleDownload() {
	// 	HpRequests.getHpAllData()
	// 		.then((data) => {
	// 			const json = JSON.stringify(data, null, 2);
	// 			const blob = new Blob([json], { type: 'application/json' });
	// 			const href = URL.createObjectURL(blob);

	// 			const link = document.createElement('a');
	// 			link.href = href;
	// 			link.download = 'dane.json';
	// 			document.body.appendChild(link);
	// 			link.click();
	// 			document.body.removeChild(link);

	// 			// HpRequests.clearHpData().then();
	// 		})
	// 		.catch((err) => {
	// 			console.log(err);
	// 			this.setState({ error: true });
	// 	});
	// };

	const handleDownloadCsv = () => {
		HpRequests.getHpAllData()
			.then((data) => {
				const jsonData:THPL[] = data
					.map(row => 
						{	
							const hp: THPL = {
								...row.HP,
								time: row.time,
								pv: row.PV.total_power
							} 
							return hp;
						});
				
				if ( jsonData.length == 0 )	{
					return;
				}
				const headers = Object.keys(jsonData[0]);
				const csvContent = [
					headers.join(';'), // nagłówki
					...jsonData.map(row =>
					headers.map(field => {
						const value = row[field as keyof THPL];
						if (field == 'time') return value;
						if (typeof value === 'boolean') return value ? '1' : '0';
						if (typeof value === 'number') return `"${String(value).replace('.', ',').replace(/"/g, '""')}"`;
						if (typeof value === 'string') return `"${value.replace(/"/g, '""').replace('.', ',')}"`;
						return value;
					}).join(';')
					),
				].join('\n');
			
				const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
				const url = URL.createObjectURL(blob);
				

				const a = document.createElement('a');
				a.href = url;
				a.download = "data.csv";
				a.click();
				URL.revokeObjectURL(url);
			});
	};

export const Settings: React.FC = () => {
	const [settings, setSettings] = useState<SettingsEntry>({});
	const [defaultOperation, setDefaultOperation] = useState<OperationEntry>({});
	const [valueOpration, setValueOperation] = useState<OperationEntry>({});
	const [error, setError] = useState<boolean>(false);
	
	const enableSave = useMemo(() => {
		return Object.entries(valueOpration).length > 0;
	}, [valueOpration]);

	useEffect( () => {
		HpRequests.getSettings()
			.then((resp) => {
				setSettings(resp);
			})
			.catch((err) => {
				console.log(err);
				setError(true);
		});
	
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
	}, []);

	const handleSave = () => {
		console.log(valueOpration);
		if ( Object.entries(valueOpration).length == 0 ) {
			return;
		}

		HpRequests.setOperation(valueOpration).then(response => {
			setError( response?.status === 201 ? false : true );
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
			<h2>Główne ustawienia</h2>
			<section>
				<div className="resource">
					<div className='header3'>
						<h3>Ustaw</h3>
						{/* <button onClick={this.clearDa}>
							Pobierz dane HP JSON
						</button> */}
						<div>
							<button onClick={handleDownloadCsv}>
								Pobierz dane HP CSV
							</button>
						</div>
					</div>
					<hr />
					<div style={{ minWidth: '200px' }}>
						<span className="label">Tryb pracy:</span>
						<select
							name="work_mode"
							className="dict-select"
							onChange={(e) => setValueOperation( {...valueOpration, work_mode: e.currentTarget.value})}
							value={ !!valueOpration.work_mode ? valueOpration.work_mode : defaultOperation.work_mode }
							defaultValue={defaultOperation.work_mode}
						>
							<option value="M">ręczny</option>
							<option value="A">automatyczny</option>
							<option value="PV">automatyczny z PV</option>
							<option value="CWU">CWU</option>
							<option value="OFF">OFF</option>
						</select>
					</div>

					<div style={{ minWidth: '200px' }}>
						<span className="label" style={{ width: '160px' }}>CWU min/max:</span>
						<input
							className="temperature"
							type="number"
							name="cwu_min"
							placeholder={defaultOperation.co_min}
							value={valueOpration.cwu_min}
							onChange={(e) => setValueOperation({...valueOpration, cwu_min: e.currentTarget.value})}
						/>
						<input
							className="temperature"
							type="number"
							name="cwu_max"
							placeholder={defaultOperation.cwu_max}
							value={ valueOpration.cwu_max }
							onChange={(e) => setValueOperation({...valueOpration, cwu_max: e.currentTarget.value})}
						/>
					</div>

					<div style={{ minWidth: '200px' }}>
						<span className="label" style={{ width: '160px' }}>CO min/max:</span>
						<input
							className="temperature"
							type="number"
							name="co_min"
							placeholder= { defaultOperation.co_min }
							value={ valueOpration.co_min }
							onChange={(e) => setValueOperation({...valueOpration, co_min: e.currentTarget.value})}
						/>
						<input
							className="temperature"
							type="number"
							name="co_max"
							placeholder= { defaultOperation.co_max }
							value={ valueOpration.co_max }
							onChange={(e) => setValueOperation({...valueOpration, co_max: e.target.value })}
						/>
					</div>

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
					</div>
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


				<ResourceBlock
					title="Automatyczny start CO"
					description="Przedziały czasu w którym nastąpi włączenie HP."
					data={settings?.settings}
				/>

				<ResourceBlock
					title="Wymuszenie startu CWU"
					description="Okres w którym następuje wymuszenie startu ładowania CWU"
					data={settings?.cwu_settings}
				/>
				{settings?.night_hour && (
				<ResourceBlock
					title="Wyłączenie wykorzystania mocy z PV"
					description="Przedziały czasu w którym nastąpi wyłączenie weryfikacji wytwarzanej mocy na panelach fotowoltaicznych."
					data={[settings?.night_hour]}
				/>)
				}
			</section>
		</div>
	);
}