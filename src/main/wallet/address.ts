// Wallet input validation. The app NEVER accepts secrets: seed phrases / private keys are rejected.
import bs58 from 'bs58';

export const SECRET_WARNING = 'That looks like a secret. Never paste secrets here.';

export function looksLikeSecret(input: string): boolean {
  const s = input.trim();
  if (!s) return false;
  const words = s.split(/\s+/);
  if (words.length >= 12 && words.every((w) => /^[a-zA-Z]{2,12}$/.test(w))) return true; // seed phrase (12/24 words)
  if (/^\[\s*\d+(\s*,\s*\d+){31,}\s*\]$/.test(s)) return true; // JSON byte-array keypair
  if (/^(0x)?[0-9a-fA-F]{64,128}$/.test(s)) return true; // hex key
  try {
    const b = bs58.decode(s);
    if (b.length > 32) return true; // 64-byte keypair or longer
  } catch { /* not base58 */ }
  return false;
}

export function validateAddress(input: string): { ok: true; address: string } | { ok: false; message: string } {
  const s = input.trim();
  if (looksLikeSecret(s)) return { ok: false, message: SECRET_WARNING };
  try { if (bs58.decode(s).length === 32) return { ok: true, address: s }; } catch { /* fallthrough */ }
  return { ok: false, message: 'Not a valid Solana address.' };
}
