import '../../api/api';
import { THPL } from '../../api/type';
import React, { useEffect, useState } from 'react';
import {
	ColumnDef,
	flexRender,
	getCoreRowModel,
	useReactTable,
	getFilteredRowModel
} from '@tanstack/react-table';
import DateDict from '../../components/DateDict';
import { fetchData, formatDateYMD } from '../../utils/utils';
import { ClipLoader } from 'react-spinners';

const columns: ColumnDef<THPL>[] = [
  { header: 'Data', accessorKey: 'time', minSize: 100, size: 100},
  { header: 'Watts', accessorKey: 'Watts' },
  { header: 'PV', accessorKey: 'pv' },
  { header: 'EEV pos', accessorKey: 'EEV_pos'},
  { header: 'ΔT', accessorKey: 'EEV_dt' },
  { header: 'T. be', accessorKey: 'Tbe'},
  { header: 'T. ae', accessorKey: 'Tae' },
  { header: 'T. ho', accessorKey: 'Tho' },
  { header: 'T. target', accessorKey: 'Ttarget' },
  { header: 'T. sump', accessorKey: 'Tsump' },
  { header: 'T. out', accessorKey: 't_out' },  
];

export const HeatPumpTable: React.FC = () => {
	const [filteredData, setFilteredData] = useState<THPL[]>([]);
	const [loading, setLoading] = useState<boolean>(false);
	const [error, setError] = useState<string | null>(null);
	const [selectedDate, setSelectedDate] = useState<string>( formatDateYMD( new Date()));
	const [allData, setAllData] = useState<boolean>(false);
		
	useEffect(() => {
			if (!selectedDate) return;
			let active = true; // guard przeciwko setState po unmount

			(async () => {
				if (!active) return;
				setLoading(true);
				try {
					const data = await fetchData(allData, selectedDate);
					const filtered = data
					    .filter(d => d.time?.startsWith(selectedDate))
						.map(d => ({ ...d, time: d.time?.split(' ')[1] })); // tylko godzina
	
					setFilteredData(filtered);
				} catch (err) {
					if (active) setError((err as Error).message);
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


	const table = useReactTable({
		data: filteredData,
		columns,
		getCoreRowModel: getCoreRowModel(),
		getFilteredRowModel: getFilteredRowModel(), 
	});

	if (error) return <p>Błąd: {error}</p>;

  return (
    <div style={{ overflowX: 'auto', padding: '16px' }}>
    	<h3>
	    	<label htmlFor="date-select">Dane na dzień: &nbsp; </label>
    		<DateDict id="date-select" initValue={selectedDate} onDateChange={e => setSelectedDate(e)} />
		</h3>

      	{loading && 
	  		(
				<div className='loader'>
					<ClipLoader size={60} color="#333" />
				</div>
			)	
		}

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


