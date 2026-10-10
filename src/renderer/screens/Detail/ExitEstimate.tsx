import { useState } from 'react';
import { fmtPct, fmtUsd } from '@shared/format';
import { GlossaryTerm } from '../../components/GlossaryTerm';
import { Input } from '../../components/Input';
import { useDebounced, useInvoke } from '../../state/hooks';

export function ExitEstimate({ tokenId }: { tokenId: number }) {
  const def = useInvoke('settings:get', { keys: ['judge.defaultPositionUsd'] }).data?.['judge.defaultPositionUsd'];
  const [text, setText] = useState<string | null>(null);
  const size = text ?? (typeof def === 'number' ? String(def) : '10');
  const n = Number(size);
  const valid = Number.isFinite(n) && n > 0;
  const dSize = useDebounced(valid ? n : 10, 300);
  const est = useInvoke('detail:exitEstimate', { tokenId, sizeUsd: dSize }, { enabled: valid });
  return (
    <section className="panel" style={{ padding: 12 }}>
      <h3 className="section-title" style={{ marginBottom: 8 }}>Exit estimate</h3>
      <label className="field-label" htmlFor="exit-size">Position size (USD)</label>
      <Input id="exit-size" numeric type="number" min={0} value={size} style={{ width: 120 }} onChange={(e) => setText(e.target.value)} />
      <div style={{ marginTop: 12, fontSize: 13, lineHeight: '20px' }}>
        <div>Estimated <GlossaryTerm term="Price impact">price impact</GlossaryTerm>{' '}
          <span className="mono" style={{ fontWeight: 600 }}>{valid ? fmtPct(est.data?.impactPct, false) : '—'}</span></div>
        <div>You would receive ≈ <span className="mono" style={{ fontWeight: 600 }}>{valid && est.data?.receivedUsd != null ? fmtUsd(est.data.receivedUsd) : '—'}</span> (estimate)</div>
      </div>
      <div className="meta" style={{ marginTop: 8 }}>Approximation from pool liquidity. Real fills differ.</div>
    </section>
  );
}
