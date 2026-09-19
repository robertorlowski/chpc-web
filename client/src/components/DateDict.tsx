import './style.css';
import React, { useEffect, useState } from 'react';
import { HpRequests } from '../api/api';

export type DateDropdownProps = {
  /** Wywoływane przy każdej zmianie; przekazuje datę w formacie YYYY.MM.DD. */
  onDateChange?: (value: string) => void;
  initValue?: string;
  id?: string;
  style?: React.CSSProperties;
};

export default function DateDict({ id, initValue, onDateChange, style }: DateDropdownProps) {
  const [dates, setDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState(initValue ?? '');

  useEffect(() => {
    let active = true;

    const loadDates = async () => {
      const availableDates = await HpRequests.getHpAvailableDates();
      if (!active) return;

      const uniqueDates = Array.from(new Set(availableDates ?? [])).sort().reverse();
      setDates(uniqueDates);

      const nextDate = initValue && uniqueDates.includes(initValue)
        ? initValue
        : uniqueDates[0] ?? '';

      setSelectedDate(nextDate);
      if (nextDate && nextDate !== initValue) {
        onDateChange?.(nextDate);
      }
    };

    loadDates();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (initValue && dates.includes(initValue)) {
      setSelectedDate(initValue);
    }
  }, [dates, initValue]);

  const handleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedDate(event.target.value);
    onDateChange?.(event.target.value);
  };

  return (
    <select
      id={id}
      value={selectedDate}
      className="dateDict"
      style={style}
      onChange={handleChange}
      disabled={dates.length === 0}
    >
      {dates.length === 0 ? (
        <option value="">Brak danych</option>
      ) : (
        dates.map((date) => (
          <option key={date} value={date}>{date}</option>
        ))
      )}
    </select>
  );
}
