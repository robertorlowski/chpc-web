import './style.css';
import '../../api/api';
import { HpRequests, wsAddressServer } from '../../api/api';
import { getSelectedDevice } from '../../context/DeviceContext';
import { HpEntry, HpMetrics, PvMetrics } from '../../api/type';
import React, { useEffect, useRef, useState } from 'react';
import swith_on from '../../assets/swith_on.svg';
import swith_off from '../../assets/swith_off.svg';
import { errorLine, ERROR_LOCK_LIMIT, isLocked } from '../../utils/errors';

const HP: React.FC = () => {

  const [_pv, setPV] = useState<PvMetrics | null >(null);
  const [_hp, setHP] = useState<HpMetrics | null >(null);
  const [_data, setData] = useState<HpEntry | null>(null);
  const [_lastError, setLastError] = useState<HpEntry | null>(null);
  const ws = useRef<WebSocket | null>(null);

  const loadLastError = () => {
    HpRequests.getHpLastError()
      .then(resp => setLastError(resp))
      .catch(err => console.log(err));
  };

  useEffect(() => {
   HpRequests.getCoData()
        .then(resp => {
          setData(resp);
          setHP(resp.HP);
          setPV(resp.PV);
        })
        .catch(err => {
          console.log(err);
        });
      loadLastError();
    },
    []
  );

  useEffect(() => {
    const device = getSelectedDevice();
    const wsUrl = new URL(wsAddressServer());
    if (device) wsUrl.searchParams.set('rootId', device.rootId);
    ws.current = new WebSocket(wsUrl.toString());
    ws.current.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as { type?: string; rootId?: string };
        if (message.type !== 'update' || message.rootId !== device?.rootId) return;

        // pobierz aktualne dane z REST API
        HpRequests.getCoData()
          .then(resp => {
            setData(resp);
            setHP(resp?.HP);
            setPV(resp?.PV);
          })
          .catch(err => console.error('Błąd przy pobieraniu danych:', err));
        loadLastError();
      } catch (error) {
        console.error('Nieprawidłowy komunikat WebSocket:', error);
      }
    };
    return () => {
      ws.current?.close();
    };
  }, []);

  // dzwonek błędu sterownika (ostatnie 24 h albo blokada); null, gdy błędu nie ma
  const errorBell = (_lastError?.error_code || isLocked(_hp?.ERRc)) ? (
    <svg
      className="hp-error-bell"
      viewBox="0 0 24 24"
      role="img"
      aria-label="Błąd sterownika"
    >
      <title>
        {[
          isLocked(_hp?.ERRc) ? `Sterowanie zablokowane (${_hp?.ERRc}/${ERROR_LOCK_LIMIT} błędów)` : '',
          errorLine(_lastError),
        ].filter(Boolean).join('\n')}
      </title>
      <path d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm7-6V11a7 7 0 0 0-5.5-6.84V3.5a1.5 1.5 0 0 0-3 0v.66A7 7 0 0 0 5 11v5l-2 2v1h18v-1Z" />
    </svg>
  ) : null;

  return (
    <div className="settings hp-page">
      <h2>CWU / CO</h2>
      <section>
        <div className="resource">
          <div className="heet">
            <div className="heat head">
              <div>
                <span>{_data?.time}</span>
              </div>
              <div>
                <span>Tryb pracy </span>
                <span className="field">
                  {_data?.work_mode === 'OFF'
                    ? 'OFF'
                    : _data?.work_mode === 'A'
                    ? 'automatyczny'
                    : _data?.work_mode === 'PV'
                    ? 'automatyczny z PV'
                    : _data?.work_mode === 'CWU'
                    ? 'CWU'
                    : _data?.work_mode === 'M'
                    ? 'ręczny'
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
                    <td className="label hp-temp-label">
                      <span className="hp-bell-slot">{errorBell}</span>
                      T:
                    </td>
                    <td className={_data?.HP?.HPS ? 'field correct' : 'field '}>
                      {_hp?.Ttarget || '---'}
                    </td>
                  </tr>
                </tbody>
              </table>
              <table className="heat table">
                <tbody>
                  <tr className="left">
                    <td className="label">CO pompa:</td>
                    <td>
                      {_data?.co_pomp === undefined ? '---' : (
                        <img title="CO pump" src={_data?.co_pomp ? swith_on : swith_off} />
                      )}
                    </td>
                  </tr>
                  <tr>
                    <td className="label">CWU pompa:</td>
                    <td>
                      {_data?.cwu_pomp === undefined ? '---' : (
                        <img title="CWU pump" src={_data.cwu_pomp ? swith_on : swith_off} />
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="heat footer">
              <div>
                Moc PV:
                <span
                  className={_data?.pv_power ? 'field correct' : 'field'}
                  style={{ marginLeft: '5px' }}
                >
                  {_pv && _pv.total_power ? _pv.total_power : '---'}
                </span>{' '}
                W
              </div>
              <div>
                Temp. zewnętrzna:
                <span
                  className={'field'}
                  style={{ marginLeft: '5px' }}
                >
                  {_data?.t_out!  ? _data.t_out.toFixed(1) : '---'}
                </span>{' '}
                °C
              </div>
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
                  <td className="field">{_hp?.Tmin || '---'}</td>
                </tr>
                <tr>
                  <td className="label">Temp. CO max:</td>
                  <td className="field">{_hp?.Tmax || '---'}</td>
                </tr>                  

                {/* <tr>
                  <td className="label">Temp. cold out:</td>
                  <td className={_hp?.Tco < 0 ? 'field incorrect' : 'field'}>{_hp?.Tco || '---'}</td>
                </tr> */}
                <tr>
                  <td className="label">Temp. komp.:</td>
                  <td className="field">{_hp?.Tsump || '---'}</td>
                </tr>
                <tr>
                  <td className="label">Temp. w. wyj:</td>
                  <td className="field">{_hp?.Tho || '---'}</td>
                </tr>
                <tr>
                  <td className="label">EEV max:</td>
                  <td className="field">{_hp?.EEVmax || '---'}</td>
                </tr>
                <tr>
                  <td className="label">EEV min:</td>
                  <td className="field">{_hp?.EEVmin || '---'}</td>
                </tr>
                <tr>
                  <td className="label">Moc min:</td>
                  <td className="field">{_hp?.WWatt || '---'}</td>
                </tr>
                <tr>
                  <td className="label">Pompa ciepła:</td>
                  <td className="field">
                      <img title="Właćzuna " src={_hp?.CO ? swith_on : swith_off} />
                  </td>
                </tr>
              </tbody>
            </table>
            <table>
              <tbody>
                <tr>
                  <td className="label">Temp. BE:</td>
                  <td className={_hp?.Tbe !== undefined && _hp?.Tbe < 0 ? 'field incorrect' : 'field'}>{_hp?.Tbe ?? '---'}</td>
                </tr>
                <tr>
                  <td className="label">Temp. AE:</td>
                  <td className={_hp?.Tae !== undefined && _hp?.Tae < 0 ? 'field incorrect' : 'field'}>{_hp?.Tae ?? '---'}</td>
                </tr>
                <tr>
                  <td className="label">Moc:</td>
                  <td className="field">{_hp?.Watts || '---'}</td>
                </tr>
                <tr>
                  <td className="label">EEV pozycja:</td>
                  <td className="field">{_hp?.EEV_pos || '---'}</td>
                </tr>
                <tr>
                  <td className="label">EEV dt:</td>
                  <td className="field">{_hp?.EEV_dt || '---'}</td>
                </tr>
                <tr>
                  <td className="label">EEV temp.:</td>
                  <td className="field">{_hp?.EEV || '---'}</td>
                </tr>
                
              </tbody>
            </table>
          </div>
          <hr />
          <div className="hp-data">
            <table>
              <tbody>
                <tr>
                  <td className="label">Obieg gorący:</td>
                  <td className="field">
                    <img title="Hot circle state" src={_hp?.HCS ? swith_on : swith_off} />
                  </td>
                </tr>
                <tr>
                  <td className="label">Obieg zimny:</td>
                  <td className="field">
                    <img title="Cold circle state" src={_hp?.CCS ? swith_on : swith_off} />
                  </td>
                </tr>
              </tbody>
            </table>
            <table>
              <tbody>
                <tr>
                  <td className="label">Kompresor:</td>
                  <td className="field">
                    <img title="Kompresor wł/wył" src={_hp?.HPS ? swith_on : swith_off} />
                  </td>
                </tr>
                <tr>
                  <td className="label">Praca wym.:</td>
                  <td className="field">
                    <img title="Praca wymuszona (t. min = t. max)" src={_hp?.F ? swith_on : swith_off} />
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
                    {_hp?.lt_hp_on ? Math.floor(_hp?.lt_hp_on / 60) + ' min.' : '---'}
                  </td>
                </tr>
                <tr>
                  <td className="label">Moc:</td>
                  <td className="field">{_hp?.lt_pow ? _hp?.lt_pow + ' W' : '---'}</td>
                </tr>
                <tr>
                  <td className="label">Temp. min:</td>
                  <td className="field">{_data?.t_min || '---'}</td>
                </tr>
                <tr>
                  <td className="label">Temp. max:</td>
                  <td className="field">{_data?.t_max || '---'}</td>
                </tr>
                <tr>
                  <td className="label">COP:</td>
                  <td className="field">{_data?.cop || '---'}</td>
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

export default HP;
