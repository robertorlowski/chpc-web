import { Requests } from '../../core/http';
import { WaterMeterReading, WaterMeterSummary, WaterPressureTankRun, WaterSummary, WaterSummaryPeriod } from './types';

// Hydrofor (sterownik water-pressure-tank).
export class WaterPressureTankRequests {
  // dni czasu warszawskiego YYYY-MM-DD, "to" włącznie
  static getRuns(from: string, to: string): Promise<WaterPressureTankRun[] | null> {
    return Requests.get(`/water-pressure-tank/runs?from=${from}&to=${to}`);
  }

  // okres między odczytami wodomierza (daty ISO)
  static getRunsBetween(fromTime: string, toTime: string): Promise<WaterPressureTankRun[] | null> {
    return Requests.get(`/water-pressure-tank/runs?fromTime=${encodeURIComponent(fromTime)}&toTime=${encodeURIComponent(toTime)}`);
  }

  static getSummary(period: WaterSummaryPeriod, date: string): Promise<WaterSummary | null> {
    return Requests.get(`/water-pressure-tank/summary?period=${period}&date=${date}`);
  }

  static getMeterReadings(): Promise<WaterMeterReading[] | null> {
    return Requests.get('/water-pressure-tank/meter');
  }

  static addMeterReading(reading: { readAt: string; valueM3: number; note?: string }) {
    return Requests.post('/water-pressure-tank/meter', reading, false) as Promise<Response | void>;
  }

  static deleteMeterReading(id: string) {
    return Requests.delete(`/water-pressure-tank/meter/${encodeURIComponent(id)}`);
  }

  static getMeterSummary(year: number): Promise<WaterMeterSummary | null> {
    return Requests.get(`/water-pressure-tank/meter/summary?year=${year}`);
  }
}
