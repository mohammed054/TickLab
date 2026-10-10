import type { ReactNode } from 'react';

export interface StatCardProps { label: ReactNode; value: ReactNode; sub?: ReactNode; width?: number | string; valueClass?: string }

/** 120x64 card: label 11px text-3, value 16/600 mono, optional sub-line. */
export function StatCard({ label, value, sub, width = 120, valueClass }: StatCardProps) {
  return (
    <div className="stat-card" style={{ width, height: 64, padding: 8 }}>
      <div className="meta truncate">{label}</div>
      <div className={`v ${valueClass ?? ''}`} style={{ fontSize: 16, fontWeight: 600 }}>{value}</div>
      {sub ? <div className="s truncate">{sub}</div> : null}
    </div>
  );
}
