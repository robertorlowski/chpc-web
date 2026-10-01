import { Requests } from '../../core/http';
import { PelletBoilerReading } from './types';

// Kocioł pelletowy Pellux 200: odczyty ze sterownika (/api/pellet-boiler-pelux200/*);
// rootId i deviceId dopisuje core/http.ts. Ustawienia idą przez core/api.ts (/device/properties).
export class PelletBoilerRequests {
  // ostatni odczyt; serwer zwraca {} przy braku danych, get null przy błędzie
  static getLast(): Promise<PelletBoilerReading | null> {
    return Requests.get('/pellet-boiler-pelux200/last');
  }

  // odczyty z dnia czasu warszawskiego (YYYY-MM-DD), malejąco po createdAt
  static getList(date: string): Promise<PelletBoilerReading[] | null> {
    return Requests.get(`/pellet-boiler-pelux200/list?date=${date}`);
  }
}
