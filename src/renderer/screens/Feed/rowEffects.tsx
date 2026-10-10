import { useEffect, useRef, useState } from 'react';
import type { LaunchRow } from '@shared/types';
import { Chip } from '../../components/Chip';
import { Tooltip } from '../../components/Tooltip';

export const FLASH_MS = 1200;
const FRESH_MS = 15_000;

/** Pure: keys present now that were not known before AND belong to a launch first seen recently. */
export function detectNew(known: ReadonlySet<string>, rows: LaunchRow[], now: number): string[] {
  return rows.filter((r) => !known.has(String(r.tokenId)) && now - r.firstSeenAt <= FRESH_MS).map((r) => String(r.tokenId));
}

/** Keys that should show the 1200 ms new-row flash. The first load never flashes. */
export function useRowFlash(rows: LaunchRow[], ready: boolean): ReadonlySet<string> {
  const known = useRef<Set<string> | null>(null);
  const [flash, setFlash] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    if (!ready) return;
    if (known.current === null) { known.current = new Set(rows.map((r) => String(r.tokenId))); return; }
    const fresh = detectNew(known.current, rows, Date.now());
    for (const r of rows) known.current.add(String(r.tokenId));
    if (fresh.length === 0) return;
    setFlash((p) => new Set([...p, ...fresh]));
    const t = setTimeout(() => setFlash((p) => new Set([...p].filter((k) => !fresh.includes(k)))), FLASH_MS);
    return () => clearTimeout(t);
  }, [rows, ready]);
  return flash;
}

/** Grey chip shown next to Age when the launch was found by a late backfill. */
export function LateBadge() {
  return (
    <Tooltip content="Found late: this launch was discovered after the first two minutes.">
      <Chip color="var(--text-2)" style={{ marginLeft: 4 }}>LATE</Chip>
    </Tooltip>
  );
}
