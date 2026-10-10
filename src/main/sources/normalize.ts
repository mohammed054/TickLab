// docs/03 §3.8 — pure normalization, no I/O.
// FIELD NAMES BELOW FOLLOW docs/03 §3.1 ("expected, VERIFY in Phase 0"). They could not be verified against the live API from the
// build sandbox (network blocked) — see QUESTIONS.md #1 and fixtures/gt/README.md. Re-verify with `npm run p0:report` on the owner's PC.
import type { Result, Snapshot, Trade } from '../../shared/types';
import { ok, err } from '../../shared/types';
import { ALLOWED_QUOTES } from '../../shared/constants';

const B58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
export const isBase58Addr = (s: unknown): s is string => typeof s === 'string' && B58.test(s);

// eslint-disable-next-line no-control-regex -- intentionally strips control characters
const CTRL = new RegExp('[\\u0000-\\u001F\\u007F-\\u009F\\u200B-\\u200F\\u2028-\\u202E\\u2066-\\u2069]', 'g');
export function cleanText(v: unknown, max: number): string {
  const s = typeof v === 'string' ? v : '';
  return s.replace(CTRL, '').replace(/\s+/g, ' ').trim().slice(0, max);
}
export function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}
const int = (v: unknown): number | null => { const n = num(v); return n === null ? null : Math.round(n); };

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const get = (o: unknown, ...path: string[]): unknown => path.reduce<unknown>((a, k) => (isObj(a) ? a[k] : undefined), o);

export interface IncludedMap { tokens: Map<string, Obj>; dexes: Map<string, Obj> }
export function indexIncluded(included: unknown): IncludedMap {
  const m: IncludedMap = { tokens: new Map(), dexes: new Map() };
  if (Array.isArray(included)) for (const i of included) {
    if (!isObj(i) || typeof i.id !== 'string') continue;
    if (i.type === 'token') m.tokens.set(i.id, i); else if (i.type === 'dex') m.dexes.set(i.id, i);
  }
  return m;
}

export interface NormalizedPool {
  token: { mint: string; symbol: string; name: string; decimals: number | null };
  pool: { address: string; quoteMint: string | null; quoteSymbol: string | null; dex: string | null; createdAtChain: number };
  snapshot: Omit<Snapshot, 'poolId' | 'observedAt' | 'source'>;
}
export type NormalizeOutcome = { kind: 'ok'; value: NormalizedPool } | { kind: 'skipped'; reason: 'quote' };

const stripSolana = (id: string): string => id.replace(/^solana_/, '');

export function normalizePool(apiPool: unknown, included: IncludedMap): Result<NormalizeOutcome> {
  if (!isObj(apiPool) || !isObj(apiPool.attributes)) return err('PARSE_FAIL', 'pool has no attributes');
  const a = apiPool.attributes;
  const address = typeof a.address === 'string' ? a.address : '';
  const baseId = get(apiPool, 'relationships', 'base_token', 'data', 'id');
  const quoteId = get(apiPool, 'relationships', 'quote_token', 'data', 'id');
  const dexId = get(apiPool, 'relationships', 'dex', 'data', 'id');
  if (typeof baseId !== 'string') return err('PARSE_FAIL', 'pool has no base token');
  const mint = stripSolana(baseId);
  if (!isBase58Addr(address) || !isBase58Addr(mint)) return err('PARSE_FAIL', 'invalid base58 mint or pool address');
  const created = typeof a.pool_created_at === 'string' ? Date.parse(a.pool_created_at) : NaN;
  if (!Number.isFinite(created)) return err('PARSE_FAIL', 'pool_created_at missing or invalid');

  const baseTok = included.tokens.get(baseId); const quoteTok = typeof quoteId === 'string' ? included.tokens.get(quoteId) : undefined;
  const quoteSymbol = quoteTok ? cleanText(get(quoteTok, 'attributes', 'symbol'), 32).toUpperCase() : '';
  // Pool name is "BASE / QUOTE" - fallback when the included token is missing.
  const nameParts = typeof a.name === 'string' ? a.name.split('/').map((s) => s.trim()) : [];
  const qSym = quoteSymbol || (nameParts[1] ?? '').toUpperCase();
  if (!ALLOWED_QUOTES.includes(qSym)) return ok({ kind: 'skipped', reason: 'quote' });

  const symbol = cleanText(get(baseTok, 'attributes', 'symbol') ?? nameParts[0], 32) || '?';
  const name = cleanText(get(baseTok, 'attributes', 'name') ?? nameParts[0], 64) || symbol;
  const dexName = typeof dexId === 'string' ? cleanText(get(included.dexes.get(dexId), 'attributes', 'name') ?? dexId, 40) : null;
  const t = (w: string, k: string): number | null => int(get(a, 'transactions', w, k));
  return ok({
    kind: 'ok',
    value: {
      token: { mint, symbol, name, decimals: int(get(baseTok, 'attributes', 'decimals')) },
      pool: { address, quoteMint: typeof quoteId === 'string' ? stripSolana(quoteId) : null, quoteSymbol: qSym, dex: dexName || null, createdAtChain: created },
      snapshot: {
        priceUsd: num(a.base_token_price_usd), liquidityUsd: num(a.reserve_in_usd), fdvUsd: num(a.fdv_usd),
        mcapUsd: num(a.market_cap_usd), // null stays null; never substitute FDV
        volM5: num(get(a, 'volume_usd', 'm5')), volH1: num(get(a, 'volume_usd', 'h1')), volH24: num(get(a, 'volume_usd', 'h24')),
        buysM5: t('m5', 'buys'), sellsM5: t('m5', 'sells'), buyersM5: t('m5', 'buyers'), sellersM5: t('m5', 'sellers'),
        buysH1: t('h1', 'buys'), sellsH1: t('h1', 'sells'), buyersH1: t('h1', 'buyers'), sellersH1: t('h1', 'sellers'),
        chgM5: num(get(a, 'price_change_percentage', 'm5')), chgH1: num(get(a, 'price_change_percentage', 'h1')),
      },
    },
  });
}

/** Trade of the BASE token. buy: quote -> base (to_* is base). sell: base -> quote (from_* is base). VERIFY (QUESTIONS.md #1). */
export function normalizeTrade(apiTrade: unknown, poolId: number, observedAt: number): Result<Trade> {
  const a = get(apiTrade, 'attributes');
  if (!isObj(a)) return err('PARSE_FAIL', 'trade has no attributes');
  const side = a.kind === 'buy' || a.kind === 'sell' ? a.kind : null;
  const ts = typeof a.block_timestamp === 'string' ? Date.parse(a.block_timestamp) : NaN;
  const sig = typeof a.tx_hash === 'string' ? a.tx_hash : '';
  const wallet = typeof a.tx_from_address === 'string' ? a.tx_from_address : '';
  if (!side || !Number.isFinite(ts) || !sig || !wallet) return err('PARSE_FAIL', 'trade missing kind/time/hash/wallet');
  return ok({
    poolId, txSig: sig, blockTime: ts, slot: int(a.block_number), side, wallet,
    usdValue: num(a.volume_in_usd), tokenAmount: num(side === 'buy' ? a.to_token_amount : a.from_token_amount),
    priceUsd: num(side === 'buy' ? a.price_to_in_usd : a.price_from_in_usd), observedAt,
  });
}
