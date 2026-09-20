import { useEffect, useState } from 'react'

interface InventoryItem {
  qty: number
  value: number
  pnl: number
  history: number[]
  volatility: number
}

interface StrategyMonitorProps {
  strategyName: string | null
  status: 'RUNNING' | 'PAUSED' | 'STOPPED' | 'ERROR'
  inventory: InventoryItem | null
  realizedPnl: number
  unrealizedPnl: number
  fees: number
  netPnl: number
  orderCount: number
  fillCount: number
  cancelledCount: number
  fillRate: number
  latencyMs: number | null
}

const EMPTY_STATE = {
  title: 'NO STRATEGY LOADED',
  action: 'CREATE STRATEGY',
}

export function StrategyMonitorPanel(props: StrategyMonitorProps) {
  const { strategyName, status, inventory, realizedPnl, unrealizedPnl, fees, netPnl, orderCount, fillCount, cancelledCount, fillRate, latencyMs } = props

  if (!strategyName) {
    return (
      <div className="empty-state">
        <div />
        <h3>{EMPTY_STATE.title}</h3>
        <p>{EMPTY_STATE.action}</p>
      </div>
    )
  }

  const statusLabels: Record<'RUNNING' | 'PAUSED' | 'STOPPED' | 'ERROR', string> = {
    RUNNING: 'Running',
    PAUSED: 'Paused',
    STOPPED: 'Stopped',
    ERROR: 'Error',
  }

  return (
    <div className="strategy-monitor-panel">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>{strategyName}</span>
        <span style={{ display: 'inline-flex', width: 8, height: 8, borderRadius: '50' }} />
        <span>{statusLabels[status]}</span>
      </div>

      <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
        <div>
          <span>Inventory</span>
          <span>{inventory?.qty?.toLocaleString() ?? '—'} BTC</span>
        </div>
        <div>
          <span>Inventory Value</span>
          <span>${inventory?.value?.toFixed(2) ?? '—'}</span>
        </div>
      </div>

      <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
        <div>
          <span>Realized P&L</span>
          <span>${sign(inventory?.pnl ?? realizedPnl)}</span>
        </div>
        <div>
          <span>Unrealized P&L</span>
          <span>${sign(unrealizedPnl)}</span>
        </div>
      </div>

      <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between' }}>
        <span>Fees</span>
        <span>-${fees.toFixed(2)}</span>
      </div>

      <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between' }}>
        <span>NET P&L</span>
        <span>${sign(netPnl)}</span>
      </div>

      <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
        <span>Orders</span>
        <span>{orderCount}</span>
        <span>Fills</span>
        <span>{fillCount}</span>
      </div>

      <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
        <span>Cancelled</span>
        <span>{cancelledCount}</span>
        <span>Fill Rate</span>
        <span>{fillRate.toFixed(1)}%</span>
      </div>

      <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
        <span>Latency</span>
        <span>{latencyMs != null ? `${latencyMs}ms` : '—'}</span>
      </div>
    </div>
  )
}

function sign(v: number): string {
  return v >= 0 ? '+' : ''
}