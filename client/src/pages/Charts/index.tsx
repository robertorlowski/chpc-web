import './style.css';
import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid, ResponsiveContainer } from 'recharts';
import { THPL } from '../../api/type';
import { energyKWh } from '../../utils/energy';
import DateDict from '../../components/DateDict';
import { fetchData, formatDateYMD } from '../../utils/utils';
import { ClipLoader } from 'react-spinners';

export const HeatPumpChart: React.FC = () => {
  const [filteredData, setFilteredData] = useState<THPL[]>([]);
  const [loading, setLoading] = useState<boolean>(false); 
  const [selectedDate, setSelectedDate] = useState<string>(formatDateYMD(new Date()));
  const [allData, setAllData] = useState(false);
  const [kwh, setKwh] = useState(0);      
  const [kwhPV, setKwhPV] = useState(0);      
  const [cTemp, setTemp] = useState(true);
  const [cPower, setPower] = useState(true);
  const [cPV, setPV] = useState(false);
  
    useEffect(() => {
        if (!selectedDate) return;
        let active = true; // guard przeciwko setState po unmount
    
        (async () => {
          if (!active) return;
          setLoading(true);
          try {
            const data = await fetchData(true, selectedDate);
            setKwh(energyKWh(data, false));
            setKwhPV(energyKWh(data, true));

            const filtered = data
                .filter(row => allData || row?.HPS === true)
                .filter(d => d.time?.startsWith(selectedDate))
                .filter((_, index) => index % (allData ? 10 : 2 ) === 0)
                .sort( (a,b) => a.time.localeCompare(b.time) ) 
                .map(d => ({ ...d, time: d.time?.split(' ')[1] })); // tylko godzina
    
            setFilteredData(filtered);
          } catch (err) {
            console.log(err);
          } finally {
            setLoading(false);
          }
        })();
  
        return () => {
          active = false;
        };
      }, 
      [allData, selectedDate]
    );
  
  return (
  <div style={{ paddingTop: '20px', width: '100vw', height: '90vh'}}>
    <h3>
      Temperatury i moc w dniu: &nbsp; 
      <DateDict id="date-select" initValue={selectedDate} onDateChange={e => setSelectedDate(e)} />      
    </h3>

      {loading && 
        (
          <div className='loader'>
              <ClipLoader size={60} color="#333" />
          </div>
        )
      }

    <h4>
 		  <label>Zużyta energia dzienna: {kwhPV.toFixed(2)} / {kwh.toFixed(2)} kWh</label>
    </h4>

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
