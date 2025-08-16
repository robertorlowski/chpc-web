import './style.css';
import { useEffect, useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid, ResponsiveContainer } from 'recharts';
import { THPL } from '../../api/type';
import { HpRequests } from '../../api/api';
import { energyKWh } from '../../utils/energy';

export const HeatPumpChart: React.FC = () => {
  
  const [powerData, setPowerData] = useState<THPL[]>([]);
  const [data, setData] = useState<THPL[]>([]);
  const [selectedDate, setSelectedDate] = useState('');
  const [allData, setAllData] = useState(false);
  const [kwh, setKwh] = useState(0);      
  const [kwhPV, setKwhPV] = useState(0);      
  const [uniqueDates, setUniqueDates] = useState<string[]>([]);
  const [cTemp, setTemp] = useState(true);
  const [cPower, setPower] = useState(true);
  const [cPV, setPV] = useState(false);
  
  // Filtrowanie danych do wybranego dnia
  const filteredData = useMemo(() => {
    setKwh(energyKWh(powerData.filter(row => row.time?.startsWith(selectedDate)), false));
    setKwhPV(energyKWh(powerData.filter(row => row.time?.startsWith(selectedDate)), true));
        
    return data
      .filter(d => d.time?.startsWith(selectedDate))
      .map(d => ({ ...d, time: d.time?.split(' ')[1] })); // tylko godzina
  }, [data, selectedDate]);
    
  useEffect(() => {
    if (data.length > 0) {
      const ccc= [...new Set(data
            .map(d => d.time?.split(' ')[0])
            .filter((d): d is string => d !== undefined)
          )
      ];
      setUniqueDates(ccc);
      if (!selectedDate) {
        setSelectedDate(ccc[ccc.length-1]||'');
      }
    }
  }, [data]);

  const fetchData = (all: boolean) => {
    HpRequests.getHpAllData()
      .then(json => {
       const ttt: THPL[] = 
          json
            .filter((_, index) => index % (all ? 10 : 2 ) === 0)
            .sort( (a,b) => a.time.localeCompare(b.time) ) 
            .map<THPL>(row => 
            {
              const hp: THPL = {
                ...row.HP,
                time: row.time, 
                pv: row.PV?.total_power ?? 0
              }  
              return hp;
            })

        setPowerData(ttt);
        setData(ttt.filter(row => all || row.HPS == true ));
      })
      .catch(err => {
        console.log(err);
      })	
  };

  useEffect(() => {
    fetchData(allData);
  }, [allData]); 

  return (
  <div style={{ width: '100vw', height: '90vh'}}>
    <h2>Temperatury i Moc w dniu &nbsp;
      <select value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
        style={{fontSize: 24, border: 'none' }}>
        {uniqueDates
            .filter((x): x is string => x !== undefined)
            .sort((a, b) => b.localeCompare(a))
            .map(date => (
          <option key={date} value={date}>{date}</option>
        ))
        }
      </select>
    </h2>
    <h5>
 		<label>Zużyta energia dzienna: {kwhPV.toFixed(2)} / {kwh.toFixed(2)} kWh</label>
    </h5>

    <div className='chart-checkbox'>
			<label className='label'>
        <input
          title="Pokaż rozkład w ciągu całego dnia"
          type="checkbox"
          name="allData"
          checked={allData}
          onChange={(e) => {
              setAllData(e.target.checked); 
            }
          }
        />
        Cały dzień
      </label>
			<label className='label'>
        <input
          title="Temp"
          type="checkbox"
          name="cTemp"
          checked={cTemp}
          onChange={(e)=>{
            setTemp(e.target.checked)
          }}
        />
        Temperatura
      </label>
			<label className='label'>
        <input
          type="checkbox"
          name="cPower"
          checked={cPower}
          onChange={(e)=>{
            setPower(e.target.checked)
          }}
        />
        Moc
      </label>
			<label className='label'>
        <input
          type="checkbox"
          name="cPV"
          checked={cPV}
          onChange={(e)=>{
            setPV(e.target.checked)
          }}
        />
        PV
      </label>
		</div>
    <ResponsiveContainer width="100%" height="80%">
      <LineChart data={filteredData} 
           margin={{ top: 0, right: 30, left: 30, bottom: 0 }}>
        <Tooltip />   
        <CartesianGrid strokeDasharray="1 1" />
        <XAxis dataKey="time" tick={{ fontSize: 12 }} angle={-45} textAnchor="end" name="Czas"/>
        <YAxis yAxisId="left" label={{ value: 'Temp [°C]', angle: -90, position: 'insideLeft' }} />
        <YAxis yAxisId="right" orientation="right" label={{ value: 'Moc [W]', angle: -90, position: 'insideRight' }} />
        <Line yAxisId="left" type="monotone" dataKey="Tbe" stroke="#463de0ff" name="Temp. przed parownikiem" dot={{ r: 1 }} hide={!cTemp}/>
        <Line yAxisId="left" type="monotone" dataKey="Tae" stroke="#0ace55ff" name="Temp. za parownikiem" dot={{ r: 1 }} hide={!cTemp} />
        <Line yAxisId="left" type="monotone" dataKey="Tho" stroke="#c4922fff" name="Temp. wody za skraplaczem" dot={{ r: 1 }} hide={!cTemp}/>
        <Line yAxisId="left" type="monotone" dataKey="Ttarget" stroke="#ec1b4fff" name="Temp. CWU" dot={{ r: 1 }} hide={!cTemp}/>
        <Line yAxisId="right" type="monotone" dataKey="Watts" stroke="#5f5050ff" strokeDasharray="1 1" name="Moc" dot={{ r: 1 }} hide={!cPower}/>
        <Line yAxisId="right" type="monotone" dataKey="pv" stroke="#ec30a4ff" strokeDasharray="1 1" name="Moc PV" dot={{ r: 1 }} hide={!cPV}/>
        <Legend 
          wrapperStyle={{ paddingTop: 30 }} 
        />
      </LineChart>
    </ResponsiveContainer>
  </div>  )
}
