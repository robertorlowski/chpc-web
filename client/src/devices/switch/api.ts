import { Requests } from '../../core/http';
import { RelayMode, SwitchActivation, SwitchRelay, SwitchSchedule } from './types';

// Włącznik: przekaźniki, tryby, harmonogramy i włączenia (/api/switch/*); rootId i deviceId
// dopisuje core/http.ts. Domyślny czas „Włącz na…” idzie przez core/api.ts (/device/properties).
export class SwitchRequests {
  // przy błędzie null (Requests.get nie rzuca)
  static getRelays(): Promise<SwitchRelay[] | null> {
    return Requests.get('/switch/relays');
  }

  static setMode(relay: number, mode: RelayMode, minutes?: number): Promise<SwitchRelay> {
    return Requests.put('/switch/mode', { relay, mode, ...(minutes ? { minutes } : {}) });
  }

  static renameRelay(relay: number, name: string) {
    return Requests.put(`/switch/relays/${relay}`, { name });
  }

  static getSchedules(): Promise<SwitchSchedule[] | null> {
    return Requests.get('/switch/schedules');
  }

  // Requests.post połyka błędy, więc status sprawdzany tutaj (json = false zwraca Response)
  static async createSchedule(schedule: SwitchSchedule) {
    const response = await Requests.post('/switch/schedules', schedule, false) as Response | undefined;
    if (!response?.ok) throw new Error(`HTTP ${response?.status ?? 'błąd sieci'}`);
  }

  static updateSchedule(id: string, schedule: SwitchSchedule) {
    return Requests.put(`/switch/schedules/${id}`, schedule);
  }

  static deleteSchedule(id: string) {
    return Requests.delete(`/switch/schedules/${id}`);
  }

  // włączenia w dniu czasu warszawskiego (YYYY-MM-DD), rosnąco po onAt
  static getActivations(date: string): Promise<SwitchActivation[] | null> {
    return Requests.get(`/switch/activations?date=${date}`);
  }
}
