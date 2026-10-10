// docs/06 §6.5 — PURE swap parser over a jsonParsed getTransaction result.
import { WSOL_MINT } from '../../shared/constants';
import type { RpcTx } from '../sources/solanaRpc';

export interface ParsedSwap { txSig: string; blockTime: number; mint: string; side: 'buy' | 'sell'; tokenAmount: number; solAmount: number; feeSol: number }
interface TokBal { accountIndex: number; mint: string; owner?: string; uiTokenAmount: { amount: string; decimals: number } }
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

function sumRaw(list: unknown, owner: string): Map<string, { raw: bigint; decimals: number }> {
  const m = new Map<string, { raw: bigint; decimals: number }>();
  if (!Array.isArray(list)) return m;
  for (const b of list as TokBal[]) {
    if (!isObj(b) || b.owner !== owner || !isObj(b.uiTokenAmount)) continue;
    let raw: bigint;
    try { raw = BigInt(b.uiTokenAmount.amount); } catch { continue; }
    const cur = m.get(b.mint) ?? { raw: 0n, decimals: b.uiTokenAmount.decimals };
    m.set(b.mint, { raw: cur.raw + raw, decimals: b.uiTokenAmount.decimals });
  }
  return m;
}
const toUi = (raw: bigint, decimals: number): number => Number(raw) / 10 ** decimals;

export function parseSwapFromTx(tx: RpcTx | null, owner: string): ParsedSwap | null {
  if (!tx || !isObj(tx.meta)) return null;
  const meta = tx.meta as Record<string, unknown>;
  if (meta.err !== null && meta.err !== undefined) return null; // failed tx
  const keys = tx.transaction?.message?.accountKeys;
  if (!Array.isArray(keys)) return null;
  const idx = keys.findIndex((k) => k.pubkey === owner);
  const pre = meta.preBalances, post = meta.postBalances;
  if (idx < 0 || !Array.isArray(pre) || !Array.isArray(post)) return null;
  const fee = typeof meta.fee === 'number' ? meta.fee : 0;
  let lamports = BigInt(post[idx] as number) - BigInt(pre[idx] as number);
  if (idx === 0) lamports += BigInt(fee); // fee payer: exclude the network fee from the swap amount
  const preT = sumRaw(meta.preTokenBalances, owner), postT = sumRaw(meta.postTokenBalances, owner);
  const delta = (mint: string): { d: bigint; decimals: number } => {
    const a = preT.get(mint), b = postT.get(mint);
    return { d: (b?.raw ?? 0n) - (a?.raw ?? 0n), decimals: b?.decimals ?? a?.decimals ?? 0 };
  };
  const w = delta(WSOL_MINT);
  const solTotal = toUi(lamports, 9) + toUi(w.d, 9);
  const mints = new Set([...preT.keys(), ...postT.keys()]);
  mints.delete(WSOL_MINT);
  const moved = [...mints].map((m) => ({ mint: m, ...delta(m) })).filter((x) => x.d !== 0n);
  if (moved.length !== 1 || solTotal === 0) return null; // transfers, multi-token txs
  const t = moved[0];
  const tokenDelta = toUi(t.d, t.decimals);
  const base = { txSig: tx.transaction.signatures[0] ?? '', blockTime: (tx.blockTime ?? 0) * 1000, mint: t.mint, feeSol: fee / 1e9 };
  if (tokenDelta > 0 && solTotal < 0) return { ...base, side: 'buy', tokenAmount: tokenDelta, solAmount: -solTotal };
  if (tokenDelta < 0 && solTotal > 0) return { ...base, side: 'sell', tokenAmount: -tokenDelta, solAmount: solTotal };
  return null;
}
