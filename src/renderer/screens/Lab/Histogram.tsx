/** Return histogram: 40 bins from -100% to +300% (10% each), the last bin is the overflow. */
export function Histogram({ bins }: { bins: number[] }) {
  const W = 800, H = 200, padB = 18, padT = 8;
  const max = Math.max(1, ...bins);
  const bw = W / Math.max(1, bins.length);
  const zeroX = bins.length ? (100 / 400) * W : 0;
  return (
    <svg role="img" aria-label="Histogram of returns" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: 200, display: 'block', background: 'var(--bg-1)', border: '1px solid var(--border)', borderRadius: 4 }}>
      {bins.map((c, i) => {
        const h = (c / max) * (H - padB - padT);
        const loss = i < 10;
        return <rect key={i} x={i * bw + 1} y={H - padB - h} width={Math.max(1, bw - 2)} height={h} fill={loss ? 'var(--bad)' : 'var(--good)'} opacity={0.85}><title>{`${-100 + i * 10}% to ${-90 + i * 10}%: ${c}`}</title></rect>;
      })}
      <line x1={zeroX} x2={zeroX} y1={padT} y2={H - padB} stroke="var(--text-3)" strokeDasharray="3 3" />
      <text x={2} y={H - 4} fill="var(--text-3)" fontSize={10}>-100%</text>
      <text x={zeroX + 2} y={H - 4} fill="var(--text-3)" fontSize={10}>0%</text>
      <text x={W - 2} y={H - 4} fill="var(--text-3)" fontSize={10} textAnchor="end">+300% and above</text>
    </svg>
  );
}
