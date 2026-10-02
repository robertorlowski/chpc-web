import type { WeekDay } from '../../core/types';

// Typy włącznika (odpowiedzi /api/switch/*); kontrakt z server/src/modules/switch/types.ts.

// schedule — stan z harmonogramu; on — włączony bez limitu; timer — włączony do until;
// off — wyłączony, harmonogram go nie włączy.
export type RelayMode = 'schedule' | 'on' | 'timer' | 'off';
export type CommandSource = 'app' | 'controller';

// Przekaźnik (GET /switch/relays): stan zgłoszony przez sterownik i tryb z chmury.
export type SwitchRelay = {
  relay: number;
  name: string;
  mode: RelayMode;
  modeSource: CommandSource | null;
  modeChangedAt: string | null;
  /** stan według sterownika */
  on: boolean;
  changedAt: string | null;
  lastSeenAt: string | null;
  /** sterownik zgłosił się w ciągu 30 s */
  online: boolean;
  /** stan, który chmura wysyła sterownikowi */
  desiredOn: boolean;
  /** koniec włączenia: timer albo okno harmonogramu */
  until: string | null;
  /** wpis harmonogramu działający teraz */
  scheduleId: string | null;
  /** najbliższe włączenie z harmonogramu (gdy teraz wyłączony) */
  nextStart: string | null;
};

export type SwitchSchedule = {
  _id?: string;
  relay: number;
  enabled: boolean;
  dayOfWeek?: WeekDay;
  date?: string;
  startTime: string;
  endTime: string;
};

// Jedno włączenie (GET /switch/activations); offAt null = trwa.
export type SwitchActivation = {
  _id: string;
  relay: number;
  onAt: string;
  offAt: string | null;
  source: 'schedule' | CommandSource;
  approximate?: boolean;
  durationS: number;
};
