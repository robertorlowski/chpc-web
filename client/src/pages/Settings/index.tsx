import './style.css';
import '../../api/api';
import { HpRequests } from '../../api/api';
import { TOperationCO, TSettings } from '../../api/type';
import { Component } from 'react';
import { ResourceBlock } from '../../components/ResourceBlock';

// function format(num?: Number): String {
// 	if (num === undefined) {
// 		return "";
// 	}
// 	return num.toString().padStart(2, '0');
// }

interface IState {
	data?: TSettings | null;
	value?: TOperationCO | null;
	error: boolean ;
}

export default class Settings extends Component<{}, IState> {
	render() {
		if (!this.state?.data || !this.state?.value) {
			return 'Loading...';
		}
		return (
			<div className="settings">
				<h2>Główne ustawienia</h2>
				<section>
					<div className="resource">
						<div className='header3'>
							<h3>Ustaw</h3>
							<button onClick={this.handleDownload}>
								Pobierz dane HP
							</button>
						</div>
						<hr />
						<div style={{ minWidth: '200px' }}>
							<span className="label">Tryb pracy:</span>
							<select
								name="work_mode"
								className="dict-select"
								onChange={(e) => this.handleSave({ work_mode: e.currentTarget.value })}
								value={this.state.value.work_mode}
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
								value={this.state.value.cwu_min}
								onChange={(e) => this.handleSave({
									cwu_min: e.currentTarget.value,
									cwu_max: this.state.value?.cwu_max
								})}
							/>
							<input
								className="temperature"
								type="number"
								name="cwu_max"
								value={this.state.value.cwu_max}
								onChange={(e) => this.handleSave({
									cwu_min: this.state.value?.cwu_min,
									cwu_max: e.currentTarget.value
								})}
							/>
						</div>

						<div style={{ minWidth: '200px' }}>
							<span className="label" style={{ width: '160px' }}>CO min/max:</span>
							<input
								className="temperature"
								type="number"
								name="co_min"
								value={this.state.value.co_min}
								onChange={(e) => this.handleSave({
									co_min: e.currentTarget.value,
									co_max: this.state.value?.co_max
								})}
							/>
							<input
								className="temperature"
								type="number"
								name="co_max"
								value={this.state.value.co_max}
								onChange={(e) => this.handleSave({
									co_min: this.state.value?.co_min,
									co_max: e.target.value
								})}
							/>
						</div>

						<div style={{ minWidth: '200px' }}>
							<span className="label" style={{ width: '160px' }}>EEV max pulse:</span>
							<input
								className="temperature"
								type="number"
								name="eev_max_pulse_open"
								value={Number(this.state.value.eev_max_pulse_open)}
								onChange={(e) => this.handleSave({
									eev_max_pulse_open: e.currentTarget.value
								})}
							/>
						</div>

						<div style={{ minWidth: '200px' }}>
							<span className="label" style={{ width: '160px' }}>WATT:</span>
							<input
								className="temperature"
								type="number"
								name="working_Watt"
								value={Number(this.state.value.working_watt)}
								onChange={(e) => this.handleSave({
									working_watt: e.currentTarget.value
								})}
							/>
						</div>

						<div style={{ minWidth: '240px' }}>
							<span className="label">Wymuszenie pracy:</span>
							<input
								title="Wymuszenie pracy:"
								type="checkbox"
								checked={this.state.value.force === "1"}
								onChange={(e) => this.handleSave({ force: e.target.checked ? "1" : "0" })}
							/>
						</div>

						<div style={{ minWidth: '240px' }}>
							<span className="label">Pompa zimnej wody:</span>
							<input
								title="Pompa zimnej wody"
								type="checkbox"
								name="coldPomp"
								checked={this.state.value.cold_pomp === "1"}
								onChange={(e) => this.handleSave({ cold_pomp: e.target.checked ? "1" : "0" })}
							/>
						</div>

						<div style={{ minWidth: '240px' }}>
							<span className="label">Pompa ciepłej wody:</span>
							<input
								title="Pompa ciepłej wody"
								type="checkbox"
								name="hotPomp"
								checked={this.state.value.hot_pomp === "1"}
								onChange={(e) => this.handleSave({ hot_pomp: e.target.checked ? "1" : "0" })}
							/>
						</div>

						<div style={{ minWidth: '240px' }}>
							<span className="label">Grzałka krateru:</span>
							<input
								title="Grzałka krateru"
								name="sumpHeater"
								type="checkbox"
								checked={this.state.value.sump_heater === "1"}
								onChange={(e) => this.handleSave({ sump_heater: e.target.checked ? "1" : "0" })}
							/>
						</div>

						<p>
							<span className={this.state.error ? `error show` : `error hide`}>
								Wystąpił błąd podczas wykonywania operacji..
							</span>
						</p>
					</div>


					<ResourceBlock
						title="Automatyczny start CO"
						description="Przedziały czasu w którym nastąpi włączenie HP."
						data={this.state.data?.settings}
					/>

					<ResourceBlock
						title="Wymuszenie startu CWU"
						description="Okres w którym następuje wymuszenie startu ładowania CWU"
						data={this.state.data?.cwu_settings}
					/>
					{this.state.data?.night_hour && (
					<ResourceBlock
						title="Wyłączenie wykorzystania mocy z PV"
						description="Przedziały czasu w którym nastąpi wyłączenie weryfikacji wytwarzanej mocy na panelach fotowoltaicznych."
						data={[this.state.data?.night_hour]}
					/>)
					}
				</section>
			</div>
		);
	}

	componentWillMount() {
		this.setState({ error: false });

		HpRequests.getSettings()
			.then((resp) => {
				this.setState({ data: resp });
			})
			.catch((err) => {
				console.log(err);
				this.setState({ error: true });
		});

		HpRequests.getOperation()
			.then((resp) => {
				this.setState({value: resp});
			})
			.catch((err) => {
				console.log(err);
				this.setState({ error: true });
			} 
		);
	}

	handleSave(value: TOperationCO) {
		// const merged = {...this.state.value, ...value };	
		this.setState({
			value: value
		});
		HpRequests.setOperation(value).then(response => {
			this.setState({ error: response?.status === 201 ? false : true });
		});
	}

	handleDownload() {
		HpRequests.getHpAllData()
			.then((data) => {
				const json = JSON.stringify(data, null, 2);
				const blob = new Blob([json], { type: 'application/json' });
				const href = URL.createObjectURL(blob);

				const link = document.createElement('a');
				link.href = href;
				link.download = 'dane.json';
				document.body.appendChild(link);
				link.click();
				document.body.removeChild(link);

				HpRequests.clearHpData().then();
			})
			.catch((err) => {
				console.log(err);
				this.setState({ error: true });
		});

	}
}
