function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** 14px deterministic 5x5 mirrored pattern drawn locally from the mint. Never fetches an image. */
export function Identicon({ seed, size = 14 }: { seed: string; size?: number }) {
  const h = hash(seed);
  const hue = h % 360;
  const cells: JSX.Element[] = [];
  let bits = h ^ Math.imul(h, 2654435761);
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 3; x++) {
      const on = (bits & 1) === 1;
      bits = (bits >>> 1) | ((bits & 1) << 30);
      if (!on) continue;
      cells.push(<rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} />);
      if (x < 2) cells.push(<rect key={`${4 - x}-${y}`} x={4 - x} y={y} width={1} height={1} />);
    }
  }
  return (
    <svg width={size} height={size} viewBox="0 0 5 5" aria-hidden="true" style={{ flex: 'none', borderRadius: 2, background: `hsl(${hue} 30% 14%)` }} fill={`hsl(${hue} 65% 62%)`}>
      {cells}
    </svg>
  );
}
