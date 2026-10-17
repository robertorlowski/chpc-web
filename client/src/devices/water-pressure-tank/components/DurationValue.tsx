// Czas jako liczby z małymi jednostkami w kafelkach KPI i statystyk makiety: „2 h 05 min”, „6 min 17 s”, „35 s”
// (<small> na jednostkach, jak .kpi-value small / .stat-value small).
export const DurationValue: React.FC<{ seconds: number | null | undefined }> = ({ seconds }) => {
  if (seconds === null || seconds === undefined) return <>—</>;
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  if (hours > 0) return <>{hours}<small>h</small> {String(minutes).padStart(2, '0')}<small>min</small></>;
  if (minutes > 0) return <>{minutes}<small>min</small> {String(rest).padStart(2, '0')}<small>s</small></>;
  return <>{rest}<small>s</small></>;
};
