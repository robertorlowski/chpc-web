import '../../api/api';
import { HpRequests } from '../../api/api';
import { THP } from '../../api/type';
import React, { useEffect, useState } from 'react';
import {
	ColumnDef,
	flexRender,
	getCoreRowModel,
	useReactTable,
	getFilteredRowModel
} from '@tanstack/react-table';

type THPL = THP & {
  time? :string
};

const columns: ColumnDef<THPL>[] = [
  { header: 'Data', accessorKey: 'time', minSize: 100, size: 100},
  { header: 'EEV pos', accessorKey: 'EEV_pos'},
  { header: 'Watts', accessorKey: 'Watts' },
  { header: 'T. be', accessorKey: 'Tbe'},
  { header: 'T. ae', accessorKey: 'Tae' },
  { header: 'T. ho', accessorKey: 'Tho' },
  { header: 'T. target', accessorKey: 'Ttarget' },
  { header: 'T. sump', accessorKey: 'Tsump' }
];

export const HeatPumpTable: React.FC = () => {
	const [data, setData] = useState<THP[]>([]);
	const [loading, setLoading] = useState<boolean>(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		const fetchData = () => {
		HpRequests.getHpAllData()
			.then(json => {
				setData(
					json.filter(row => row?.HP?.HPS == true )
						.sort( (a,b) => b.time.localeCompare(a.time) ) 
						.map(row => 
						{
							const hp: THPL = row.HP;
							hp["time"] = row.time; 
							return row.HP 
						})
				);
				setLoading(false);
			})
			.catch(err => {
				setError((err as Error).message);
			})	
		}
		
		fetchData();
	}, []);

	const table = useReactTable({
		data,
		columns,
		getCoreRowModel: getCoreRowModel(),
		getFilteredRowModel: getFilteredRowModel(), 
	});

	if (loading) return <p>Ładowanie danych...</p>;
	if (error) return <p>Błąd: {error}</p>;
	if (!data.length) return <p>Brak danych do wyświetlenia.</p>;

  return (
    <div style={{ overflowX: 'auto', padding: '16px' }}>
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
						width: 110
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
						width: 110
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


