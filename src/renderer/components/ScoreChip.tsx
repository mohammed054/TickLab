import { Tooltip } from './Tooltip';

export const LOW_DATA_TEXT = 'Not enough data. A low score here is NOT a safety signal.';
export const bandColor = (band: string | null | undefined): string =>
  band ? `var(--band-${band.toLowerCase()})` : 'var(--band-lowdata)';

export interface ScoreChipProps {
  score: number | null;
  band: string | null;
  completeness: number | null;
  /** Big variant used in the Detail header (56x24, 20px mono). */
  big?: boolean;
  showBand?: boolean;
}

/** Completeness under 50% (or no judgement yet) renders grey with a dashed border and a `?` band. */
export function ScoreChip({ score, band, completeness, big = false, showBand = true }: ScoreChipProps) {
  const lowData = score === null || band === null || completeness === null || completeness < 0.5;
  const color = lowData ? 'var(--band-lowdata)' : bandColor(band);
  const w = big ? 56 : 40;
  const h = big ? 24 : 18;
  const box = (
    <span
      data-testid="score-chip"
      className="mono"
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: w, height: h, borderRadius: 2,
        fontSize: big ? 20 : 11, lineHeight: `${h - 2}px`, fontWeight: big ? 600 : 700, color,
        background: `color-mix(in srgb, ${color} 16%, transparent)`,
        border: lowData ? '1px dashed var(--band-lowdata)' : '1px solid transparent', flex: 'none',
      }}
    >
      {score === null ? '—' : Math.round(score)}
    </span>
  );
  const text = band ? `${band}${lowData ? '?' : ''}` : '';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      {lowData ? <Tooltip content={LOW_DATA_TEXT}>{box}</Tooltip> : box}
      {showBand && text ? <span style={{ fontSize: 11, color, fontWeight: 500 }}>{text}</span> : null}
    </span>
  );
}
