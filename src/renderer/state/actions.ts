import { toast } from '../components/Toast';
import { invoke } from './hooks';
import { useStore } from './store';

export async function toggleWatch(tokenId: number, current: boolean): Promise<void> {
  const st = useStore.getState();
  st.setWatchOverride(tokenId, !current);
  const r = await invoke(current ? 'watchlist:remove' : 'watchlist:add', { tokenId });
  if (!r.ok) {
    st.setWatchOverride(tokenId, current);
    toast(r.error.message, 'bad');
  }
}

export function openInDetail(tokenId: number): void {
  useStore.getState().select(tokenId);
  void invoke('detail:select', { tokenId });
  void invoke('detail:focus', {});
}

export async function openExternal(url: string): Promise<void> {
  const r = await invoke('app:openExternal', { url });
  if (!r.ok) toast(r.error.message, 'bad');
}

export async function openPoolPage(tokenId: number): Promise<void> {
  const r = await invoke('launches:get', { tokenId });
  if (!r.ok) { toast(r.error.message, 'bad'); return; }
  await openExternal(`https://www.geckoterminal.com/solana/pools/${encodeURIComponent(r.value.pool.address)}`);
}

export const solscanTxUrl = (sig: string): string => `https://solscan.io/tx/${encodeURIComponent(sig)}`;
