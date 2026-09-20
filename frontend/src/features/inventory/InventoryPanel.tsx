import { useEffect, useState } from 'react'

interface InventoryHistoryPoint {
  timestamp: string
  qty: number
}

interface InventoryPanelProps {
  inventory: { qty: number; value: number; pnl: number } | null
  targetInventory: number | null
  inventoryLimit: number | null
  history: InventoryHistoryPoint[]
  volatility: number
  accumulatedOneSided: boolean
}

const EMPTY_STATE = {
  title: 'NO STRATEGY LOADED',
  action: 'CREATE STRATEGY',
}

export function InventoryPanel(props: InventoryPanelProps) {
  const { inventory, targetInventory, inventoryLimit, history, volatility, accumulatedOneSided } = props

  if (!inventory) {
    return (
      <div className="empty-state">
        <div />
        <h3>{EMPTY_STATE.title}</h3>
        <p>{EMPTY_STATE.action}</p>
      </div>
    )
  }

  return (
    <div className="inventory-panel">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span>INVENTORY</span>
        <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>
          {inventory.qty} BTC
        </span>
      </div>

      <div style={{ marginBottom: 8 }}>
        <span>Target Inventory</span>
        <span>{targetInventory != null ? `${targetInventory.toLocaleString()} BTC` : '—'}</span>
      </div>

      <div style={{ marginBottom: 8 }}>
        <span>Inventory Limit</span>
        <span>{inventoryLimit != null ? `${inventoryLimit.toLocaleString()} BTC` : '—'}</span>
      </div>

      <div style={{ marginBottom: 8 }}>
        <span>Inventory Value</span>
        <span>${inventory.value.toFixed(2)}</span>
      </div>

      <div style={{ marginBottom: 8 }}>
        <span>Inventory P&L</span>
        <span>${sign(inventory.pnl)}</span>
      </div>

      {accumulatedOneSided && (
        <div style={{ borderLeft: '3px solid var(--color-warning)', paddingLeft: 8, margin: '8px 0' }}>
          <span>One-sided accumulation detected — shaded region on history sparkline</span>
        </div>
      )}

      <div style={{ marginTop: 12 }}>
        <span>Volatility</span>
        <span>{volatility.toFixed(2)}%</span>
      </div>

      <div style={{ marginTop: 12 }}>
        <span>History Sparkline</span>
        {/* Sparkline rendered via chart library, data from history prop */}
      </div>
    </div>
  )
}

function sign(v: number): string {
  return v >= 0 ? '+' : '-'
}