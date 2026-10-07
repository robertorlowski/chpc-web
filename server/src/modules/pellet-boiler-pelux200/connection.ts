// Połączenie płytki pieca z kotłem (definicja kotła, od 2026-10-08): ustawienia dla sterownika w odpowiedzi na
// zgłoszenie (device-type.ts) i na odczyt (pellet-boiler-pelux200.service.ts). Firmware od 1.9.0 przełącza się
// bez restartu: rs485 = magistrala (płytka jako moduł ecoNET), econet300 = lokalne API ecoNET300 pod econet_ip.
import { BoilerConfig } from '../../core/types';

export const connectionSettings = (config?: BoilerConfig) => ({
  connection: config?.connection ?? 'rs485',
  econet_ip: config?.econetIp ?? '',
});
