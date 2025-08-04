import { useEffect, useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid, ResponsiveContainer } from 'recharts';
import { THPL } from '../../api/type';
import { HpRequests } from '../../api/api';

// Zakładamy, że masz dane w formacie JSON, np. jako props lub zaimportowane z pliku

export const HeatPumpChart: React.FC = () => {
  
  const [data, setData] = useState<THPL[]>([]);
  const [selectedDate, setSelectedDate] = useState('');
  
  // Filtrowanie danych do wybranego dnia
  const filteredData = useMemo(() => {
    return data
      .filter(d => d.time?.startsWith(selectedDate))
      .map(d => ({ ...d, time: d.time?.split(' ')[1] })); // tylko godzina
  }, [data, selectedDate]);
  
  const uniqueDates = useMemo(() => {
    return [...new Set(data.map(d => d.time?.split(' ')[0]))];
  }, [data]);

  const fetchData = (all: boolean) => {
    HpRequests.getHpAllData()
      .then(json => {
        setData(
          json
            .filter(row => all || row?.HP?.HPS == true )
            .filter((_, index) => index % (all ? 20 : 5 ) === 0)
            .sort( (a,b) => a.time.localeCompare(b.time) ) 
            .map(row => 
            {
              const hp: THPL = row.HP;
              hp["time"] = row.time; 
              return row.HP 
            })
        );
      })
      .catch(err => {
        console.log(err);
      })	
  };

  useEffect(() => {
    fetchData(false);
  }, []);


  return (
 <div style={{ width: '100vw', height: '90vh'}}>
    <h2>Temperatury i Moc w dniu &nbsp;
      <select value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
        style={{fontSize: 24, border: 'none' }}>
        {uniqueDates.map(date => (
          <option key={date} value={date}>{date}</option>
        ))}
      </select>
    </h2>
    <div style={{ display: "flex", justifyContent: 'flex-start', marginBottom: 10, marginLeft: 65 }}>
			<input
				title="Pokaż rozkład w ciągu całego dnia"
				type="checkbox"
				name="allData"
				onChange={(e) => {
						fetchData(e.target.checked);
            setSelectedDate(uniqueDates[0] || '');
					}
				}
			/>
    	<span className="label" style={{minWidth: 100}}>Rozkład całego dnia</span>
		</div>
    <ResponsiveContainer width="100%" height="80%">
      <LineChart data={filteredData} 
           margin={{ top: 0, right: 30, left: 30, bottom: 0 }}>
       <Tooltip />   
        <CartesianGrid strokeDasharray="5 5" />
        <XAxis dataKey="time" tick={{ fontSize: 12 }} angle={-45} textAnchor="end" interval={2}/>
        <YAxis yAxisId="left" label={{ value: 'Temp [°C]', angle: -90, position: 'insideLeft' }} />
        <YAxis yAxisId="right" orientation="right" label={{ value: 'Moc [W]', angle: -90, position: 'insideRight' }} />
        <Line yAxisId="left" type="monotone" dataKey="Tbe" stroke="#8884d8" name="Temp. przed parownikiem" dot={{ r: 1 }} />
        <Line yAxisId="left" type="monotone" dataKey="Tae" stroke="#82ca9d" name="Temp. za parownikiem" dot={{ r: 1 }}  />
        <Line yAxisId="left" type="monotone" dataKey="Tho" stroke="#ffc658" name="Temp. wody za skraplaczem" dot={{ r: 1 }} />
        <Line yAxisId="left" type="monotone" dataKey="Ttarget" stroke="#ff5882ff" name="Temp. zadana" dot={{ r: 1 }} />
        <Line yAxisId="right" type="monotone" dataKey="Watts" stroke="#000000" strokeDasharray="5 5" name="Watts" dot={{ r: 1 }} />
        <Legend 
          wrapperStyle={{ paddingTop: 20 }} 
        />
      </LineChart>
    </ResponsiveContainer>
  </div>  )
}
