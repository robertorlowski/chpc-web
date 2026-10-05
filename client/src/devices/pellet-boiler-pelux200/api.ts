import { Requests } from '../../core/http';
import {
  PelletBoilerAutoPellet, PelletBoilerChange, PelletBoilerCommand, PelletBoilerCurrentSchedule, PelletBoilerCwuLoading, PelletBoilerReading,
  PelletBoilerSchedule, PelletBoilerScheduleSettings, PelletBoilerSeason, PelletBoilerSettings,
} from './types';

// Kocioł pelletowy Pellux 200: odczyty ze sterownika (/api/pellet-boiler-pelux200/*);
// rootId i deviceId dopisuje core/http.ts. Ustawienia idą przez core/api.ts (/device/properties).
export class PelletBoilerRequests {
  // ostatni odczyt; serwer zwraca {} przy braku danych, get null przy błędzie
  static getLast(): Promise<PelletBoilerReading | null> {
    return Requests.get('/pellet-boiler-pelux200/last');
  }

  // niepotwierdzone automatyczne przejście na Pellet (rozpalanie w trybie pompy ciepła) albo null
  static getAutoPellet(): Promise<PelletBoilerAutoPellet | null> {
    return Requests.get('/pellet-boiler-pelux200/auto-pellet');
  }

  // „OK” na komunikacie o automatycznym przejściu
  static acknowledgeAutoPellet() {
    return Requests.post('/pellet-boiler-pelux200/auto-pellet/ack', {}, false);
  }

  // ładowanie CWU w trybie pompy ciepła; null przy błędzie
  static getCwuLoading(): Promise<PelletBoilerCwuLoading | null> {
    return Requests.get('/pellet-boiler-pelux200/cwu-loading');
  }

  // odczyty z dnia czasu warszawskiego (YYYY-MM-DD), malejąco po createdAt
  static getList(date: string): Promise<PelletBoilerReading[] | null> {
    return Requests.get(`/pellet-boiler-pelux200/list?date=${date}`);
  }

  // ustawienia regulatora z ostatniego odczytu sterownika, w grupach (panel „Ustawienia zaawansowane”)
  static getSettings(): Promise<PelletBoilerSettings | null> {
    return Requests.get('/pellet-boiler-pelux200/settings');
  }

  // zlecenie zmian parametrów w podanej kolejności; Response (201 albo 400 z {message})
  static postCommands(changes: PelletBoilerChange[]) {
    return Requests.post('/pellet-boiler-pelux200/commands', { changes }, false);
  }

  // --- harmonogram: sezon (zakres dat) i CWU od–do (okna godzin) ---
  static getScheduleSettings(): Promise<PelletBoilerScheduleSettings | null> {
    return Requests.get('/pellet-boiler-pelux200/schedule-settings');
  }

  // rzuca wyjątek przy błędzie (Requests.put)
  static saveScheduleSettings(settings: PelletBoilerScheduleSettings): Promise<PelletBoilerScheduleSettings> {
    return Requests.put('/pellet-boiler-pelux200/schedule-settings', settings);
  }

  static getCurrentSchedule(): Promise<PelletBoilerCurrentSchedule | null> {
    return Requests.get('/pellet-boiler-pelux200/schedules/current');
  }

  // przycisk Lato / Zima w trybie pompy ciepła: Zima przez cykl Zimy na serwerze; rzuca wyjątek przy błędzie
  static setSeason(season: PelletBoilerSeason): Promise<PelletBoilerCurrentSchedule> {
    return Requests.put('/pellet-boiler-pelux200/season', { season }) as Promise<PelletBoilerCurrentSchedule>;
  }

  static getSchedules(): Promise<PelletBoilerSchedule[] | null> {
    return Requests.get('/pellet-boiler-pelux200/schedules');
  }

  // Requests.post połyka błędy, więc status sprawdzany tutaj (json = false zwraca Response)
  static async createSchedule(schedule: PelletBoilerSchedule) {
    const response = await Requests.post('/pellet-boiler-pelux200/schedules', schedule, false) as Response | undefined;
    if (!response?.ok) throw new Error(`HTTP ${response?.status ?? 'błąd sieci'}`);
  }

  static updateSchedule(id: string, schedule: PelletBoilerSchedule) {
    return Requests.put(`/pellet-boiler-pelux200/schedules/${id}`, schedule);
  }

  static deleteSchedule(id: string) {
    return Requests.delete(`/pellet-boiler-pelux200/schedules/${id}`);
  }

  // ostatnie zlecenia od najnowszego
  static getCommands(): Promise<PelletBoilerCommand[] | null> {
    return Requests.get('/pellet-boiler-pelux200/commands');
  }
}
