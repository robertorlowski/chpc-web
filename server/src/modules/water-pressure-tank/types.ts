import type { DeviceType } from '../../core/types';

// Typy hydroforu: zbiorniki w ustawieniach urządzenia, uruchomienia pompy
// (kolekcja water_pressure_tank) i odczyty wodomierza (water_meter).

// Zbiornik hydroforu: 'air' — poduszka powietrzna (k koryguje nieznaną ilość powietrza),
// 'membrane' — przeponowy (ilość powietrza wyznacza ciśnienie wstępne precharge).
export type WaterTankKind = 'air' | 'membrane';

export interface WaterTank {
  name?: string;
  kind: WaterTankKind;
  volumeLiters: number;
  enabled: boolean;
  /** ciśnienie wstępne zbiornika przeponowego [bar na manometrze] */
  precharge?: number;
  /** współczynnik korekty zbiornika z poduszką powietrzną */
  k?: number;
}

// Jedno uruchomienie pompy hydroforu (kolekcja water_pressure_tank).
export interface WaterPressureTankRun {
  rootId: string;
  deviceType?: DeviceType;
  deviceId?: string;
  runId: number;
  pumpStart: Date;
  pumpEnd: Date;
  compressorStart?: Date;
  compressorEnd?: Date;
  /** liczba ręcznych ponownych uruchomień kompresora w czasie tego uruchomienia */
  restarts?: number;
  /** szacunek wody z włączonych zbiorników w chwili utworzenia rekordu */
  waterLiters: number;
  /** część z zbiorników z poduszką przy k = 1 (do podpowiedzi k) */
  waterAirBaseLiters: number;
  /** część z zbiorników przeponowych */
  waterMembraneLiters: number;
  /** daty z czasu przyjęcia (uruchomienie wysłane z kolejki sterownika) */
  timeApproximate: boolean;
  /** chwila ostatniej wiadomości; na jej podstawie „w toku” (RUN_IN_PROGRESS_MS) */
  lastSeenAt: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

// Ręczny odczyt wodomierza (kolekcja water_meter).
export interface WaterMeterReading {
  rootId: string;
  readAt: Date;
  valueM3: number;
  note?: string;
}
