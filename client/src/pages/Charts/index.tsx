import { useEffect, useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid, ResponsiveContainer } from 'recharts';
import { THPL } from '../../api/type';
import { HpRequests } from '../../api/api';
import { energyKWh } from '../../utils/energy';

export const HeatPumpChart: React.FC = () => {
  
  const [powerData, setPowerData] = useState<THPL[]>([]);
  const [data, setData] = useState<THPL[]>([]);
  const [selectedDate, setSelectedDate] = useState('');
  const [cTae, setTae] = useState(true);
  const [cTbe, setTbe] = useState(true);
  const [cTho, setTho] = useState(true);
  const [cTTarget, setTTarget] = useState(true);
  const [cWatts, setWatts] = useState(true);
  const [cWattsPV, setWattsPV] = useState(false);
  const [allData, setAllData] = useState(true);
  const [kwh, setKwh] = useState(0);      
  const [kwhPV, setKwhPV] = useState(0);      
  const [uniqueDates, setUniqueDates] = useState<string[]>([]);
 

  // Filtrowanie danych do wybranego dnia
  const filteredData = useMemo(() => {
    setKwh(energyKWh(powerData.filter(row => row.time?.startsWith(selectedDate)), false));
    setKwhPV(energyKWh(powerData.filter(row => row.time?.startsWith(selectedDate)), true));
        
    return data
      .filter(d => d.time?.startsWith(selectedDate))
      .map(d => ({ ...d, time: d.time?.split(' ')[1] })); // tylko godzina
  }, [data, selectedDate]);
    
  useEffect(() => {
    if (uniqueDates.length === 0 && data.length > 0) {
      console.log("uniqueDates");
      const ccc= [...new Set(data
            .map(d => d.time?.split(' ')[0])
            .filter((d): d is string => d !== undefined)
          )
      ];
      setUniqueDates(ccc);
      setSelectedDate(ccc[ccc.length-1]||'');
    }
  }, [data, uniqueDates]);

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
                Watts: Math.max(0, (row.HP?.Watts ?? 0) - 120 ),
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

    <div style={{ display: "flex", justifyContent: 'flex-start', marginBottom: 10, marginLeft: 65 }}>
			<label>
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
        Rozkład całego dnia
      </label>
      <span className="spacer"/>
			<label>
        <input
          title="Tbe"
          type="checkbox"
          name="cTbe"
          checked={cTbe}
          onChange={(e)=>{
            setTbe(e.target.checked)
          }}
        />
        Temp. przed parownikiem
      </label>
      <span className="spacer"/>
			<label>
        <input
          title="Tae"
          type="checkbox"
          name="cTae"
          checked={cTae}
          onChange={(e)=>{
            setTae(e.target.checked)
          }}
        />
        Temp. za parownikiem  
      </label>
      <span className="spacer"/>
			<label>
        <input
          type="checkbox"
          name="cTho"
          checked={cTho}
          onChange={(e)=>{
            setTho(e.target.checked)
          }}
        />
        Temp. wody za skraplaczem
      </label>
      <span className="spacer"/>
			<label>
        <input
          type="checkbox"
          name="cTTarget"
          checked={cTTarget}
          onChange={(e)=>{
            setTTarget(e.target.checked)
          }}
        />
        Temp. CWU
      </label>
      <span className="spacer"/>
			<label>
        <input
          type="checkbox"
          name="cWatt"
          checked={cWatts}
          onChange={(e)=>{
            setWatts(e.target.checked)
          }}
        />
        Moc
      </label>
     <span className="spacer"/>
			<label>
        <input
          type="checkbox"
          name="cWattPV"
          checked={cWattsPV}
          onChange={(e)=>{
            setWattsPV(e.target.checked)
          }}
        />
        Moc PV
      </label>
		</div>
    <ResponsiveContainer width="100%" height="80%">
      <LineChart data={filteredData} 
           margin={{ top: 0, right: 30, left: 30, bottom: 0 }}>
        <Tooltip />   
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="time" tick={{ fontSize: 12 }} angle={-45} textAnchor="end" name="Czas"/>
        <YAxis yAxisId="left" label={{ value: 'Temp [°C]', angle: -90, position: 'insideLeft' }} />
        <YAxis yAxisId="right" orientation="right" label={{ value: 'Moc [W]', angle: -90, position: 'insideRight' }} />
        <Line yAxisId="left" type="monotone" dataKey="Tbe" stroke="#463de0ff" name="Temp. przed parownikiem" dot={{ r: 1 }} hide={!cTbe}/>
        <Line yAxisId="left" type="monotone" dataKey="Tae" stroke="#0ace55ff" name="Temp. za parownikiem" dot={{ r: 1 }} hide={!cTae} />
        <Line yAxisId="left" type="monotone" dataKey="Tho" stroke="#c4922fff" name="Temp. wody za skraplaczem" dot={{ r: 1 }} hide={!cTho}/>
        <Line yAxisId="left" type="monotone" dataKey="Ttarget" stroke="#ec1b4fff" name="Temp. CWU" dot={{ r: 1 }} hide={!cTTarget}/>
        <Line yAxisId="right" type="monotone" dataKey="Watts" stroke="#5f5050ff" strokeDasharray="5 5" name="Moc" dot={{ r: 1 }} hide={!cWatts}/>
        <Line yAxisId="right" type="monotone" dataKey="pv" stroke="#ec30a4ff" strokeDasharray="5 5" name="Moc PV" dot={{ r: 1 }} hide={!cWattsPV}/>
        <Legend 
          wrapperStyle={{ paddingTop: 30 }} 
        />
      </LineChart>
    </ResponsiveContainer>
  </div>  )
}
