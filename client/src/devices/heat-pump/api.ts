import { Requests } from '../../core/http';
import { CurrentSchedule, HpEntry, OperationEntry, ScheduleEntry } from './types';

// Pompa ciepła (sterownik co): telemetria, podsumowania, operacje i harmonogramy.
export class HpRequests {
  static getHpMonthlySummary(
    startDate: string,
    endDate: string,
    group: 'month' | 'day' = 'month',
  ) {
      return Requests.get(
        `/hp/monthly-summary?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}&group=${group}`,
      ) as Promise<Array<{
        month?: number;
        day?: number;
        consumptionKWh: number;
        pvGenerationKWh: number;
        gridEnergyKWh: number;
        pvUsedKWh: number;
        totalVariableCostPLN: number;
      }> | null>;
  }

  static getCoData() : Promise<HpEntry> {
      return Requests.get("/hp");
  }

  static getHpAllData() : Promise<HpEntry[]> {
      return Requests.get("/hp/all");
  }

  static getHpAvailableDates(): Promise<string[] | null> {
      return Requests.get('/hp/dates');
  }

  static getHpData4Day(day?: string, endDay?: string) : Promise<HpEntry[]> {
      if (!day || (endDay && !day)) {
        return Promise.resolve([])
      }

      const query = endDay
        ? `startDate=${encodeURIComponent(day)}&endDate=${encodeURIComponent(endDay)}`
        : `date=${encodeURIComponent(day)}`;

      return Requests.get(`/hp/4Day?${query}`);
  }

  static prepareOperation() : Promise<OperationEntry> {
      return Requests.get("/operation");
  }

  static getOperation() : Promise<OperationEntry> {
      return Requests.get("/operation/get");
  }

  static setOperation(data: OperationEntry) {
      console.log(JSON.stringify(data));
      return Requests.post("/operation/set", data, false);
  }

  // akcja jednorazowa dla sterownika: 'error_reset' (odblokowanie) albo 'restart'
  static runOperationAction(action: 'error_reset' | 'restart') {
      return Requests.post("/operation/action", { action }, false);
  }

  static getHpLastError() : Promise<HpEntry | null> {
      return Requests.get("/hp/last-error");
  }

  static getSchedules(): Promise<ScheduleEntry[] | null> {
    return Requests.get('/schedules');
  }

  static getCurrentSchedule(): Promise<CurrentSchedule | null> {
    return Requests.get('/schedules/current');
  }

  static createSchedule(data: Omit<ScheduleEntry, 'enabled'> & { enabled?: boolean }) {
    return Requests.post('/schedules', data);
  }

  static updateSchedule(id: string, data: Omit<ScheduleEntry, 'enabled'> & { enabled?: boolean }) {
    return Requests.put(`/schedules/${encodeURIComponent(id)}`, data);
  }

  static deleteSchedule(id: string) {
    return Requests.delete(`/schedules/${encodeURIComponent(id)}`);
  }
}
