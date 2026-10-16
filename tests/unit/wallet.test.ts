// T1.5 read-only wallet validation (wallet import workflow removed).
// validateAddress / looksLikeSecret live in src/main/wallet/address.ts and are
// still used by the settings wallet-address field; wallet sync/import/link are
// gone, so no transaction is ever parsed or submitted from here.
import { describe, it, expect } from 'vitest';
import { looksLikeSecret, validateAddress } from '../../src/main/wallet/address';
import bs58 from 'bs58';

const OWNER = bs58.encode(Buffer.alloc(32, 7));

describe('secret rejection', () => {
  it('rejects seed phrases and 64-byte keys; accepts a real address', () => {
    expect(looksLikeSecret('abandon ability able about above absent absorb abstract absurd abuse access accident')).toBe(true);
    expect(looksLikeSecret(bs58.encode(Buffer.alloc(64, 3)))).toBe(true);
    expect(looksLikeSecret(`[${Array(64).fill(1).join(',')}]`)).toBe(true);
    expect(looksLikeSecret('a'.repeat(64))).toBe(true);
    expect(looksLikeSecret(OWNER)).toBe(false);
    expect(validateAddress(OWNER)).toEqual({ ok: true, address: OWNER });
    expect(validateAddress(bs58.encode(Buffer.alloc(64, 3)))).toMatchObject({ ok: false, message: 'That looks like a secret. Never paste secrets here.' });
    expect(validateAddress('hello')).toMatchObject({ ok: false });
  });
});
