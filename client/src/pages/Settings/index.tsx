import './style.css';
import '../../api/api';
import { HpRequests } from '../../api/api';
import { TSaveCO, TSettings, TSlot } from '../../api/type';
import { Component } from 'react';
import { ResourceBlock } from '../../components/ResourceBlock';

function format(num?: Number): String {
	if (num === undefined) {
		return "";
	}
	return num.toString().padStart(2, '0');
}

interface IState {
	data?: TSettings;
	value?: TSaveCO;
	error?: boolean;
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
						<h3>Ustaw</h3>
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
									co_max: e.currentTarget.value
								})}
							/>
						</div>

						<div style={{ minWidth: '240px' }}>
							<span className="label">Wymuszenie pracy:</span>
							<input
								title="Wymuszenie pracy:"
								type="checkbox"
								checked={this.state.value.force === "1"}
								onChange={(e) => this.handleSave({ force: e.currentTarget.checked ? "1" : "0" })}
							/>
						</div>

						<div style={{ minWidth: '240px' }}>
							<span className="label">Pompa zimnej wody:</span>
							<input
								title="Pompa zimnej wody"
								type="checkbox"
								name="coldPomp"
								checked={this.state.value.cold_pomp === "1"}
								onChange={(e) => this.handleSave({ cold_pomp: e.currentTarget.checked ? "1" : "0" })}
							/>
						</div>

						<div style={{ minWidth: '240px' }}>
							<span className="label">Pompa ciepłej wody:</span>
							<input
								title="Pompa ciepłej wody"
								type="checkbox"
								name="hotPomp"
								checked={this.state.value.hot_pomp === "1"}
								onChange={(e) => this.handleSave({ hot_pomp: e.currentTarget.checked ? "1" : "0" })}
							/>
						</div>

						<div style={{ minWidth: '240px' }}>
							<span className="label">Grzałka krateru:</span>
							<input
								title="Grzałka krateru"
								name="sumpHeater"
								type="checkbox"
								checked={this.state.value.sump_heater === "1"}
								onChange={(e) => this.handleSave({ sump_heater: e.currentTarget.checked ? "1" : "0" })}
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
						data={this.state.data.settings}
					/>

					<ResourceBlock
						title="Wymuszenie startu CWU"
						description="Okres w którym następuje wymuszenie startu ładowania CWU"
						data={this.state.data.cwu_settings}
					/>
					<ResourceBlock
						title="Wyłączenie wykorzystania mocy z PV"
						description="Przedziały czasu w którym nastąpi wyłączenie weryfikacji wytwarzanej mocy na panelach fotowoltaicznych."
						data={[this.state.data.night_hour]}
					/>
				</section>
			</div>
		);
	}

	componentWillMount() {
		this.setState({ error: false });

		HpRequests.getSettings()
			.then((resp) => {
				console.log(resp);
				this.setState({ data: resp });
			})
			.catch((err) => console.log(err));

		HpRequests.getCoData()
			.then((resp) => {
				this.setState({
					value: {
						force: resp.HP.F ? "1" : "0",
						work_mode: resp.work_mode,
						cold_pomp: resp.HP.CCS ? "1" : "0",
						hot_pomp: resp.HP.HCS ? "1" : "0",
						sump_heater: resp.HP.SHS ? "1" : "0",
						co_min: String(resp.co_min),
						co_max: String(resp.co_max),
						cwu_min: String(resp.cwu_min),
						cwu_max: String(resp.cwu_max),
					}
				});
			})
			.catch((err) => console.log(err));
	}

	handleSave(value: TSaveCO) {
		this.setState({
			value: {
				force: value.force ?? this.state.value?.force,
				work_mode: value.work_mode ?? this.state.value?.work_mode,
				cold_pomp: value.cold_pomp ?? this.state.value?.cold_pomp,
				hot_pomp: value.hot_pomp ?? this.state.value?.hot_pomp,
				sump_heater: value.sump_heater ?? this.state.value?.sump_heater,
				co_min: value.co_min ?? this.state.value?.co_min,
				co_max: value.co_max ?? this.state.value?.co_max,
				cwu_min: value.cwu_min ?? this.state.value?.cwu_min,
				cwu_max: value.cwu_max ?? this.state.value?.cwu_max,
			}
		});
		console.log(this.state.value);

		HpRequests.setCoData(value).then(response => {
			console.log(response);
			this.setState({ error: response.status === 200 ? false : true });
		});
	}
}
