import './style.css'
import React, { useMemo, useState } from "react";
import { formatDateYMD, stringToDate } from "../utils/utils";

export type DateDropdownProps = {
  /** Wywoływane przy każdej zmianie; przekazuje datę w formacie YYYY.MM.DD */
  onDateChange?: (value: string) => void;
  initValue?: string;
  id?: string;
  style?: React.CSSProperties;
};

const generateDates = (start: Date, end: Date): Date[] => {
  const out: Date[] = [];
  const cur = new Date(start);
  // zerujemy czas, żeby porównania <= działały przewidywalnie
  cur.setHours(0, 0, 0, 0);
  const endCopy = new Date(end);
  endCopy.setHours(0, 0, 0, 0);

  while (cur <= endCopy) {
    out.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
};

export default function DateDict({id, initValue, onDateChange, style }: DateDropdownProps) {
  const startDate = useMemo(() => new Date(2025, 7, 15), []); // 15.08.2025 (miesiące: 0-index)
  const today = useMemo(() => {
    const t = !!initValue ? stringToDate(initValue) : new Date();
    t.setHours(0, 0, 0, 0);
    return t;
  }, []);

  const dates = useMemo<Date[]>(() => generateDates(startDate, today), [startDate, today]);

  // domyślnie wybrany dzień bieżący
  const [selectedDate, setSelectedDate] = useState<string>( formatDateYMD(today));

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedDate(e.target.value);
    onDateChange?.(e.target.value); 
};

  return (
    <select id={id} value={selectedDate} 
      className="dateDict"
      style={style}
      onChange={handleChange}>
      {dates.map((date) => {
        const v = formatDateYMD(date);
        return (
          <option key={v} value={v}>
            {v}
          </option>
        );
      })}
    </select>
  );
}
