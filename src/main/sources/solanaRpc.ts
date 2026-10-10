// docs/03 §3.1B — Solana JSON-RPC client (standard methods only). Credit accounting via sources.rpc.creditCost.
import type { Result } from '../../shared/types';
import { ok, err } from '../../shared/types';
import { postJson, type HttpHooks } from '../net/http';
import { isBase58Addr } from './normalize';

export interface RpcDeps {
  url: () => string; apiKey?: () => string | null; creditCost: () => Record<string, number>;
  onCredits?: (method: string, credits: number) => void; hooks?: HttpHooks; fetchImpl?: typeof fetch; sleep?: (ms: number) => Promise<void>;
}
type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

export interface MintInfo { mintAuthority: string | null; freezeAuthority: string | null; decimals: number | null; supply: number | null }
export interface LargestAccount { address: string; uiAmount: number | null }
export interface AccountInfo { address: string; owner: string | null; lamports: number | null; parsed: Obj | null; exists: boolean }
export interface SigInfo { signature: string; slot: number; blockTime: number | null; err: unknown }
export interface RpcTx { slot: number; blockTime: number | null; meta: Obj | null; transaction: { message: { accountKeys: { pubkey: string; signer?: boolean }[]; instructions: unknown[] }; signatures: string[] } }

export class SolanaRpc {
  private id = 1;
  constructor(private d: RpcDeps) {}

  async call(method: string, params: unknown[]): Promise<Result<unknown>> {
    let url = this.d.url();
    const key = this.d.apiKey?.();
    if (key && !url.includes('api-key=')) url += (url.includes('?') ? '&' : '?') + `api-key=${encodeURIComponent(key)}`;
    const cost = this.d.creditCost();
    this.d.onCredits?.(method, cost[method] ?? cost.default ?? 1);
    const r = await postJson(url, { jsonrpc: '2.0', id: this.id++, method, params }, { ...this.d.hooks, fetchImpl: this.d.fetchImpl, sleep: this.d.sleep, timeoutMs: 15_000 });
    if (!r.ok) return r;
    const j = r.value.json;
    if (!isObj(j)) return err('PARSE_FAIL', 'RPC response is not an object');
    if (isObj(j.error)) return err('RPC_ERROR', String(j.error.message ?? 'RPC error').slice(0, 200));
    if (!('result' in j)) return err('PARSE_FAIL', 'RPC response has no result');
    return ok(j.result);
  }

  /** Mint authorities + decimals + supply from getAccountInfo(jsonParsed). NULL authority = revoked (caller sets authorities_checked_at). */
  async mintInfo(mint: string): Promise<Result<MintInfo>> {
    const r = await this.call('getAccountInfo', [mint, { encoding: 'jsonParsed' }]);
    if (!r.ok) return r;
    const v = isObj(r.value) ? r.value.value : null;
    const parsed = isObj(v) && isObj(v.data) && isObj(v.data.parsed) ? v.data.parsed : null;
    const info = parsed && isObj(parsed.info) ? parsed.info : null;
    if (!info || parsed?.type !== 'mint') return err('PARSE_FAIL', 'account is not a parsed SPL mint');
    const str = (x: unknown): string | null => (typeof x === 'string' && x.length > 0 ? x : null);
    const dec = typeof info.decimals === 'number' ? info.decimals : null;
    const supRaw = typeof info.supply === 'string' ? Number(info.supply) : NaN;
    return ok({ mintAuthority: str(info.mintAuthority), freezeAuthority: str(info.freezeAuthority), decimals: dec, supply: Number.isFinite(supRaw) && dec !== null ? supRaw / 10 ** dec : null });
  }

  async tokenSupply(mint: string): Promise<Result<number>> {
    const r = await this.call('getTokenSupply', [mint]);
    if (!r.ok) return r;
    const v = isObj(r.value) && isObj(r.value.value) ? r.value.value : null;
    const n = v ? Number(v.uiAmountString ?? v.uiAmount) : NaN;
    return Number.isFinite(n) ? ok(n) : err('PARSE_FAIL', 'bad token supply');
  }

  async largestAccounts(mint: string): Promise<Result<LargestAccount[]>> {
    const r = await this.call('getTokenLargestAccounts', [mint]);
    if (!r.ok) return r;
    const arr = isObj(r.value) ? r.value.value : null;
    if (!Array.isArray(arr)) return err('PARSE_FAIL', 'bad largest accounts');
    return ok(arr.filter(isObj).map((a) => ({ address: String(a.address), uiAmount: Number.isFinite(Number(a.uiAmountString ?? a.uiAmount)) ? Number(a.uiAmountString ?? a.uiAmount) : null })).filter((a) => isBase58Addr(a.address)).slice(0, 20));
  }

  async multipleAccounts(addrs: string[]): Promise<Result<AccountInfo[]>> {
    if (addrs.length === 0) return ok([]);
    const r = await this.call('getMultipleAccounts', [addrs.slice(0, 100), { encoding: 'jsonParsed' }]);
    if (!r.ok) return r;
    const arr = isObj(r.value) ? r.value.value : null;
    if (!Array.isArray(arr)) return err('PARSE_FAIL', 'bad multiple accounts');
    return ok(addrs.slice(0, 100).map((address, i) => {
      const a = arr[i];
      if (!isObj(a)) return { address, owner: null, lamports: null, parsed: null, exists: false };
      const parsed = isObj(a.data) && isObj(a.data.parsed) ? a.data.parsed : null;
      return { address, owner: typeof a.owner === 'string' ? a.owner : null, lamports: typeof a.lamports === 'number' ? a.lamports : null, parsed, exists: true };
    }));
  }

  async signatures(address: string, opts: { limit?: number; before?: string; until?: string } = {}): Promise<Result<SigInfo[]>> {
    const r = await this.call('getSignaturesForAddress', [address, { limit: opts.limit ?? 1000, ...(opts.before ? { before: opts.before } : {}), ...(opts.until ? { until: opts.until } : {}) }]);
    if (!r.ok) return r;
    if (!Array.isArray(r.value)) return err('PARSE_FAIL', 'bad signatures');
    return ok(r.value.filter(isObj).map((s) => ({ signature: String(s.signature), slot: Number(s.slot), blockTime: typeof s.blockTime === 'number' ? s.blockTime : null, err: s.err ?? null })));
  }

  async transaction(sig: string): Promise<Result<RpcTx | null>> {
    const r = await this.call('getTransaction', [sig, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }]);
    if (!r.ok) return r;
    if (r.value === null) return ok(null);
    if (!isObj(r.value) || !isObj(r.value.transaction)) return err('PARSE_FAIL', 'bad transaction');
    return ok(r.value as unknown as RpcTx);
  }
}
