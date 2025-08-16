import '../../api/api';
import { HpRequests } from '../../api/api';
import { THPL } from '../../api/type';
import React, { useEffect, useState } from 'react';
import {
	ColumnDef,
	flexRender,
	getCoreRowModel,
	useReactTable,
	getFilteredRowModel
} from '@tanstack/react-table';

const columns: ColumnDef<THPL>[] = [
  { header: 'Data', accessorKey: 'time', minSize: 100, size: 100},
  { header: 'EEV pos', accessorKey: 'EEV_pos'},
  { header: 'Watts', accessorKey: 'Watts' },
  { header: 'PV', accessorKey: 'pv' },
  { header: 'T. be', accessorKey: 'Tbe'},
  { header: 'T. ae', accessorKey: 'Tae' },
  { header: 'T. ho', accessorKey: 'Tho' },
  { header: 'T. target', accessorKey: 'Ttarget' },
  { header: 'T. sump', accessorKey: 'Tsump' }
];

export const HeatPumpTable: React.FC = () => {
	const [data, setData] = useState<THPL[]>([]);
	const [filteredData, setFilteredData] = useState<THPL[]>([]);

	const [error, setError] = useState<string | null>(null);
	const [uniqueDates, setUniqueDates] = useState<string[]>([]);
	const [selectedDate, setSelectedDate] = useState('');
	const [allData, setAllData] = useState<boolean>(false);
		
	useEffect(() => {
			setFilteredData(data
				.filter(d => d.time?.startsWith(selectedDate))
				.map<THPL>(d => ({ ...d, time: d.time?.split(' ')[1] }))
			)
		}, 
		[allData, data, selectedDate]
	);

	useEffect(() => {
			if ( data.length > 0) {
				const ccc= [...new Set(data
						.map(d => d.time?.split(' ')[0])
						.filter((d): d is string => d !== undefined)
					)
				];
				setUniqueDates(ccc);
				if (!selectedDate) {
					setSelectedDate(ccc[0]||'');
				}
			}
		}, 
		[data]
	);


	const fetchData = (all: boolean) => {
		HpRequests.getHpAllData()
			.then(json => {
				setData(
					json
						.filter(row => all || row?.HP?.HPS == true )
						.sort( (a,b) => b.time.localeCompare(a.time) ) 
						.map<THPL>(row => 
							{	
								const hp: THPL = {
									...row.HP,
									time: row.time,
									pv: row.PV.total_power
								} 
								return hp;
							})
						
				);
			})
			.catch(err => {
				setError((err as Error).message);
			})	
	};

	useEffect(() => {
		fetchData(allData);
		
	}, [allData]);

	const table = useReactTable({
		data: filteredData,
		columns,
		getCoreRowModel: getCoreRowModel(),
		getFilteredRowModel: getFilteredRowModel(), 
	});

	if (error) return <p>Błąd: {error}</p>;

  return (
    <div style={{ overflowX: 'auto', padding: '16px' }}>
    	<h3>Dzień: &nbsp;
			<select value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
				style={{fontSize: 16, border: 'none' }}>
				{uniqueDates
					.filter((x): x is string => x !== undefined)
					.sort((a, b) => b.localeCompare(a))
					.map(date => (
				<option key={date} value={date}>{date}</option>
				))
				}
			</select>
		</h3>
		<div style={{ display: "flex" }}>
			<label>
			<input
				title="Wszystkie dane"
				type="checkbox"
				name="allData"
				checked={allData}
				onChange={(e) => {
						setAllData(e.target.checked);
					}
				}
			/>
			Wszystkie dane
			</label>
		</div>
	
		<table style={{
			borderCollapse: 'separate',
			borderSpacing: 0,
			borderRadius: '10px',
			overflow: 'hidden',
			boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
			fontFamily: 'Segoe UI, sans-serif',
			fontSize: '14px',
			backgroundColor: '#fff',
		}}>
		<thead style={{ position: 'sticky', top: 0, backgroundColor: '#f8f8f8', zIndex: 2 }}>
		{table.getHeaderGroups().map(headerGroup => (
			<tr key={headerGroup.id}>
			{headerGroup.headers.map(header => (
				<th
				key={header.id}
				style={
						header.index == 0 ? {
						padding: '10px 12px',
						borderBottom: '1px solid #ddd',
						textAlign: 'left',
						fontWeight: 600,
						backgroundColor: '#f2f2f2',
						color: '#333',
						whiteSpace: 'nowrap',
						position: 'sticky',
						top: 0,
						width: 60
					} :
					{
						padding: '10px 12px',
						borderBottom: '1px solid #ddd',
						textAlign: 'left',
						fontWeight: 600,
						backgroundColor: '#f2f2f2',
						color: '#333',
						whiteSpace: 'nowrap',
						position: 'sticky',
						top: 0,
						width: 40
				}}
				>
				{flexRender(header.column.columnDef.header, header.getContext())}
				{header.column.getCanFilter() && (
					<div>
					<input
						type="text"
						value={(header.column.getFilterValue() ?? '') as string}
						onChange={e => header.column.setFilterValue(e.target.value)}
						style={{ width: '100%', marginTop: 4 }}
					/>
					</div>
				)}
				</th>
			))}
			</tr>
		))}
		</thead>
		<tbody>
		{table.getRowModel().rows.map(row => (
			<tr
			key={row.id}
			style={{
				backgroundColor: row.index % 2 === 0 ? '#fafafa' : '#fff',
				borderBottom: '1px solid #eee',
			}}
			>
			{row.getVisibleCells().map(cell => (
				<td
				key={cell.id}
				style={
						cell.column.getIndex() == 0 ? {
						padding: '10px 12px',
						borderBottom: '1px solid #eee',
						color: '#333',
						whiteSpace: 'nowrap',
						fontSize: '13.5px',
						width: 60
					}
					:
					{
						padding: '10px 12px',
						borderBottom: '1px solid #eee',
						color: '#333',
						whiteSpace: 'nowrap',
						fontSize: '13.5px',
						width: 40
					}}
				>
				{flexRender(cell.column.columnDef.cell, cell.getContext())}
				</td>
			))}
			</tr>
		))}
		</tbody>
	</table>
	</div>
  );
};


