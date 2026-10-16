// Kolory wykresów (Recharts) z tokenów motywu (theme.css): Recharts przyjmuje tylko gotowe wartości, nie var(),
// więc odczytujemy je z obliczonych stylów przy każdym renderze (cc()). Serie: --ch-1…4 (sprawdzone pod kątem
// daltonizmu w makiety/README.md), słońce / woda dla PV i hydroforu, siatka i osie w kolorach linii i tekstu pomocniczego.
export type ChartColors = {
  s1: string; s2: string; s3: string; s4: string; sun: string; water: string; heat: string; accent: string; danger: string; ok: string;
  grid: string; axis: string; line: string; card: string; fg: string; muted: string;
};

export function cc(): ChartColors {
  const style = getComputedStyle(document.documentElement);
  const v = (name: string) => style.getPropertyValue(name).trim();
  return {
    s1: v('--ch-1'), s2: v('--ch-2'), s3: v('--ch-3'), s4: v('--ch-4'), sun: v('--c-sun'), water: v('--c-water'), heat: v('--c-heat'),
    accent: v('--accent'), danger: v('--danger'), ok: v('--ok-fg'),
    grid: v('--line-soft'), axis: v('--fg-3'), line: v('--line'), card: v('--card'), fg: v('--fg'), muted: v('--line-strong'),
  };
}

// styl dymka Recharts w kolorach karty
export const tooltipStyle = () => {
  const c = cc();
  return { contentStyle: { background: c.card, border: `1px solid ${c.line}`, borderRadius: 6, color: c.fg }, labelStyle: { color: c.fg, fontWeight: 600 }, itemStyle: { color: c.fg } };
};
