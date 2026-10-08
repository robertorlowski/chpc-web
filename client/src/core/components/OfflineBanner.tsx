// Czerwony pasek „Offline od …” na górze ekranu sterownika (pompa, piec, fotowoltaika, włącznik; hydrofor go nie ma,
// bo ma zasilanie tylko w czasie pracy pompy). since: czas ostatnich danych od sterownika; bez niego samo „Offline”.
// detail: przyczyna w tej samej linii po myślniku („Offline od 4 h – brak łączności ze sterownikiem.”).
import { ReactNode } from 'react';
import { ageLabel } from './DeviceTileCard';

export function OfflineBanner({ since, now = Date.now(), detail }: { since?: string | number | Date; now?: number; detail?: ReactNode }) {
  const at = since === undefined ? NaN : new Date(since).getTime();
  return (
    <div className="offline-banner" role="alert">
      <strong>Offline{Number.isNaN(at) ? '' : ` od ${ageLabel(Math.max(0, now - at))}`}</strong>
      {detail ? <> – {detail}</> : null}
    </div>
  );
}
