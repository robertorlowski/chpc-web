import './style.css';
import '../../api/api';
import { HpRequests } from '../../api/api';
import { TCO, THP, TPV } from '../../api/type';
import swith_on from '../../assets/swith_on.svg';
import swith_off from '../../assets/swith_off.svg';
import { Component } from 'react';

interface IState {
  data?: TCO;
}

export default class HP extends Component<{}, IState> {
  componentWillMount() {
    HpRequests.getCoData()
      .then(resp => {
        this.setState({ data: resp });
      })
      .catch(err => {
        console.log(err);
      });
  }

  render() {
    if (!this.state?.data) {
      return 'Loading...';
    }

    let _pv: TPV = this.state.data.PV;
    let _hp: THP = this.state.data.HP;
    let _data: TCO = this.state.data;

    return (
      <div className="settings">
        <h2>CWU / CO</h2>
        <section>
          <div className="resource">
            <div className="heet">
              <div className="heat head">
                <div>
                  <span>{_data.time}</span>
                </div>
                <div>
                  <span>Tryb pracy </span>
                  <span className="field">
                    {_data.work_mode === 'M'
                      ? 'ręczny'
                      : _data.work_mode === 'A'
                      ? 'automatyczny'
                      : _data.work_mode === 'PV'
                      ? 'automatyczny z PV'
                      : _data.work_mode === 'CWU'
                      ? 'CWU'
                      : _data.work_mode === 'OFF'
                      ? 'OFF'
                      : '---'}
                  </span>
                </div>
              </div>
              <div className="heat body">
                <table
                  className="heat table"
                  style={{ fontSize: '32px'}}
                >
                  <tbody>
                    <tr>
                      <td className="label">T:</td>
                      <td className={_data.co_pomp ? 'field incorrect' : 'field correct'}>
                        {_hp.Ttarget || '---'}
                      </td>
                    </tr>
                  </tbody>
                </table>
                <table className="heat table">
                  <tbody>
                    <tr className="left">
                      <td className="label">CO pump:</td>
                      <td>
                        {_data.co_pomp === undefined ? '---' : (
                          <img title="CO pump" src={_data.co_pomp ? swith_on : swith_off} />
                        )}
                      </td>
                    </tr>
                    <tr>
                      <td className="label">CWU pump:</td>
                      <td>
                        {_hp.CWUS === undefined ? '---' : (
                          <img title="CWU circle state" src={_hp.CWUS ? swith_on : swith_off} />
                        )}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="heat footer">
                <table>
                  <tbody>
                    <tr>
                      <td>
                        PV:
                        <span
                          className={_data.pv_power ? 'field correct' : 'field'}
                          style={{ marginLeft: '5px' }}
                        >
                          {_pv && _pv.total_power ? _pv.total_power : '---'}
                        </span>{' '}
                        W
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <br />
          <div className="resource">
            <h3>Pompa ciepła</h3>
            <hr />
            <div className="hp-data">
              <table>
                <tbody>
                  <tr>
                    <td className="label">Temp. CO min:</td>
                    <td className="field">{_hp.Tmin || '---'}</td>
                  </tr>
                  <tr>
                    <td className="label">Temp. BE</td>
                    <td className={_hp.Tbe < 0 ? 'field incorrect' : 'field'}>{_hp.Tbe || '---'}</td>
                  </tr>
                  <tr>
                    <td className="label">Temp. cold out:</td>
                    <td className={_hp.Tco < 0 ? 'field incorrect' : 'field'}>{_hp.Tco || '---'}</td>
                  </tr>
                  <tr>
                    <td className="label">Temp. comp.:</td>
                    <td className="field">{_hp.Tsump || '---'}</td>
                  </tr>
                  <tr>
                    <td className="label">EEV dt:</td>
                    <td className="field">{_hp.EEV_dt || '---'}</td>
                  </tr>
                  <tr>
                    <td className="label">EEV position:</td>
                    <td className="field">{_hp.EEV_pos || '---'}</td>
                  </tr>
                </tbody>
              </table>
              <table>
                <tbody>
                  <tr>
                    <td className="label">Temp. CO max:</td>
                    <td className="field">{_hp.Tmax || '---'}</td>
                  </tr>
                  <tr>
                    <td className="label">Temp. AE:</td>
                    <td className={_hp.Tae < 0 ? 'field incorrect' : 'field'}>{_hp.Tae || '---'}</td>
                  </tr>
                  <tr>
                    <td className="label">Temp. hot out:</td>
                    <td className="field">{_hp.Tho || '---'}</td>
                  </tr>
                  <tr>
                    <td className="label">Watts:</td>
                    <td className="field">{_hp.Watts || '---'}</td>
                  </tr>
                  <tr>
                    <td className="label">EEV temp.:</td>
                    <td className="field">{_hp.EEV || '---'}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <hr />
            <div className="hp-data">
              <table>
                <tbody>
                  <tr>
                    <td className="label">Hot pump:</td>
                    <td className="field">
                      <img title="Hot circle state" src={_hp.HCS ? swith_on : swith_off} />
                    </td>
                  </tr>
                  <tr>
                    <td className="label">Cold pump:</td>
                    <td className="field">
                      <img title="Cold circle state" src={_hp.CCS ? swith_on : swith_off} />
                    </td>
                  </tr>
                </tbody>
              </table>
              <table>
                <tbody>
                  <tr>
                    <td className="label">Compressor:</td>
                    <td className="field">
                      <img title="Compressor on/off" src={_hp.HPS ? swith_on : swith_off} />
                    </td>
                  </tr>
                  <tr>
                    <td className="label">Force:</td>
                    <td className="field">
                      <img title="Force (t. min = t. max)" src={_hp.F ? swith_on : swith_off} />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <hr />
            <div className="hp-data">
              <table>
                <tbody>
                  <tr>
                    <td className="label">Czas pracy:</td>
                    <td className="field">
                      {_hp.last_heatpump_on ? Math.floor(_hp.last_heatpump_on / 60) + ' min.' : '---'}
                    </td>
                  </tr>
                  <tr>
                    <td className="label">Moc:</td>
                    <td className="field">{_hp.last_power ? _hp.last_power + ' W' : '---'}</td>
                  </tr>
                  <tr>
                    <td className="label">T. min:</td>
                    <td className="field">{_data.t_min || '---'}</td>
                  </tr>
                  <tr>
                    <td className="label">T. max:</td>
                    <td className="field">{_data.t_max || '---'}</td>
                  </tr>
                  <tr>
                    <td className="label">COP:</td>
                    <td className="field">{_data.cop || '---'}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <br />
          <div className="resource">
            <h3>Instalacja fotowtaiczna</h3>
            <hr />
            <div>
              <ul>
                <li>
                  Moc: <strong>{_pv && _pv.total_power ? _pv.total_power : '---'} </strong> W
                </li>
                <li>
                  Temperatura: <strong>{_pv && _pv.temperature ? _pv.temperature : '---'} </strong> C
                </li>
                <li>
                  Produkcja dziś:{' '}
                  <strong>{_pv && _pv.total_prod_today ? _pv.total_prod_today : '---'} </strong> W
                </li>
              </ul>
            </div>
          </div>
        </section>
      </div>
    );
  }
}
