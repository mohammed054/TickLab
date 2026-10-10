import Database from 'better-sqlite3';

export type Db = Database.Database;

/** Opens the app database with the pragmas from docs/02. Use ':memory:' or a temp path in tests. */
export function openDb(path: string): Db {
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('synchronous = NORMAL');
  db.pragma('busy_timeout = 5000');
  return db;
}
