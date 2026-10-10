// Secrets live ONLY in userData/secrets.bin, encrypted with Electron safeStorage (DPAPI on Windows). Never in SQLite.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

export interface SecretCrypto {
  available(): boolean;
  encrypt(plain: string): Buffer;
  decrypt(buf: Buffer): string;
}
export type SecretName = 'rpcKey' | 'openrouterKey';
export interface SecretStore {
  set(name: SecretName, value: string): void;
  get(name: SecretName): string | null;
  has(name: SecretName): boolean;
  clear(name: SecretName): void;
}

/** In-memory store, used in tests and as a fallback when OS encryption is unavailable (never persisted). */
export function createMemorySecretStore(): SecretStore {
  const m = new Map<string, string>();
  return { set: (n, v) => void m.set(n, v), get: (n) => m.get(n) ?? null, has: (n) => m.has(n), clear: (n) => void m.delete(n) };
}

export function createFileSecretStore(path: string, crypto: SecretCrypto): SecretStore {
  const load = (): Record<string, string> => {
    if (!existsSync(path)) return {};
    try { return JSON.parse(readFileSync(path, 'utf8')) as Record<string, string>; } catch { return {}; }
  };
  const save = (o: Record<string, string>): void => writeFileSync(path, JSON.stringify(o), { mode: 0o600 });
  return {
    set(name, value) {
      if (!crypto.available()) throw new Error('OS encryption is not available; refusing to store a secret in plain text.');
      const o = load(); o[name] = crypto.encrypt(value).toString('base64'); save(o);
    },
    get(name) {
      const v = load()[name];
      if (!v || !crypto.available()) return null;
      try { return crypto.decrypt(Buffer.from(v, 'base64')); } catch { return null; }
    },
    has: (name) => Boolean(load()[name]),
    clear(name) { const o = load(); delete o[name]; save(o); },
  };
}
