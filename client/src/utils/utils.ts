import { HpRequests } from "../api/api";
import { THPL } from "../api/type";

export const formatDateYMD = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}.${m}.${d}`;
};

export const stringToDate = (value: string): Date => {
    const [y, m, d] = value.split(".").map(Number);
    const parsed = new Date(y, m - 1, d); 
    return parsed;
}

export const fetchData = async (
  allData: boolean,
  selectedDate: string,
  endDate?: string,
): Promise<THPL[]> => {
  const json = await HpRequests.getHpData4Day(selectedDate, endDate);
  return (json ?? [])
    .filter(row => allData || row?.HP?.HPS === true)
    .sort((a, b) => (b.time ?? "").localeCompare(a.time ?? ""))
    .map<THPL>(row => ({
      ...(row.HP as THPL),
      time: row.time,
      work_mode: row.work_mode,
      pv: row.PV?.total_power,
      t_out: row.t_out
    }));
}

export const fetchMonthlySummary = (
  startDate: string,
  endDate: string,
  group: 'month' | 'day' = 'month',
) => HpRequests.getHpMonthlySummary(startDate, endDate, group);
