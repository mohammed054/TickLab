import { lazy, Suspense, useEffect, useState } from 'react'
import type { OnMount } from '@monaco-editor/react'
import { mockRuntime } from '../../mock/runtime/runtime'
import { createDefaultBacktestRequest, mockWorkbench } from '../../mock/workbench'
import { useWorkspace } from '../../state/useWorkspace'
import { MetricRow, Panel, StatusDot } from '../shared/Panel'

const TEMPLATES = [
  ['market_making', 'Avellaneda-Stoikov (MM)', 'Optimal half-spread quoting with inventory penalty parameterization.'],
  ['order_book_imbalance', 'OFI Depth Imbalance (Alpha)', 'Microstructure alpha predicting short-term mid-price drift from order book queue imbalance.'],
  ['momentum', 'CVD Order Flow Momentum', 'Aggressive taker volume flow and Cumulative Volume Delta momentum breakout engine.'],
  ['mean_reversion', 'Microstructure Mean Reversion', 'High-frequency statistical reversion to Volume-Weighted Average Price (VWAP).'],
  ['statistical_arbitrage', 'Cross-Venue Latency Arb', 'Sub-millisecond triangular and cross-exchange basis arbitrage with atomic legs.'],
  ['execution', 'TWAP / VWAP Volume Router', 'Dynamic volume-slicing smart order execution minimizing market impact and adverse selection.'],
  ['custom', 'Custom Alpha Architecture', 'Clean boilerplate for custom HFTBacktest strategy with on_depth, on_trade, and order router.'],
] as const

const STRATEGY_CODES: Record<string, string> = {
  market_making: `"""
High-Frequency Market Making Strategy
Avellaneda-Stoikov Inventory Skew Model with Volatility-Adaptive Spreads
"""
from hftbacktest import Strategy, OrderBook, Side, OrderType, TimeInForce

class AvellanedaStoikovMM(Strategy):
    def __init__(
        self,
        gamma: float = 0.1,         # Inventory risk aversion
        sigma: float = 0.002,       # Instantaneous volatility estimate
        tick_size: float = 0.1,     # Minimum price increment
        order_size: float = 0.01,   # Quoting clip size (BTC)
        inventory_limit: float = 2.0, # Hard position threshold
        requote_interval_ms: int = 50
    ):
        super().__init__()
        self.gamma = gamma
        self.sigma = sigma
        self.tick_size = tick_size
        self.order_size = order_size
        self.inventory_limit = inventory_limit
        self.requote_interval_ms = requote_interval_ms
        self.active_bid_id = None
        self.active_ask_id = None

    def on_depth_update(self, book: OrderBook):
        mid = book.mid_price()
        if mid <= 0:
            return
            
        # Inventory normalization ratio q in [-1.0, 1.0]
        q = self.inventory / self.inventory_limit
        
        # Reservation price (indifference price)
        # r(s, q, t) = s - q * gamma * sigma^2
        reservation_price = mid - (q * self.gamma * (self.sigma ** 2))
        
        # Optimal half-spread: delta_a + delta_b = gamma * sigma^2 + (2 / gamma) * ln(1 + gamma / kappa)
        half_spread = max(self.tick_size * 2, self.spread_ticks * self.tick_size)
        
        optimal_bid = round((reservation_price - half_spread) / self.tick_size) * self.tick_size
        optimal_ask = round((reservation_price + half_spread) / self.tick_size) * self.tick_size
        
        # Quote management with post-only execution
        if self.inventory < self.inventory_limit:
            self.submit_or_replace_bid(price=optimal_bid, size=self.order_size)
        else:
            self.cancel_bids()
            
        if self.inventory > -self.inventory_limit:
            self.submit_or_replace_ask(price=optimal_ask, size=self.order_size)
        else:
            self.cancel_asks()

    def on_trade(self, trade):
        self.update_inventory(trade)
`,
  order_book_imbalance: `"""
Order Flow Imbalance (OFI) Alpha Strategy
Multi-Level Queue Dynamics & Mid-Price Drift Predictor
"""
from hftbacktest import Strategy, OrderBook, Side

class OrderFlowImbalanceAlpha(Strategy):
    def __init__(self, ofi_threshold=0.65, lookback_ticks=50, clip_size=0.02):
        super().__init__()
        self.ofi_threshold = ofi_threshold
        self.lookback_ticks = lookback_ticks
        self.clip_size = clip_size
        self.prev_bid_p = 0
        self.prev_bid_v = 0
        self.prev_ask_p = 0
        self.prev_ask_v = 0

    def on_depth_update(self, book: OrderBook):
        bid_p, bid_v = book.best_bid()
        ask_p, ask_v = book.best_ask()
        
        # Calculate level-1 OFI step delta
        delta_bid = bid_v if bid_p > self.prev_bid_p else (bid_v - self.prev_bid_v if bid_p == self.prev_bid_p else 0)
        delta_ask = -ask_v if ask_p < self.prev_ask_p else (ask_v - self.prev_ask_v if ask_p == self.prev_ask_p else 0)
        
        ofi = delta_bid - delta_ask
        total_depth = bid_v + ask_v
        imbalance = ofi / max(1.0, total_depth)
        
        # Signal Generation
        if imbalance > self.ofi_threshold and self.inventory < 1.0:
            self.buy_market(self.clip_size)
        elif imbalance < -self.ofi_threshold and self.inventory > -1.0:
            self.sell_market(self.clip_size)
            
        self.prev_bid_p, self.prev_bid_v = bid_p, bid_v
        self.prev_ask_p, self.prev_ask_v = ask_p, ask_v
`,
  momentum: `"""
CVD Order Flow Momentum Strategy
Aggressive Volume Delta Acceleration Engine
"""
from hftbacktest import Strategy, Side

class CVDMomentumAlpha(Strategy):
    def __init__(self, delta_window=100, zscore_threshold=2.0):
        super().__init__()
        self.delta_window = delta_window
        self.zscore_threshold = zscore_threshold
        self.cum_delta = 0.0
        self.trade_history = []

    def on_trade(self, trade):
        # Buy trade = positive delta, Sell trade = negative delta
        delta = trade.qty if trade.side == Side.BUY else -trade.qty
        self.cum_delta += delta
        self.trade_history.append(delta)
        
        if len(self.trade_history) > self.delta_window:
            self.trade_history.pop(0)
            mean = sum(self.trade_history) / len(self.trade_history)
            variance = sum((x - mean) ** 2 for x in self.trade_history) / len(self.trade_history)
            std = max(1e-5, variance ** 0.5)
            zscore = (delta - mean) / std
            
            if zscore > self.zscore_threshold:
                self.submit_order(Side.BUY, 0.01)
            elif zscore < -self.zscore_threshold:
                self.submit_order(Side.SELL, 0.01)
`,
  mean_reversion: `"""
Microstructure Mean Reversion Strategy
High-Frequency Statistical VWAP Deviation Slicer
"""
from hftbacktest import Strategy, OrderBook

class MicroMeanReversion(Strategy):
    def __init__(self, vwap_window=500, entry_deviation_bps=5.0):
        super().__init__()
        self.vwap_window = vwap_window
        self.entry_deviation = entry_deviation_bps / 10000.0

    def on_depth_update(self, book: OrderBook):
        mid = book.mid_price()
        vwap = book.calculate_vwap(levels=10)
        
        deviation = (mid - vwap) / vwap
        if deviation < -self.entry_deviation:
            self.quote_bid(book.best_bid()[0], 0.01)
        elif deviation > self.entry_deviation:
            self.quote_ask(book.best_ask()[0], 0.01)
`,
  statistical_arbitrage: `"""
Cross-Venue Latency & Basis Arbitrage
Sub-millisecond Spot-Perp atomic convergence
"""
from hftbacktest import Strategy

class CrossVenueStatArb(Strategy):
    def __init__(self, min_spread_bps=3.5):
        super().__init__()
        self.min_spread = min_spread_bps / 10000.0

    def on_venue_tick(self, lead_venue_mid, lag_venue_mid):
        spread = (lead_venue_mid - lag_venue_mid) / lead_venue_mid
        if spread > self.min_spread:
            self.execute_atomic_pair(buy_venue="lag", sell_venue="lead")
`,
  execution: `"""
TWAP / VWAP Smart Order Router
Market impact minimization algorithm with liquidity participation
"""
from hftbacktest import Strategy

class SmartOrderRouter(Strategy):
    def __init__(self, target_volume=10.0, duration_minutes=30):
        super().__init__()
        self.target_volume = target_volume
        self.duration = duration_minutes
        self.executed = 0.0

    def on_time_slice(self):
        slice_target = (self.target_volume - self.executed) / max(1, self.duration)
        self.submit_passive_slice(slice_target)
`,
  custom: `"""
Custom Quantitative Strategy Scaffold
Full HFTBacktest Rust Core Integration
"""
from hftbacktest import Strategy, OrderBook, Side

class CustomAlpha(Strategy):
    def __init__(self):
        super().__init__()
        self.name = "CUSTOM_ALPHA_V1"

    def on_depth_update(self, book: OrderBook):
        # Implement proprietary alpha logic here
        pass

    def on_trade(self, trade):
        # Update custom trade signals
        pass
`,
}

const MonacoEditor = lazy(() => import('../../shared/monaco').then(({ Editor }) => ({ default: Editor })))

type EditorStatus = 'DRAFT' | 'TESTING' | 'BACKTESTED' | 'VALIDATED' | 'PAPER' | 'RUNNING' | 'PAUSED' | 'STOPPED' | 'ERROR'

const editorOptions = {
  automaticLayout: true,
  minimap: { enabled: false },
  fontSize: 12,
  lineHeight: 18,
  fontFamily: 'var(--font-mono)',
  padding: { top: 10, bottom: 10 },
  scrollBeyondLastLine: false,
  renderLineHighlight: 'line' as const,
  tabSize: 4,
}

export function StrategyPanel() {
  const [template, setTemplate] = useState<(typeof TEMPLATES)[number][0]>('market_making')
  const [strategyName, setStrategyName] = useState('MM_V18 (Avellaneda-Stoikov)')
  const [strategyVersion, setStrategyVersion] = useState('v18.4.2')
  const [code, setCode] = useState(() => STRATEGY_CODES['market_making'])
  const [status, setStatus] = useState<EditorStatus>('VALIDATED')
  const [environment, setEnvironment] = useState<'RESEARCH' | 'PAPER'>('RESEARCH')
  const [diagnostics, setDiagnostics] = useState<string[]>(['Python AST validated', 'Strategy entry points verified', 'Parameter schema aligned with Rust core'])
  const [newStrategyModalOpen, setNewStrategyModalOpen] = useState(false)
  const [, updateWorkspace] = useWorkspace()

  const handleEditorMount: OnMount = (editor) => {
    editor.focus()
  }

  const selectTemplate = (id: (typeof TEMPLATES)[number][0]) => {
    setTemplate(id)
    setCode(STRATEGY_CODES[id] || STRATEGY_CODES['custom'])
    setStatus('DRAFT')
    setDiagnostics([`Template '${id}' loaded`, 'Verify parameters before simulation'])
  }

  useEffect(() => {
    if (status !== 'TESTING') return
    const timer = window.setTimeout(() => {
      setStatus('VALIDATED')
      setDiagnostics(['Python syntax valid', 'Required hooks (on_depth, on_trade) verified', 'Memory safety verified', 'Ready for simulation'])
    }, 300)
    return () => window.clearTimeout(timer)
  }, [status])

  const validate = () => {
    setDiagnostics([])
    if (status === 'BACKTESTED' || status === 'DRAFT') {
      setStatus('VALIDATED')
      setDiagnostics(['Verification completed', 'Strategy AST is clean and eligible for backtesting'])
      return
    }
    setStatus('TESTING')
  }

  const run = () => {
    setStatus('RUNNING')
    setEnvironment('RESEARCH')
    mockRuntime.setStrategyStatus('RUNNING')
    mockRuntime.setEnvironment('RESEARCH')
    updateWorkspace({ strategy: { id: strategyName, version: strategyVersion, codeHash: `strategy:${template}` }, activeStrategy: strategyName })
  }

  const deployToBacktest = () => {
    const request = createDefaultBacktestRequest()
    const jobId = mockWorkbench.startBacktest({
      ...request,
      strategyRef: { id: strategyName, version: strategyVersion, codeHash: `strategy:${template}` },
    })
    const job = mockWorkbench.getSnapshot().jobs.find((candidate) => candidate.id === jobId)
    if (job) {
      updateWorkspace({
        experiment: { id: job.experimentId },
        strategy: { id: strategyName, version: strategyVersion, codeHash: `strategy:${template}` },
        activeTab: { secondaryMonitor: 'backtest' },
      })
    }
  }

  const exportStrategyCode = () => {
    const blob = new Blob([code], { type: 'text/x-python' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${strategyName.replace(/\s+/g, '_').toLowerCase()}.py`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, height: '100%' }}>
      {/* Strategy Header */}
      <Panel
        title="ALPHA STRATEGY DEFINITION & CATALOG"
        style={{ flex: '0 0 auto' }}
        right={
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type="button"
              onClick={() => setNewStrategyModalOpen(true)}
              style={{
                background: 'var(--color-brand-primary)',
                color: '#080a0d',
                border: 'none',
                borderRadius: 3,
                padding: '2px 8px',
                fontSize: 10,
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              + NEW STRATEGY
            </button>
            <button
              type="button"
              onClick={exportStrategyCode}
              style={{
                background: 'var(--bg-2)',
                color: 'var(--text-1)',
                border: '1px solid var(--border-1)',
                borderRadius: 3,
                padding: '2px 8px',
                fontSize: 10,
                cursor: 'pointer',
              }}
            >
              EXPORT .PY
            </button>
          </div>
        }
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 8 }}>
          <MetricRow label="Active Algorithm" value={strategyName} />
          <MetricRow label="Engine Version" value={strategyVersion} />
          <MetricRow
            label="Verification Status"
            value={
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <StatusDot state={status === 'ERROR' ? 'bad' : status === 'TESTING' ? 'warn' : 'ok'} pulse={status === 'RUNNING'} />
                <span className="mono" style={{ fontWeight: 600 }}>
                  {status}
                </span>
              </div>
            }
          />
          <MetricRow label="Isolated Target" value={`${environment} ENVIRONMENT`} valueClass={environment === 'PAPER' ? 'info' : 'pos'} />
        </div>

        {/* Template Switcher */}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {TEMPLATES.map(([id, label, desc]) => {
            const isActive = id === template
            return (
              <button
                key={id}
                type="button"
                title={desc}
                onClick={() => selectTemplate(id)}
                style={{
                  fontSize: 10,
                  fontFamily: 'var(--font-mono)',
                  padding: '3px 8px',
                  borderRadius: 3,
                  border: isActive ? '1px solid var(--color-brand-primary)' : '1px solid var(--border-1)',
                  background: isActive ? 'rgba(56, 189, 248, 0.12)' : 'var(--bg-2)',
                  color: isActive ? 'var(--color-brand-primary)' : 'var(--text-1)',
                  fontWeight: isActive ? 700 : 500,
                  cursor: 'pointer',
                  transition: 'all 0.1s ease',
                }}
              >
                {label}
              </button>
            )
          })}
        </div>
      </Panel>

      {/* Monaco Code Editor */}
      <Panel
        title="QUANT STRATEGY SOURCE IDE (PYTHON / NUMBA / RUST ACCELERATED)"
        style={{ flex: '1 1 auto', minHeight: 0 }}
        bodyStyle={{ padding: 0, display: 'flex', flexDirection: 'column' }}
      >
        <div style={{ width: '100%', height: '100%', minHeight: 200, flex: '1 1 auto' }}>
          <Suspense fallback={<div style={{ padding: 12, color: 'var(--text-2)', fontSize: 11 }}>Initializing compiler sandbox…</div>}>
            <MonacoEditor
              height="100%"
              language="python"
              theme="vs-dark"
              value={code}
              onChange={(value) => {
                setCode(value ?? '')
                setStatus('DRAFT')
              }}
              onMount={handleEditorMount}
              options={editorOptions}
            />
          </Suspense>
        </div>
        {diagnostics.length > 0 && (
          <div
            style={{
              padding: '6px 12px',
              borderTop: '1px solid var(--border-1)',
              background: 'var(--bg-2)',
              color: 'var(--color-positive)',
              fontSize: 10.5,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
            className="mono"
          >
            <span>✓</span>
            <span>{diagnostics.join(' · ')}</span>
          </div>
        )}
      </Panel>

      {/* Action Footer */}
      <div style={{ display: 'flex', gap: 6, flex: '0 0 auto' }}>
        <button type="button" onClick={validate} style={actionStyle(false)}>
          VALIDATE AST & TYPES
        </button>
        <button type="button" onClick={run} style={actionStyle(false)}>
          ACTIVATE LIVE MONITORS
        </button>
        <button type="button" onClick={deployToBacktest} style={actionStyle(true)}>
          ▶ DEPLOY STRATEGY TO BACKTEST
        </button>
      </div>

      {/* New Strategy Modal */}
      {newStrategyModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.75)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 9999,
          }}
          onClick={() => setNewStrategyModalOpen(false)}
        >
          <div
            style={{
              width: 480,
              background: 'var(--bg-1)',
              border: '1px solid var(--border-focus)',
              borderRadius: 8,
              padding: 16,
              boxShadow: '0 20px 40px rgba(0,0,0,0.8)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--color-brand-primary)', marginBottom: 12 }}>
              CREATE NEW QUANT STRATEGY
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <label style={{ display: 'block', fontSize: 10.5, color: 'var(--text-2)', marginBottom: 2 }}>STRATEGY NAME</label>
                <input
                  type="text"
                  value={strategyName}
                  onChange={(e) => setStrategyName(e.target.value)}
                  style={modalInputStyle}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 10.5, color: 'var(--text-2)', marginBottom: 2 }}>VERSION TAG</label>
                <input
                  type="text"
                  value={strategyVersion}
                  onChange={(e) => setStrategyVersion(e.target.value)}
                  style={modalInputStyle}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
                <button
                  type="button"
                  onClick={() => setNewStrategyModalOpen(false)}
                  style={{ padding: '6px 12px', background: 'var(--bg-2)', border: '1px solid var(--border-1)', color: 'var(--text-1)', borderRadius: 4, fontSize: 11, cursor: 'pointer' }}
                >
                  CANCEL
                </button>
                <button
                  type="button"
                  onClick={() => setNewStrategyModalOpen(false)}
                  style={{ padding: '6px 16px', background: 'var(--color-brand-primary)', border: 'none', color: '#080a0d', fontWeight: 800, borderRadius: 4, fontSize: 11, cursor: 'pointer' }}
                >
                  CREATE STRATEGY
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function actionStyle(primary: boolean): React.CSSProperties {
  return {
    flex: 1,
    padding: '8px 0',
    background: primary ? 'var(--color-brand-primary)' : 'var(--bg-2)',
    color: primary ? '#080a0d' : 'var(--text-0)',
    border: '1px solid var(--border-1)',
    borderRadius: 4,
    fontWeight: primary ? 800 : 600,
    fontSize: 11,
    letterSpacing: '0.04em',
    cursor: 'pointer',
    transition: 'all 0.1s ease',
  }
}

const modalInputStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--bg-0)',
  color: 'var(--text-0)',
  border: '1px solid var(--border-1)',
  borderRadius: 4,
  padding: '6px 8px',
  fontSize: 11,
  fontFamily: 'var(--font-mono)',
}
