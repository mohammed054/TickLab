import { fmtPct, pctColor } from '@shared/format';

export function Pct({ value }: { value: number | null | undefined }) {
  return <span className={`mono ${pctColor(value)}`}>{fmtPct(value)}</span>;
}
