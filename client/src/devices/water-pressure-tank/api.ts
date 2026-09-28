import { Requests } from '../../core/http';
import { WaterMeterReading, WaterMeterSummary, WaterPressureRun, WaterSummary, WaterSummaryPeriod } from './types';

// Hydrofor (sterownik water-pressure).
export class WaterRequests {
  // dni czasu warszawskiego YYYY-MM-DD, "to" włącznie
  static getRuns(from: string, to: string): Promise<WaterPressureRun[] | null> {
    return Requests.get(`/water-pressure/runs?from=${from}&to=${to}`);
  }

  // okres między odczytami wodomierza (daty ISO)
  static getRunsBetween(fromTime: string, toTime: string): Promise<WaterPressureRun[] | null> {
    return Requests.get(`/water-pressure/runs?fromTime=${encodeURIComponent(fromTime)}&toTime=${encodeURIComponent(toTime)}`);
  }

  static getSummary(period: WaterSummaryPeriod, date: string): Promise<WaterSummary | null> {
    return Requests.get(`/water-pressure/summary?period=${period}&date=${date}`);
  }

  static getMeterReadings(): Promise<WaterMeterReading[] | null> {
    return Requests.get('/water-pressure/meter');
  }

  static addMeterReading(reading: { readAt: string; valueM3: number; note?: string }) {
    return Requests.post('/water-pressure/meter', reading, false) as Promise<Response | void>;
  }

  static deleteMeterReading(id: string) {
    return Requests.delete(`/water-pressure/meter/${encodeURIComponent(id)}`);
  }

  static getMeterSummary(year: number): Promise<WaterMeterSummary | null> {
    return Requests.get(`/water-pressure/meter/summary?year=${year}`);
  }
}
