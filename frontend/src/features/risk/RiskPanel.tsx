import { useEffect, useState } from 'react'

interface RiskLimit {
  name: string
  threshold: number
  current: number
  breach: boolean
}

interface RiskPanelProps {
  exposure: number
  maxExposure: number
  dailyPnl: number
  drawdownCurrent: number
  drawdownMax: number
  risk: number
  dailyLoss: number
  maxPosition: number
  openOrdersCount: number
  potentialExecutionRisk: number
  marginUsage: number | null
  liquidationDistance: number | null
  environment: 'RESEARCH' | 'PAPER' | 'LIVE'
}

const EMPTY_STATE = {
  title: 'NO STRATEGY LOADED',
  action: 'CREATE STRATEGY',
}

function formatMargin(v: number | null): string {
  return v != null ? `${v.toFixed(1)}%` : 'N/A (Research)'
}

function formatLiquidation(v: number | null): string {
  return v != null ? `${v.toFixed(2)}%` : 'N/A'
}

export function RiskPanel(props: RiskPanelProps) {
  const {
    exposure, maxExposure, dailyPnl, drawdownCurrent, drawdownMax,
    risk, dailyLoss, maxPosition, openOrdersCount,
    potentialExecutionRisk, marginUsage, liquidationDistance,
    environment,
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

  const limits: RiskLimit[] = [
    { name: 'Exposure', threshold: maxExposure, current: exposure, breach: exposure > maxExposure },
    { name: 'Daily Loss', threshold: Math.abs(dailyPnl) * 1.5, current: Math.abs(dailyLoss), breach: dailyLoss < dailyPnl * 1.2 },
    { name: 'Max Position', threshold: maxPosition, current: exposure, breach: exposure > maxPosition },
  ]

  return (
    <div className="risk-panel">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 12 }}>
        <div>
          <span>Current Exposure</span>
          <span>${exposure.toFixed(4)} BTC</span>
        </div>
        <div>
          <span>Max Exposure</span>
          <span>{maxExposure.toFixed(4)} BTC</span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 12 }}>
        <div>
          <span>Daily P&L</span>
          <span>${sign(dailyPnl)}</span>
        </div>
        <div>
          <span>Max Drawdown</span>
          <span>${sign(drawdownMax)}</span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 12 }}>
        <div>
          <span>Open Orders</span>
          <span>{openOrdersCount}</span>
        </div>
        <div>
          <span>Potential Exec Risk</span>
          <span>${potentialExecutionRisk.toFixed(2)} BTC</span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 12 }}>
        <div>
          <span>Margin Usage</span>
          <span>{formatMargin(marginUsage)}</span>
        </div>
        <div>
          <span>Liquidation Distance</span>
          <span>{formatLiquidation(liquidationDistance)}</span>
        </div>
      </div>

      <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
        <div>
          <span>Current Risk</span>
          <span>{risk.toFixed(1)}</span>
        </div>
        <div>
          <span>Daily Loss</span>
          <span>${sign(dailyLoss)}</span>
        </div>
      </div>

      {environment !== 'RESEARCH' && limits.some(l => l.breach) && (
        <div style={{ border: '2px solid var(--color-negative)', padding: 8, margin: 8 0, background: 'var(--color-negative-light)' }}>
          <span>⚠️ RISK LIMIT BREACH DETECTED</span>
        </div>
      )}
    </div>
  )
}

function sign(v: number): string {
  return v >= 0 ? '+' : '-'
}