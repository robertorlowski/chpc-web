// Pole „Wyłącz powyżej temp.” w sekcji „Ustaw” Ustawień pompy: próg wstrzymania pompy przy gorącym buforze/kotle
// (PUT /hp/boiler-block, properties.boiler_block_temp, domyślnie 50 °C). Pompa stoi, gdy powiązany kocioł się pali albo
// ma co najmniej tyle stopni, i rusza 2 °C niżej (liczy moduł kotła; nowy próg działa od jego zgłoszenia, do minuty).
// Pole jest tylko wtedy, gdy któryś kocioł ma tę pompę w definicji (okno „Dane sterownika” kotła); zapis przyciskiem
// „Zmień” razem z resztą sekcji.
import { useEffect, useState } from 'react';
import { DeviceRequests } from '../../../core/api';
import { InfoTip, TipParagraph } from '../../../core/components/InfoTip';
import { DeviceType } from '../../../core/types';
import { HpRequests } from '../api';

export const BOILER_BLOCK_MIN = 40;
export const BOILER_BLOCK_MAX = 70;
const HYSTERESIS = 2;

/** czy kocioł jest powiązany z pompą i zapisany próg (null do wczytania) */
export function useBoilerBlock(rootId?: string) {
  const [linked, setLinked] = useState(false);
  const [saved, setSaved] = useState<number | null>(null);
  useEffect(() => {
    if (!rootId) return;
    DeviceRequests.getDevices().then((list) => {
      setLinked(!!list?.some((item) => item.deviceType === DeviceType.PELLET_BOILER_PELUX200 && item.boilerConfig?.heatPumpRootId === rootId));
    });
    HpRequests.getCwuLoading().then((status) => setSaved(status?.blockFrom ?? 50));
  }, [rootId]);
  return { linked, saved, setSaved };
}

/** błąd wpisanej wartości albo '' (puste pole = bez zmiany) */
export const boilerBlockProblem = (value: string) => {
  if (!value.trim()) return '';
  const number = Number(value);
  return Number.isInteger(number) && number >= BOILER_BLOCK_MIN && number <= BOILER_BLOCK_MAX
    ? '' : `Wyłącz powyżej: pełne stopnie ${BOILER_BLOCK_MIN}–${BOILER_BLOCK_MAX} °C.`;
};

export const BoilerBlockField: React.FC<{
  saved: number | null; value: string; onChange: (value: string) => void;
}> = ({ saved, value, onChange }) => {
  const shown = value.trim() && !boilerBlockProblem(value) ? Number(value) : saved;
  return (
    <div style={{ minWidth: '200px' }}>
      <span className="label" style={{ width: '160px' }}>
        Wyłącz powyżej temp.:
        <InfoTip>
          <TipParagraph>
            Gorąca woda z bufora/kotła w skraplaczu zatrzymałaby sprężarkę błędem Tho (po 5 błędach blokada sterownika),
            więc pompa ciepła stoi, gdy kocioł się rozpala lub pali albo ma co najmniej tę temperaturę.
          </TipParagraph>
          <TipParagraph>
            Pompa rusza, gdy kocioł spadnie {HYSTERESIS} °C niżej{shown !== null ? ` (poniżej ${shown - HYSTERESIS} °C)` : ''}. Ustaw
            więcej niż temperatura, do której grzeje pompa, inaczej pompa zatrzyma się na wodzie, którą sama nagrzała.
          </TipParagraph>
        </InfoTip>
      </span>
      <input
        className="temperature"
        type="number"
        name="boiler_block_temp"
        min={BOILER_BLOCK_MIN}
        max={BOILER_BLOCK_MAX}
        aria-label="Wyłącz powyżej temperatury"
        aria-invalid={!!boilerBlockProblem(value)}
        placeholder={saved === null ? '' : String(saved)}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
      <span> °C</span>
    </div>
  );
};
