import React from 'react';
import { TimeSlot } from '../api/type';

interface ResourceBlockProps {
  title: string;
  description: string;
  data?: TimeSlot[];
}

const format = (num?: number): string => {
  if (num === undefined) return '';
  return num.toString().padStart(2, '0');
};

export const ResourceBlock: React.FC<ResourceBlockProps> = ({ title, description, data }) => {
  return (
    <div className="resource">
      <h3>{title}</h3>
      {description}
      <hr />
      <ul>
        {data?.map((slot, index) => (
          <li key={index}>
            {format(slot?.slot_start_hour)}:{format(slot?.slot_start_minute)} <span />
            <strong>-</strong><span /> {format(slot?.slot_stop_hour)}:{format(slot?.slot_stop_minute)}
          </li>
        ))}
      </ul>
    </div>
  );
};
