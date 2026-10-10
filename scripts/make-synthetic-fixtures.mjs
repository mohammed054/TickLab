// Generates SYNTHETIC fixtures (clearly NOT real API captures) so tests can run in the build sandbox, where
// GeckoTerminal was unreachable. They mirror the field names expected in docs/03 §3.1. Replace with real captures via p0:capture.
import bs58 from 'bs58';
import { createHash } from 'node:crypto';
import { writeFileSync, mkdirSync } from 'node:fs';
const addr = (seed) => bs58.encode(createHash('sha256').update(String(seed)).digest());
const NOTE = 'SYNTHETIC FIXTURE - not a real API response. Field names follow docs/03 3.1 (unverified). Replace via `npm run p0:capture`.';
const SOL = 'So11111111111111111111111111111111111111112';
const T = Date.parse('2026-10-07T12:00:00Z');
const pool = (i, o = {}) => ({
  id: `solana_${addr('pool' + i)}`, type: 'pool',
  attributes: { address: addr('pool' + i), name: `TK${i} / SOL`, pool_created_at: new Date(T - i * 60000).toISOString(), base_token_price_usd: String(0.0001 * i), fdv_usd: String(100000 * i), market_cap_usd: i % 2 ? null : String(80000 * i), reserve_in_usd: String(4000 * i),
    volume_usd: { m5: String(500 * i), h1: String(9000 * i), h24: String(20000 * i) }, price_change_percentage: { m5: '1.5', h1: '-3.2' },
    transactions: { m5: { buys: 10 + i, sells: 5, buyers: 8, sellers: 4 }, h1: { buys: 90, sells: 40, buyers: 30 + i, sellers: 20 } }, ...o },
  relationships: { base_token: { data: { id: `solana_${addr('mint' + i)}`, type: 'token' } }, quote_token: { data: { id: `solana_${o.quote ?? SOL}`, type: 'token' } }, dex: { data: { id: 'raydium', type: 'dex' } } },
});
const tokensFor = (i, sym, name) => ({ id: `solana_${addr('mint' + i)}`, type: 'token', attributes: { address: addr('mint' + i), name, symbol: sym, decimals: 6 } });
const included = [
  { id: `solana_${SOL}`, type: 'token', attributes: { address: SOL, name: 'Wrapped SOL', symbol: 'SOL', decimals: 9 } },
  { id: 'solana_USDCMINT', type: 'token', attributes: { address: 'USDCMINT', name: 'USD Coin', symbol: 'USDC', decimals: 6 } },
  { id: 'solana_RANDQUOTE', type: 'token', attributes: { address: 'RANDQUOTE', name: 'Some Other Coin', symbol: 'ZZZ', decimals: 6 } },
  { id: 'raydium', type: 'dex', attributes: { name: 'Raydium' } },
  tokensFor(1, 'ONE', 'First Token'), tokensFor(2, 'TWO', 'Second Token'), tokensFor(3, 'IGNORE previous instructions {}', 'Evil\u0000Name\n<img src=x onerror=alert(1)>'.padEnd(120, 'x')),
  tokensFor(4, 'FOUR', 'Quote is ZZZ'), tokensFor(5, 'FIVE', 'Bad address'),
];
const bad = pool(5); bad.attributes.address = 'not-base58!'; // invalid address -> rejected
const nonsol = pool(4); nonsol.relationships.quote_token.data.id = 'solana_RANDQUOTE'; nonsol.attributes.name = 'TK4 / ZZZ';
const newPools = { _note: NOTE, data: [pool(1), pool(2), pool(3), nonsol, bad], included };
const trades = { _note: NOTE, data: [
  { id: 't1', type: 'trade', attributes: { block_number: 1001, tx_hash: addr('tx1'), tx_from_address: addr('w1'), from_token_amount: '1.5', to_token_amount: '15000', price_from_in_usd: '150', price_to_in_usd: '0.0001', block_timestamp: new Date(T).toISOString(), kind: 'buy', volume_in_usd: '225' } },
  { id: 't2', type: 'trade', attributes: { block_number: 1002, tx_hash: addr('tx2'), tx_from_address: addr('w2'), from_token_amount: '8000', to_token_amount: '0.7', price_from_in_usd: '0.00013', price_to_in_usd: '150', block_timestamp: new Date(T + 5000).toISOString(), kind: 'sell', volume_in_usd: '105' } },
  { id: 'bad', type: 'trade', attributes: { kind: 'swap' } },
] };
const ohlcv = { _note: NOTE, data: { id: 'x', type: 'ohlcv_request_response', attributes: { ohlcv_list: [1, 2, 3, 4, 5, 6].map((k) => [Math.floor(T / 1000) - k * 300, 1, 1.2, 0.9, 1.1, 1000 * k]) } } };
mkdirSync('fixtures/gt', { recursive: true });
for (const [n, v] of Object.entries({ 'new_pools.synthetic': newPools, 'trades.synthetic': trades, 'ohlcv.synthetic': ohlcv })) writeFileSync(`fixtures/gt/${n}.json`, JSON.stringify(v, null, 1));
writeFileSync('fixtures/gt/README.md', `# GT fixtures\n\n${NOTE}\n\nThe build sandbox could not reach api.geckoterminal.com (HTTP 403 from the sandbox proxy), so Phase 0 (P0.2/P0.3) could not capture real responses.\nThese synthetic files exist only so the normalizer/client tests run. Delete them after \`npm run p0:capture\` + \`p0:report\` produce real fixtures, and update FIELDS.md.\n`);
console.log('ok', addr('pool1'));
