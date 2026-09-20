import { useEffect, useState } from 'react'

interface BottomBarProps {
  quantity: number
  realizedPnl: number
  unrealizedPnl: number
  fees: number
  netPnl: number
  orderCount: number
  fillCount: number
  latencyMs: number | null
  dataConnected: boolean | null
  engineConnected: boolean | null
  riskConnected: boolean | null
  environment: 'RESEARCH' | 'PAPER' | 'LIVE'
}

const EMPTY_STATE = {
  title: 'NO STRATEGY LOADED',
  action: 'CREATE STRATEGY',
}

export function BottomBar(props: BottomBarProps) {
  const {
    quantity, realizedPnl, unrealizedPnl, fees, netPnl,
    orderCount, fillCount, latencyMs, dataConnected,
    engineConnected, riskConnected, environment,
  } = props

  if (!environment) {
    return (
      <div className="empty-state">
        <div />
        <h3>{EMPTY_STATE.title}</h3>
        <p>{EMPTY_STATE.action}</p>
      </div>
    )
  }

  return (
    <div className="bottom-bar" style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '4px 16px', borderTop: '1px solid var(--color-border-subtle)',
      background: 'var(--color-bg-panel)', color: 'var(--color-text-primary)',
      fontSize: '12px', height: 32,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <span style={{ fontWeight: 600 }}>POSITION {quantity.toLocaleString()} BTC</span>
        <span>REALIZED {sign(realizedPnl)}</span>
        <span>UNREALIZED {sign(unrealizedPnl)}</span>
        {/* FEES formatted as $-xx.xx per spec §7.16 */}
        <span>FEES $-${fees.toFixed(2)}</span>
        <span>NET {sign(netPnl)}</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginLeft: 16 }}>
        <span>ORDERS {orderCount}</span>
        <span>FILLS {fillCount}</span>
        <span>LATENCY {latencyMs != null ? `${latencyMs}ms` : '—'}</span>
        <span>DATA {dataDot(dataConnected)}</span>
        <span>ENGINE {engineDot(engineConnected)}</span>
        <span>RISK {riskDot(riskConnected)}</span>
      </div>
    </div>
  )
}

function sign(v: number): string {
  return v >= 0 ? '+' : '-'
}

function dotState(connected: boolean | null): 'ok' | 'degraded' | 'down' {
  if (connected === true) return 'ok'
  if (connected === false || connected === null) return 'down'
  return 'degraded'
}

function DataDot({ state }: { state: 'ok' | 'degraded' | 'down' }) {
  return (
    <span title={`${state}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <span style={{
        display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
        background: state === 'ok' ? 'var(--color-positive)' : state === 'degraded' ? 'var(--color-warning)' : 'var(--color-negative)'
      }} />
    </span>
  )
}

function StatusDot({ state }: { state: 'ok' | 'degraded' | 'down' }) {
  return (
    <span title={`${state}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <span style={{
        display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
        background: state === 'ok' ? 'var(--color-positive)' : state === 'degraded' ? 'var(--color-warning)' : 'var(--color-negative)'
      }} />
    </span>
  )
}