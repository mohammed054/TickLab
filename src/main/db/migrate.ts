import type { Db } from './open';
import init001 from './migrations/001_init.sql?raw';

export interface Migration { version: number; name: string; sql: string }
export const MIGRATIONS: Migration[] = [{ version: 1, name: '001_init', sql: init001 }];

export function schemaVersion(db: Db): number {
  const t = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='meta'").get();
  if (!t) return 0;
  const r = db.prepare("SELECT value FROM meta WHERE key='schema_version'").get() as { value: string } | undefined;
  return r ? Number(r.value) : 0;
}

/** Applies pending migrations in order, each inside a transaction. Idempotent. */
export function migrate(db: Db, migrations: Migration[] = MIGRATIONS): number {
  let current = schemaVersion(db);
  for (const m of [...migrations].sort((a, b) => a.version - b.version)) {
    if (m.version <= current) continue;
    db.transaction(() => {
      db.exec(m.sql);
      db.prepare("INSERT INTO meta(key,value) VALUES('schema_version',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(String(m.version));
    })();
    current = m.version;
  }
  return current;
}
