import type { WeekDay } from '../../core/types';

// Typy włącznika (switch): przekaźniki (kolekcja switch_relays), ich harmonogramy
// (switch_schedules) i włączenia (switch_activations). Kontrakt ze sterownikiem:
// devices/switch/ (POST /switch/state, PUT /switch/mode).

// HH:mm dla startTime/endTime harmonogramu
export const timePattern = /^([01]\d|2[0-3]):([0-5]\d)$/;

// Tryb przekaźnika: schedule — stan z harmonogramu; on — włączony bez limitu;
// timer — włączony do until; off — wyłączony, harmonogram go nie włączy.
// on, timer i off mają pierwszeństwo przed harmonogramem.
export type RelayMode = 'schedule' | 'on' | 'timer' | 'off';
export const RELAY_MODES: RelayMode[] = ['schedule', 'on', 'timer', 'off'];

// Skąd przyszła zmiana trybu: aplikacja albo strona sterownika.
export type CommandSource = 'app' | 'controller';

// Przyczyna włączenia przekaźnika w historii.
export type ActivationSource = 'schedule' | CommandSource;

// Przekaźnik (kolekcja switch_relays): ustawienie z chmury (mode, until) i stan
// zgłoszony przez sterownik (on, changedAt, lastSeenAt). relay numerowany od 1.
export interface SwitchRelay {
  rootId: string;
  deviceId: string;
  relay: number;
  name: string;
  mode: RelayMode;
  /** koniec trybu timer; po nim przekaźnik wraca do harmonogramu */
  until?: Date | null;
  modeSource?: CommandSource;
  modeChangedAt?: Date;
  /** stan zgłoszony przez sterownik */
  on: boolean;
  /** chwila ostatniej zmiany stanu według sterownika */
  changedAt?: Date;
  /** ostatnie zgłoszenie stanu (POST /switch/state) */
  lastSeenAt?: Date;
}

// Wpis harmonogramu jednego przekaźnika; dni jak w pompie ciepła, bez temperatur.
// Okno przez północ (startTime > endTime) należy do dnia, w którym się zaczyna.
export interface SwitchSchedule {
  _id?: string;
  rootId: string;
  relay: number;
  enabled: boolean;
  dayOfWeek?: WeekDay;
  date?: Date;
  startTime: string;
  endTime: string;
}

// Jedno włączenie przekaźnika (kolekcja switch_activations): od onAt do offAt
// (brak = trwa). approximate: czas wyłączenia oszacowany (np. utrata zasilania sterownika).
export interface SwitchActivation {
  rootId: string;
  deviceId: string;
  relay: number;
  onAt: Date;
  offAt?: Date | null;
  source: ActivationSource;
  approximate?: boolean;
}

// Stan przekaźnika w zgłoszeniu sterownika: włączony i od ilu sekund w tym stanie.
export interface RelayReport {
  on: boolean;
  changedS: number;
}

// Polecenie dla sterownika: włącz (na offAfterS sekund albo bez limitu) albo wyłącz.
// Sterownik odlicza offAfterS sam, więc bez internetu dokończy bieżące włączenie i się wyłączy.
export interface RelayCommand {
  on: boolean;
  offAfterS?: number;
  /** tryb w chmurze, tylko do wyświetlenia na stronie sterownika */
  mode?: RelayMode;
}
