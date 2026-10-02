import type { DeviceType } from '../../core/types';

// Typy hydroforu: uruchomienia pompy (kolekcja water_pressure_tank) i odczyty
// wodomierza (water_meter). Woda nie jest zapisywana: liczy ją serwis z czasu pracy
// pompy i przepływu z wodomierza.

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
  /**
   * kompresor włączony według ostatniej wiadomości (start bez końca); po „Uruchom ponownie”
   * compressorEnd zostaje z poprzedniego wyłączenia, więc stanu nie da się wyliczyć z dat
   */
  compressorRunning?: boolean;
  /** liczba ręcznych ponownych uruchomień kompresora w czasie tego uruchomienia */
  restarts?: number;
  /** łączny czas ręcznego włączenia kompresora [s]; nie wlicza się do czasu pracy pompy */
  manualSeconds?: number;
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
