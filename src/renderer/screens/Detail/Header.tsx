import { Copy, ExternalLink, Pin, PinOff, Star } from 'lucide-react';
import { fmtCompleteness } from '@shared/format';
import type { TokenDetail } from '@shared/types';
import { AddrText } from '../../components/AddrText';
import { Button } from '../../components/Button';
import { GlossaryTerm } from '../../components/GlossaryTerm';
import { Identicon } from '../../components/Identicon';
import { ScoreChip } from '../../components/ScoreChip';
import { toast } from '../../components/Toast';
import { copyText } from '../../components/clipboard';
import { Tooltip } from '../../components/Tooltip';
import { openExternal, toggleWatch } from '../../state/actions';
import { useStore } from '../../state/store';

export interface HeaderProps { detail: TokenDetail; pinned: boolean; onPin: () => void; onPaper: () => void; onAsk: () => void }

/** 56px header: identity on the left, score and actions on the right. */
export function Header({ detail, pinned, onPin, onPaper, onAsk }: HeaderProps) {
  const { token, pool, judgement } = detail;
  const watched = useStore((s) => s.watchOverrides[token.id]) ?? detail.watchlisted;
  return (
    <header style={{ height: 56, flex: 'none', background: 'var(--bg-1)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', padding: '0 16px', gap: 12 }}>
      <Identicon seed={token.mint} size={28} />
      <span style={{ fontSize: 20, lineHeight: '24px', fontWeight: 600 }}>{token.symbol}</span>
      <span className="truncate" style={{ fontSize: 13, color: 'var(--text-2)', minWidth: 0, maxWidth: 220 }}>{token.name}</span>
      <span className="row-flex" style={{ fontSize: 12, gap: 4 }}>
        <AddrText value={token.mint} />
        <Button variant="ghost" iconOnly aria-label="Copy mint address" style={{ height: 20, width: 20 }} icon={<Copy size={12} strokeWidth={1.5} />} onClick={() => { void copyText(token.mint).then((ok) => toast(ok ? 'Copied' : 'Copy failed', ok ? 'info' : 'bad')); }} />
      </span>
      <span className="spacer" />
      <span className="row-flex" style={{ gap: 6, fontSize: 12 }}>
        <GlossaryTerm term="Risk score">Risk</GlossaryTerm>
        <ScoreChip big showBand={false} score={judgement?.score ?? null} band={judgement?.band ?? null} completeness={judgement?.completeness ?? null} />
        <span style={{ fontWeight: 600 }}>{judgement ? `${judgement.band}${judgement.completeness < 0.5 ? '?' : ''}` : ''}</span>
        <span>· <GlossaryTerm term="Completeness">Data</GlossaryTerm> {fmtCompleteness(judgement?.completeness)}</span>
      </span>
      <Tooltip content={pinned ? 'Pinned: window stops following Feed selection' : 'Pin this token'}>
        <Button variant="ghost" iconOnly aria-label={pinned ? 'Unpin' : 'Pin'} aria-pressed={pinned} onClick={onPin} icon={pinned ? <PinOff size={16} strokeWidth={1.5} /> : <Pin size={16} strokeWidth={1.5} />} />
      </Tooltip>
      <Button variant="ghost" iconOnly aria-label={watched ? 'Remove from watchlist' : 'Add to watchlist'} aria-pressed={watched} style={{ color: watched ? 'var(--warn)' : undefined }}
        onClick={() => { void toggleWatch(token.id, watched); }} icon={<Star size={16} strokeWidth={1.5} fill={watched ? 'currentColor' : 'none'} />} />
      <Button variant="ghost" iconOnly aria-label="Open on GeckoTerminal" onClick={() => { void openExternal(`https://www.geckoterminal.com/solana/pools/${encodeURIComponent(pool.address)}`); }} icon={<ExternalLink size={16} strokeWidth={1.5} />} />
      <Button variant="secondary" onClick={onPaper}>Paper decision</Button>
      <Button variant="primary" onClick={onAsk}>Ask AI</Button>
    </header>
  );
}
