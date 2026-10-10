// Audit helpers over settings_audit (docs/02). Writes happen inside SettingsStore.set.
import type { Db } from '../db/open';

export interface AuditRow { id: number; key: string; oldJson: string | null; newJson: string; changedAt: number; effectiveAt: number }
export function listAudit(db: Db, key?: string, limit = 100): AuditRow[] {
  const rows = (key
    ? db.prepare('SELECT * FROM settings_audit WHERE key=? ORDER BY id DESC LIMIT ?').all(key, limit)
    : db.prepare('SELECT * FROM settings_audit ORDER BY id DESC LIMIT ?').all(limit)) as
    { id: number; key: string; old_json: string | null; new_json: string; changed_at: number; effective_at: number }[];
  return rows.map((r) => ({ id: r.id, key: r.key, oldJson: r.old_json, newJson: r.new_json, changedAt: r.changed_at, effectiveAt: r.effective_at }));
}
