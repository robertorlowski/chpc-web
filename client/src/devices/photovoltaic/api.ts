import { Requests } from '../../core/http';
import { PvCurrent, PvDay, PvInverters, PvReadingRow, PvSummary, PvSummaryPeriod } from './types';

// Fotowoltaika: widoki z odczytów DTU (/api/photovoltaic/*); rootId i deviceId dopisuje core/http.ts.
// get zwraca null przy błędzie.
export class PhotovoltaicRequests {
  static getCurrent(): Promise<PvCurrent | null> {
    return Requests.get('/photovoltaic/current');
  }

  static getDay(date: string): Promise<PvDay | null> {
    return Requests.get(`/photovoltaic/day?date=${date}`);
  }

  // month: date YYYY-MM, year: YYYY, total: bez daty
  static getSummary(period: PvSummaryPeriod, date: string): Promise<PvSummary | null> {
    return Requests.get(`/photovoltaic/summary?period=${period}${period === 'total' ? '' : `&date=${date}`}`);
  }

  static getReadings(date: string, panel?: string): Promise<PvReadingRow[] | null> {
    return Requests.get(`/photovoltaic/readings?date=${date}${panel ? `&panel=${panel}` : ''}`);
  }

  static getInverters(): Promise<PvInverters | null> {
    return Requests.get('/photovoltaic/inverters');
  }
}
