import { Star } from 'lucide-react';
import { fmtAge, fmtCompleteness, fmtPrice, fmtUsd } from '@shared/format';
import type { LaunchRow } from '@shared/types';
import type { Column } from '../../components/Table';
import { Identicon } from '../../components/Identicon';
import { Pct } from '../../components/Pct';
import { ScoreChip } from '../../components/ScoreChip';
import { Tooltip } from '../../components/Tooltip';
import { RULES, ruleCode, ruleName } from '../../rules';
import { LateBadge } from './rowEffects';

export interface FeedColumnOpts { now: number; watched: (r: LaunchRow) => boolean; onToggleWatch: (r: LaunchRow) => void }

export const usdPrice = (v: number | null): string => (v === null ? '—' : `$${fmtPrice(v)}`);

/** Sort accessors for client-side sorting (Watchlist). Keys match the server sort columns. */
export const SORT_ACCESSORS: Record<string, (r: LaunchRow) => number | string | null> = {
  age: (r) => r.createdAtChain, symbol: (r) => r.symbol.toLowerCase(), dex: (r) => r.dex, score: (r) => r.score,
  completeness: (r) => r.completeness, priceUsd: (r) => r.priceUsd, liquidityUsd: (r) => r.liquidityUsd, fdvUsd: (r) => r.fdvUsd,
  volH1: (r) => r.volH1, buysM5: (r) => (r.buysM5 === null || r.sellsM5 === null ? null : r.buysM5 + r.sellsM5), buyersH1: (r) => r.buyersH1, chgM5: (r) => r.chgM5,
};

export function FlagIcons({ ids }: { ids: string[] }) {
  return (
    <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
      {ids.slice(0, 4).map((id) => {
        const meta = RULES[ruleCode(id)];
        if (!meta) return null;
        const Icon = meta.icon;
        return (
          <Tooltip key={id} content={`${ruleName(id)} (+${meta.points} pts)`}>
            <span aria-label={ruleName(id)} style={{ width: 16, height: 16, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--warn)', background: 'color-mix(in srgb, var(--warn) 16%, transparent)', borderRadius: 2 }}>
              <Icon size={12} strokeWidth={1.5} />
            </span>
          </Tooltip>
        );
      })}
    </span>
  );
}

export function buildFeedColumns({ now, watched, onToggleWatch }: FeedColumnOpts): Column<LaunchRow>[] {
  return [
    { id: 'age', header: 'Age', width: 64, align: 'right', sortKey: 'age', render: (r) => <>{r.late ? <LateBadge /> : null}{fmtAge(now - r.createdAtChain)}</> },
    {
      id: 'token', header: 'Token', width: 180, sortKey: 'symbol',
      render: (r) => (
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <Identicon seed={r.mint} />
          <span style={{ fontWeight: 600, fontSize: 12 }}>{r.symbol}</span>
          <span className="truncate" style={{ fontSize: 11, color: 'var(--text-2)' }}>{r.name}</span>
        </span>
      ),
    },
    { id: 'dex', header: 'DEX', width: 88, sortKey: 'dex', render: (r) => r.dex ?? '—' },
    { id: 'risk', header: 'Risk', width: 96, sortKey: 'score', render: (r) => <ScoreChip score={r.score} band={r.band} completeness={r.completeness} /> },
    { id: 'data', header: 'Data', width: 56, align: 'right', sortKey: 'completeness', render: (r) => fmtCompleteness(r.completeness) },
    { id: 'price', header: 'Price', width: 96, align: 'right', sortKey: 'priceUsd', render: (r) => usdPrice(r.priceUsd) },
    { id: 'liq', header: 'Liq', width: 88, align: 'right', sortKey: 'liquidityUsd', render: (r) => fmtUsd(r.liquidityUsd) },
    { id: 'fdv', header: 'FDV', width: 88, align: 'right', sortKey: 'fdvUsd', render: (r) => fmtUsd(r.fdvUsd) },
    { id: 'vol', header: 'Vol 1h', width: 88, align: 'right', sortKey: 'volH1', render: (r) => fmtUsd(r.volH1) },
    { id: 'bs', header: 'B/S 5m', width: 84, align: 'right', sortKey: 'buysM5', render: (r) => (r.buysM5 === null || r.sellsM5 === null ? '—' : `${r.buysM5}/${r.sellsM5}`) },
    { id: 'buyers', header: 'Buyers 1h', width: 64, align: 'right', sortKey: 'buyersH1', render: (r) => (r.buyersH1 === null ? '—' : String(r.buyersH1)) },
    { id: 'chg', header: 'Δ5m', width: 64, align: 'right', sortKey: 'chgM5', render: (r) => <Pct value={r.chgM5} /> },
    { id: 'flags', header: 'Flags', width: 160, flex: true, render: (r) => <FlagIcons ids={r.hitRuleIds} /> },
    {
      id: 'star', header: '★', width: 32, align: 'center',
      render: (r) => (
        <button type="button" aria-label={watched(r) ? 'Remove from watchlist' : 'Add to watchlist'} aria-pressed={watched(r)} onClick={(e) => { e.stopPropagation(); onToggleWatch(r); }}
          style={{ background: 'none', border: 0, padding: 0, display: 'inline-flex', color: watched(r) ? 'var(--warn)' : 'var(--text-3)' }}>
          <Star size={14} strokeWidth={1.5} fill={watched(r) ? 'currentColor' : 'none'} />
        </button>
      ),
    },
  ];
}
