import { useEffect } from 'react';
import { useInvoke, useIpcEvent, useThrottledCall } from '../../state/hooks';

/** TokenDetail for one token; refreshes on judgement/launch updates that mention it. */
export function useTokenDetail(tokenId: number | null) {
  const q = useInvoke('launches:get', { tokenId: tokenId ?? 1 }, { enabled: tokenId !== null });
  const reload = useThrottledCall(q.reload, 400);
  useIpcEvent('evt:judgement-updated', (p) => { if (p.tokenId === tokenId) reload(); });
  useIpcEvent('evt:launches-updated', (p) => { if (tokenId !== null && p.tokenIds.includes(tokenId)) reload(); });
  useEffect(() => { document.title = q.data && tokenId !== null ? `${q.data.token.symbol} — TickLab Radar` : 'TickLab Radar'; }, [q.data, tokenId]);
  return { ...q, detail: tokenId === null ? null : q.data };
}
