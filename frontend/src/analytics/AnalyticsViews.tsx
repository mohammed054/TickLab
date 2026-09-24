import { useMemo, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import type { DataColumn } from '../components/shared/Panel'
import { DataTable, EmptyState, MetricRow, Panel, SegmentedControl, SelectField, SliderField, StatusDot } from '../components/shared/Panel'
import { timestampNsToMs } from '../contracts'
import type {
  AnalyticsData,
  AnalyticsViewId,
  BucketRow,
  FillAnalysisRow,
  TradeAnalysisRow,
} from './analyticsTypes'
import { BarChart, LineChart, MultiLineChart, Sparkline, ValueBar, chartSurface, compactButton, formatMoney, formatNumber, formatPercent, formatTimestamp, quietButton, valueClass } from './AnalyticsCharts'

export interface AnalyticsSelection {
  timestampNs: string
  fillId?: string
  orderId?: string
  tradeId?: string
  rangeStartNs?: string
  rangeEndNs?: string
}

export interface AnalyticsViewProps {
  data: AnalyticsData
  selectedTimestampNs: string | null
  selectedFillId: string | null
  selectedTradeId: string | null
  onSelect: (selection: AnalyticsSelection) => void
  onViewChange: (view: AnalyticsViewId) => void
  onExperimentSelect?: (experimentId: string) => void
}

const stackStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6, height: '100%', minHeight: 0, overflow: 'auto' }
const clusterStyle: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 6 }
const noteStyle: CSSProperties = { margin: '6px 0 0', color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)' }
const tableButtonStyle: CSSProperties = { padding: 0, border: 0, background: 'transparent', color: 'var(--color-text-primary)', textAlign: 'left', font: 'inherit' }

function ViewStack({ children }: { children: ReactNode }) {
  return <div style={stackStyle}>{children}</div>
}

function ViewNote({ children, warning = false }: { children: ReactNode; warning?: boolean }) {
  return <p style={{ ...noteStyle, color: warning ? 'var(--color-warning)' : 'var(--color-text-muted)' }}>{children}</p>
}

function ContextHeader({ data, selectedTimestampNs }: { data: AnalyticsData; selectedTimestampNs: string | null }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 6 }}>
      <span className="mock-tag">SIMULATED DATA</span>
      <span className="dim" style={{ fontSize: 'var(--font-size-xs)' }}>{data.result.experimentId} · {data.startNs} → {data.endNs}</span>
      <span className="dim mono" style={{ fontSize: 'var(--font-size-xs)', marginLeft: 'auto' }}>{selectedTimestampNs ? formatTimestamp(selectedTimestampNs) : 'No timestamp selected'}</span>
    </div>
  )
}

function timestampDistance(timestampNs: string, targetNs: string | null): number {
  if (!targetNs) return Number.POSITIVE_INFINITY
  try {
    return Math.abs(timestampNsToMs(timestampNs) - timestampNsToMs(targetNs))
  } catch {
    return Number.POSITIVE_INFINITY
  }
}

function nearestPoint<T extends { timestampNs: string }>(points: readonly T[], timestampNs: string | null): T | null {
  if (points.length === 0) return null
  return points.reduce((nearest, point) => timestampDistance(point.timestampNs, timestampNs) < timestampDistance(nearest.timestampNs, timestampNs) ? point : nearest)
}

function selectFill(props: AnalyticsViewProps, fill: FillAnalysisRow) {
  props.onSelect({ timestampNs: fill.timestampNs, fillId: fill.id, tradeId: fill.sourceEventId, orderId: fill.orderId })
}

function fillSlippage(fill: FillAnalysisRow): number {
  const signedSize = fill.side === 'BUY' ? 1 : -1
  return (fill.price - fill.expectedPrice) * signedSize * fill.size
}

function fillMarkout(fill: FillAnalysisRow, horizonMs = 100): number {
  return fill.markouts.find((markout) => markout.horizonMs === horizonMs)?.markout ?? 0
}

function fillPriceAt(fill: FillAnalysisRow, horizonMs: number): number {
  return fill.markouts.find((markout) => markout.horizonMs === horizonMs)?.price ?? fill.price
}

function ContextPanel({ children, title }: { children: ReactNode; title: string }) {
  return <Panel title={`${title} (SIMULATED)`} bodyStyle={{ padding: 'var(--space-3)' }}>{children}</Panel>
}

function EquityCurveView({ data, selectedTimestampNs, onSelect }: AnalyticsViewProps) {
  type EquityMode = 'net' | 'gross' | 'realized' | 'unrealized' | 'percentage' | 'log'
  const [mode, setMode] = useState<EquityMode>('net')
  const options: readonly { value: EquityMode; label: string }[] = [
    { value: 'net', label: 'Net' },
    { value: 'gross', label: 'Gross' },
    { value: 'realized', label: 'Realized' },
    { value: 'unrealized', label: 'Unrealized' },
    { value: 'percentage', label: '%' },
    { value: 'log', label: 'Log' },
  ]
  const points = useMemo(() => data.equity.map((point) => {
    let value = point.value
    if (mode === 'gross') value += data.result.headline.fees
    if (mode === 'realized') value *= 0.72
    if (mode === 'unrealized') value *= 0.28
    if (mode === 'percentage') value = point.value / data.result.headline.initialCapital * 100
    if (mode === 'log') value = Math.log1p(Math.max(point.value, -data.result.headline.initialCapital * 0.99))
    return { timestampNs: point.timestampNs, value: roundForDisplay(value) }
  }), [data.equity, data.result.headline.fees, data.result.headline.initialCapital, mode])
  const selected = nearestPoint(data.equity, selectedTimestampNs)
  const maxDrawdown = Math.min(...data.drawdown.map((point) => point.drawdownPct), 0)
  return (
    <ViewStack>
      <ContextHeader data={data} selectedTimestampNs={selectedTimestampNs} />
      <ContextPanel title="EQUITY CURVE">
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <SegmentedControl value={mode} options={options} onChange={setMode} ariaLabel="Equity curve display mode" />
          <span className="dim" style={{ fontSize: 'var(--font-size-xs)' }}>Mode is display-only; the canonical result remains the source.</span>
        </div>
        <LineChart points={points} color="var(--color-info)" zeroLine selectedTimestampNs={selectedTimestampNs} ariaLabel="Simulated equity curve" formatValue={(value) => mode === 'percentage' ? formatPercent(value) : formatMoney(value)} onPointClick={(point) => onSelect({ timestampNs: point.timestampNs })} />
        <div style={clusterStyle}>
          <MetricRow label="Final capital" value={formatMoney(data.result.headline.finalCapital)} />
          <MetricRow label="Net P&L" value={formatMoney(data.result.headline.netPnl)} valueClass={valueClass(data.result.headline.netPnl)} />
          <MetricRow label="Max drawdown" value={formatPercent(maxDrawdown)} valueClass="neg" />
          <MetricRow label="Selected point" value={selected ? formatTimestamp(selected.timestampNs) : '—'} />
        </div>
        <ViewNote>Simulated series derived from the selected BacktestResult and deterministic runtime context. Click any point to commit the shared workspace timestamp.</ViewNote>
      </ContextPanel>
      <ContextPanel title="EQUITY DETAIL">
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <Sparkline points={data.equity} color="var(--color-info)" ariaLabel="Compact simulated equity trend" />
          <span className="dim" style={{ fontSize: 'var(--font-size-xs)' }}>{data.equity.length} deterministic samples · click the full chart for timestamp selection.</span>
        </div>
      </ContextPanel>
    </ViewStack>
  )
}

function roundForDisplay(value: number): number {
  return Math.round(value * 100) / 100
}

function DrawdownView({ data, selectedTimestampNs, onSelect }: AnalyticsViewProps) {
  const points = data.drawdown.map((point) => ({ timestampNs: point.timestampNs, value: point.drawdownPct }))
  const selected = nearestPoint(data.drawdown, selectedTimestampNs)
  const maxPoint = data.drawdown.reduce((worst, point) => point.drawdownPct < worst.drawdownPct ? point : worst, data.drawdown[0] ?? { drawdownPct: 0, timestampNs: data.startNs, peakCapital: 0, troughCapital: 0, isTrough: false, value: 0, capital: 0 })
  const recovery = data.drawdown.find((point) => point.timestampNs > maxPoint.timestampNs && point.capital >= maxPoint.peakCapital)
  const rangeStartNs = selected?.timestampNs ?? maxPoint.timestampNs
  const rangeEndNs = selected ? data.equity.find((point) => point.timestampNs > selected.timestampNs)?.timestampNs ?? data.endNs : data.endNs
  return (
    <ViewStack>
      <ContextHeader data={data} selectedTimestampNs={selectedTimestampNs} />
      <ContextPanel title="DRAWDOWN">
        <LineChart points={points} color="var(--color-negative)" zeroLine selectedTimestampNs={selectedTimestampNs} formatValue={(value) => formatPercent(value)} ariaLabel="Simulated drawdown curve" onPointClick={(point) => onSelect({ timestampNs: point.timestampNs, rangeStartNs: point.timestampNs, rangeEndNs: data.equity.find((item) => item.timestampNs > point.timestampNs)?.timestampNs ?? data.endNs })} />
        <div style={clusterStyle}>
          <MetricRow label="Current drawdown" value={formatPercent(data.drawdown[data.drawdown.length - 1]?.drawdownPct ?? 0)} valueClass="neg" />
          <MetricRow label="Max drawdown" value={formatPercent(maxPoint.drawdownPct)} valueClass="neg" />
          <MetricRow label="Peak capital" value={formatMoney(maxPoint.peakCapital)} />
          <MetricRow label="Trough capital" value={formatMoney(maxPoint.troughCapital)} />
          <MetricRow label="Recovery" value={recovery ? formatTimestamp(recovery.timestampNs) : 'Not recovered'} />
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
          <button type="button" style={compactButton} onClick={() => onSelect({ timestampNs: maxPoint.timestampNs, rangeStartNs: data.startNs, rangeEndNs: data.endNs })}>SELECT TROUGH</button>
          <button type="button" style={quietButton} onClick={() => onSelect({ timestampNs: rangeStartNs, rangeStartNs, rangeEndNs })}>SET REPLAY RANGE FROM POINT</button>
        </div>
        <ViewNote>Simulated drawdown is a deterministic reference series. Selecting a point commits the timestamp; the replay range action uses the same shared workspace selection.</ViewNote>
      </ContextPanel>
    </ViewStack>
  )
}

function AttributionView({ data, selectedTimestampNs, onSelect, onViewChange }: AnalyticsViewProps) {
  const [selectedId, setSelectedId] = useState(data.attribution[0]?.id ?? '')
  const selected = data.attribution.find((item) => item.id === selectedId) ?? data.attribution[0]
  const filteredFills = selected?.id === 'adverse' ? data.fills.filter((fill) => fillMarkout(fill) < 0) : data.fills
  const max = Math.max(...data.attribution.map((item) => Math.abs(item.value)), 1)
  const contribution = (fill: FillAnalysisRow) => {
    if (!selected) return 0
    if (selected.id === 'fees') return -data.result.headline.fees / Math.max(data.fills.length, 1)
    if (selected.id === 'slippage') return fillSlippage(fill)
    if (selected.id === 'adverse') return fillMarkout(fill)
    if (selected.id === 'inventory' || selected.id === 'execution' || selected.id === 'gross' || selected.id === 'other') return selected.value / Math.max(data.fills.length, 1)
    return 0
  }
  return (
    <ViewStack>
      <ContextHeader data={data} selectedTimestampNs={selectedTimestampNs} />
      <ContextPanel title="P&L ATTRIBUTION">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {data.attribution.map((item) => <ValueBar key={item.id} label={item.label} value={item.value} max={max} active={item.id === selected?.id} onClick={() => { setSelectedId(item.id); const first = data.fills[0]; if (first) selectFill({ data, selectedTimestampNs: null, selectedFillId: null, selectedTradeId: null, onSelect, onViewChange }, first) }} />)}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
          <StatusDot state={Math.abs(selected?.value ?? 0) < 0.01 ? 'ok' : 'off'} label="simulated attribution residual" />
          <span className="dim" style={{ fontSize: 'var(--font-size-xs)' }}>{selected?.detail ?? ''}</span>
        </div>
        <ViewNote>Simulated attribution categories reconcile to the selected headline net P&L; the residual category is explicitly surfaced rather than hidden. Selecting a category filters the visible fill lens.</ViewNote>
      </ContextPanel>
      <Panel title="FILLS IN SELECTED ATTRIBUTION (SIMULATED)" bodyStyle={{ padding: 0 }}>
        <DataTable
          rows={filteredFills.slice(0, 12)}
          rowKey={(row) => row.id}
          ariaLabel="Simulated fills filtered by attribution category"
          columns={[
            { key: 'time', header: 'Timestamp', render: (row) => <button type="button" style={tableButtonStyle} onClick={() => selectFill({ data, selectedTimestampNs: null, selectedFillId: null, selectedTradeId: null, onSelect, onViewChange }, row)}>{formatTimestamp(row.timestampNs)}</button> },
            { key: 'side', header: 'Side', render: (row) => row.side },
            { key: 'contribution', header: 'Simulated contribution', render: (row) => <span className={valueClass(contribution(row))}>{formatMoney(contribution(row))}</span> },
            { key: 'markout', header: '+100ms markout', render: (row) => <span className={valueClass(fillMarkout(row))}>{formatMoney(fillMarkout(row))}</span> },
          ]}
        />
        <div style={{ padding: 8, borderTop: '1px solid var(--color-border-subtle)' }}><button type="button" style={compactButton} onClick={() => onViewChange('fills')}>OPEN FILL ANALYSIS</button></div>
      </Panel>
    </ViewStack>
  )
}

function TradeAnalysisView({ data, selectedTimestampNs, onSelect, onViewChange }: AnalyticsViewProps) {
  const [filter, setFilter] = useState<'all' | 'wins' | 'losses'>('all')
  const rows = data.trades.filter((row) => filter === 'all' || (filter === 'wins' ? row.outcome === 'WIN' : row.outcome === 'LOSS')).slice().reverse()
  const wins = data.trades.filter((row) => row.outcome === 'WIN')
  const losses = data.trades.filter((row) => row.outcome === 'LOSS')
  const columns: DataColumn<TradeAnalysisRow>[] = [
    { key: 'time', header: 'Timestamp', render: (row) => <button type="button" style={tableButtonStyle} onClick={() => onSelect({ timestampNs: row.timestampNs, fillId: row.id.replace(/^trade-/, ''), tradeId: row.id })}>{formatTimestamp(row.timestampNs)}</button> },
    { key: 'side', header: 'Side', render: (row) => <span className={row.side === 'BUY' ? 'pos' : 'neg'}>{row.side}</span> },
    { key: 'outcome', header: 'Outcome', render: (row) => <span className={row.outcome === 'WIN' ? 'pos' : 'neg'}>{row.outcome}</span> },
    { key: 'pnl', header: 'Simulated P&L', render: (row) => <span className={valueClass(row.pnl)}>{formatMoney(row.pnl)}</span> },
    { key: 'hold', header: 'Holding', render: (row) => `${(row.holdingMs / 1000).toFixed(1)}s` },
    { key: 'slippage', header: 'Slippage', render: (row) => <span className={valueClass(row.slippage)}>{formatMoney(row.slippage)}</span> },
  ]
  return (
    <ViewStack>
      <ContextHeader data={data} selectedTimestampNs={selectedTimestampNs} />
      <ContextPanel title="TRADE ANALYSIS">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 8 }}>
          <SegmentedControl value={filter} options={[{ value: 'all', label: 'All' }, { value: 'wins', label: 'Favorable' }, { value: 'losses', label: 'Adverse' }]} onChange={setFilter} ariaLabel="Trade outcome filter" />
          <span className="dim" style={{ fontSize: 'var(--font-size-xs)' }}>Outcome uses the simulated +100ms post-fill markout, not raw entry versus exit.</span>
        </div>
        <div style={clusterStyle}>
          <MetricRow label="Total simulated trades" value={data.trades.length.toLocaleString()} />
          <MetricRow label="Favorable / adverse" value={`${wins.length} / ${losses.length}`} />
          <MetricRow label="Average simulated P&L" value={formatMoney(data.trades.reduce((total, row) => total + row.pnl, 0) / Math.max(data.trades.length, 1))} valueClass={valueClass(data.trades.reduce((total, row) => total + row.pnl, 0))} />
          <MetricRow label="Largest modeled move" value={formatMoney(Math.max(...data.trades.map((row) => Math.abs(row.pnl)), 0))} />
        </div>
        <ViewNote>Trade rows are deterministic simulated research artifacts. Click a timestamp to route the selection through the shared workspace.</ViewNote>
      </ContextPanel>
      <Panel title="SIMULATED TRADE LEDGER" bodyStyle={{ padding: 0 }}>
        <DataTable rows={rows} columns={columns} rowKey={(row) => row.id} ariaLabel="Simulated trade analysis rows" emptyState={<EmptyState title="NO SIMULATED TRADES" description="The selected result has no derived trade rows." action={<button type="button" style={compactButton} onClick={() => onViewChange('fills')}>OPEN FILLS</button>} />} />
      </Panel>
    </ViewStack>
  )
}

function FillAnalysisView({ data, selectedTimestampNs, selectedFillId, selectedTradeId, onSelect }: AnalyticsViewProps) {
  const [activeId, setActiveId] = useState<string | null>(selectedFillId ?? selectedTradeId)
  const [horizon, setHorizon] = useState(100)
  const active = data.fills.find((row) => row.id === activeId || row.sourceEventId === activeId) ?? nearestPoint(data.fills, selectedTimestampNs) ?? data.fills[0]
  const columns: DataColumn<FillAnalysisRow>[] = [
    { key: 'time', header: 'Timestamp', render: (row) => <button type="button" style={tableButtonStyle} onClick={() => { setActiveId(row.id); selectFill({ data, selectedTimestampNs, selectedFillId, selectedTradeId, onSelect, onViewChange: () => undefined }, row) }}>{formatTimestamp(row.timestampNs)}</button> },
    { key: 'side', header: 'Side', render: (row) => <span className={row.side === 'BUY' ? 'pos' : 'neg'}>{row.side}</span> },
    { key: 'price', header: 'Fill', render: (row) => formatNumber(row.price, 2) },
    { key: 'size', header: 'Size', render: (row) => formatNumber(row.size, 4) },
    { key: 'expected', header: 'Expected', render: (row) => formatNumber(row.expectedPrice, 2) },
    { key: 'queue', header: 'Queue', render: (row) => formatNumber(row.queueAhead, 2) },
    { key: 'probability', header: 'P(fill)', render: (row) => formatPercent(row.fillProbability * 100, 1) },
  ]
  return (
    <ViewStack>
      <ContextHeader data={data} selectedTimestampNs={selectedTimestampNs} />
      <ContextPanel title="FILL ANALYSIS">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 8 }}>
          <span className="dim" style={{ fontSize: 'var(--font-size-xs)' }}>Markout horizon</span>
          <SegmentedControl value={String(horizon) as '1' | '5' | '10' | '50' | '100' | '1000' | '5000'} options={[{ value: '1', label: '+1ms' }, { value: '5', label: '+5ms' }, { value: '10', label: '+10ms' }, { value: '50', label: '+50ms' }, { value: '100', label: '+100ms' }, { value: '1000', label: '+1s' }, { value: '5000', label: '+5s' }]} onChange={(value) => setHorizon(Number(value))} ariaLabel="Fill markout horizon" />
        </div>
        <Panel title="SELECTED FILL DETAIL (SIMULATED)" bodyStyle={{ padding: 'var(--space-3)' }}>
          {active ? <>
            <div style={clusterStyle}>
              <MetricRow label="Timestamp" value={formatTimestamp(active.timestampNs)} />
              <MetricRow label="Side / size" value={`${active.side} / ${formatNumber(active.size, 4)}`} valueClass={active.side === 'BUY' ? 'pos' : 'neg'} />
              <MetricRow label="Fill / expected" value={`${formatNumber(active.price, 2)} / ${formatNumber(active.expectedPrice, 2)}`} />
              <MetricRow label="Queue ahead" value={formatNumber(active.queueAhead, 3)} />
              <MetricRow label="Modeled fill probability" value={formatPercent(active.fillProbability * 100, 1)} />
              <MetricRow label="Latency" value={`${formatNumber(active.latencyMs, 2)}ms`} />
              <MetricRow label="Spread" value={formatNumber(active.spread, 3)} />
              <MetricRow label="Volatility" value={formatNumber(active.volatility, 3)} />
              <MetricRow label="Imbalance" value={formatNumber(active.imbalance, 3)} />
              <MetricRow label={`Selected horizon +${horizon}ms`} value={`${formatMoney(fillMarkout(active, horizon))} · mid ${formatNumber(fillPriceAt(active, horizon), 2)}`} valueClass={valueClass(fillMarkout(active, horizon))} />
            </div>
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 2 }}>
              {active.markouts.map((markout) => <MetricRow key={markout.horizonMs} label={`Markout +${markout.horizonMs}ms`} value={`${formatMoney(markout.markout)} · mid ${formatNumber(markout.price, 2)}`} valueClass={valueClass(markout.markout)} />)}
            </div>
            <ViewNote>Fill probability and latency are simulated model estimates, not observed live execution guarantees.</ViewNote>
          </> : <EmptyState title="NO SIMULATED FILL" description="No fill is available for the selected result." />}
        </Panel>
        <ViewNote>Click a fill row to select its timestamp, order, trade, and fill IDs in useWorkspace.</ViewNote>
      </ContextPanel>
      <Panel title="SIMULATED FILL LEDGER" bodyStyle={{ padding: 0 }}>
        <DataTable rows={data.fills.slice().reverse()} columns={columns} rowKey={(row) => row.id} ariaLabel="Simulated fill analysis rows" emptyState={<EmptyState title="NO SIMULATED FILLS" description="No derived fill rows are available." />} />
      </Panel>
    </ViewStack>
  )
}

function AdverseSelectionView({ data, selectedTimestampNs, onSelect, onViewChange }: AnalyticsViewProps) {
  const [horizon, setHorizon] = useState(100)
  const values = data.fills.map((fill) => ({ id: fill.id, label: fill.id.replace('fill-', '').slice(-4), value: fillMarkout(fill, horizon), timestampNs: fill.timestampNs }))
  const active = data.fills.find((fill) => values.some((value) => value.id === fill.id && Math.abs(value.value - fillMarkout(fill, horizon)) < 0.000001 && fill.timestampNs === selectedTimestampNs)) ?? data.fills[0]
  const average = values.reduce((total, value) => total + value.value, 0) / Math.max(values.length, 1)
  const adverseCount = values.filter((value) => value.value < 0).length
  return (
    <ViewStack>
      <ContextHeader data={data} selectedTimestampNs={selectedTimestampNs} />
      <ContextPanel title="ADVERSE SELECTION">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 8 }}>
          <SegmentedControl value={String(horizon) as '1' | '5' | '10' | '50' | '100' | '1000' | '5000'} options={[{ value: '1', label: '+1ms' }, { value: '5', label: '+5ms' }, { value: '10', label: '+10ms' }, { value: '50', label: '+50ms' }, { value: '100', label: '+100ms' }, { value: '1000', label: '+1s' }, { value: '5000', label: '+5s' }]} onChange={(value) => setHorizon(Number(value))} ariaLabel="Adverse selection markout horizon" />
          <span className="dim" style={{ fontSize: 'var(--font-size-xs)' }}>Positive is favorable in this simulated markout lens; negative is adverse selection.</span>
        </div>
        <BarChart bars={values} formatValue={formatMoney} ariaLabel="Simulated adverse selection markout distribution" onBarClick={(bar) => { const fill = data.fills.find((item) => item.id === bar.id); if (fill) selectFill({ data, selectedTimestampNs, selectedFillId: null, selectedTradeId: null, onSelect, onViewChange }, fill) }} />
        <div style={clusterStyle}>
          <MetricRow label="Mean simulated markout" value={formatMoney(average)} valueClass={valueClass(average)} />
          <MetricRow label="Adverse observations" value={`${adverseCount} / ${values.length}`} valueClass={adverseCount > 0 ? 'neg' : 'pos'} />
          <MetricRow label="Selected fill" value={active ? formatTimestamp(active.timestampNs) : '—'} />
        </div>
        <ViewNote>Simulated post-fill movement is derived from deterministic mock fills. Change the horizon to inspect another point on the same raw markout ladder.</ViewNote>
      </ContextPanel>
    </ViewStack>
  )
}

function SlippageView({ data, selectedTimestampNs, onSelect, onViewChange }: AnalyticsViewProps) {
  type Breakdown = 'volatility' | 'liquidity' | 'time' | 'regime'
  const [breakdown, setBreakdown] = useState<Breakdown>('volatility')
  const labels: Record<Breakdown, string[]> = {
    volatility: data.slippage.map((row) => row.label),
    liquidity: data.liquidity.map((row) => row.label),
    time: data.time.map((row) => row.label),
    regime: ['Trend-like', 'Mean-reverting', 'Unstable'],
  }
  const rows: BucketRow[] = breakdown === 'volatility'
    ? data.slippage
    : breakdown === 'liquidity'
      ? data.liquidity.map((row, index) => ({ id: row.id, label: row.label, pnl: row.pnl, fillRate: row.fillRate, spread: row.spread, adverse: -Math.abs(data.result.headline.netPnl) * (0.01 + index * 0.004), count: Math.round(data.result.headline.trades * (0.3 - index * 0.05)), timestampNs: data.equity[index]?.timestampNs ?? data.startNs }))
      : breakdown === 'time'
        ? data.time.map((row) => ({ id: row.id, label: row.label, pnl: row.pnl, fillRate: row.fillRate, spread: row.spread, adverse: row.adverseSelection, count: Math.round(data.result.headline.trades * 0.125), timestampNs: row.timestampNs }))
        : labels.regime.map((label, index) => ({ id: `regime-${index}`, label, pnl: data.result.headline.netPnl * [0.42, 0.38, 0.2][index], fillRate: data.result.headline.fillRatePct + [3, 0, -4][index], spread: 0.7 + index * 0.12, adverse: -Math.abs(data.result.headline.netPnl) * [0.02, 0.03, 0.06][index], count: Math.round(data.result.headline.trades * [0.42, 0.38, 0.2][index]), timestampNs: data.equity[index]?.timestampNs ?? data.startNs }))
  const bars = rows.map((row) => ({ id: row.id, label: row.label, value: fillSlippageForBucket(row, breakdown), timestampNs: row.timestampNs }))
  return (
    <ViewStack>
      <ContextHeader data={data} selectedTimestampNs={selectedTimestampNs} />
      <ContextPanel title="SLIPPAGE ANALYSIS">
        <SegmentedControl value={breakdown} options={[{ value: 'volatility', label: 'Volatility' }, { value: 'liquidity', label: 'Liquidity' }, { value: 'time', label: 'Time' }, { value: 'regime', label: 'Regime' }]} onChange={setBreakdown} ariaLabel="Slippage breakdown" />
        <div style={{ height: 6 }} />
        <BarChart bars={bars} formatValue={formatMoney} ariaLabel="Simulated slippage by selected breakdown" onBarClick={(bar) => { const row = rows.find((item) => item.id === bar.id); if (row?.timestampNs) onSelect({ timestampNs: row.timestampNs }) }} />
        <Panel title="BREAKDOWN TABLE (SIMULATED)" bodyStyle={{ padding: 0 }}>
          <DataTable
            rows={rows}
            rowKey={(row) => row.id}
            ariaLabel="Simulated slippage breakdown table"
            columns={[
              { key: 'bucket', header: 'Bucket', render: (row) => <button type="button" style={tableButtonStyle} onClick={() => onSelect({ timestampNs: row.timestampNs })}>{row.label}</button> },
              { key: 'slippage', header: 'Simulated slippage', render: (row) => <span className={valueClass(fillSlippageForBucket(row, breakdown))}>{formatMoney(fillSlippageForBucket(row, breakdown))}</span> },
              { key: 'fillRate', header: 'Fill rate', render: (row) => formatPercent(row.fillRate, 1) },
              { key: 'spread', header: 'Spread', render: (row) => formatNumber(row.spread, 3) },
              { key: 'count', header: 'Observations', render: (row) => row.count.toLocaleString() },
            ]}
          />
        </Panel>
        <ViewNote>Breakdowns are simulated bucket summaries. Selecting a bucket routes its representative timestamp through the shared workspace.</ViewNote>
        <button type="button" style={{ ...quietButton, marginTop: 8 }} onClick={() => onViewChange('fills')}>OPEN UNDERLYING FILLS</button>
      </ContextPanel>
    </ViewStack>
  )
}

function fillSlippageForBucket(row: BucketRow, breakdown: 'volatility' | 'liquidity' | 'time' | 'regime'): number {
  if (breakdown === 'volatility') return -Math.abs(row.adverse) * 0.65
  if (breakdown === 'time') return row.spread * 2.4 - 0.7
  if (breakdown === 'liquidity') return (row.fillRate - 35) * -0.012
  return row.spread * 1.8 - 0.4
}

function QueueView({ data, selectedTimestampNs, selectedFillId, selectedTradeId, onSelect, onViewChange }: AnalyticsViewProps) {
  const [activeId, setActiveId] = useState<string | null>(selectedFillId ?? selectedTradeId)
  const active = data.queue.find((row) => row.id === activeId || row.fillId === activeId) ?? data.queue[0]
  const scatter = data.queue.map((row) => ({ id: row.id, label: row.id.slice(-3), queue: row.queueAhead, probability: row.fillProbability, timestampNs: row.timestampNs }))
  return (
    <ViewStack>
      <ContextHeader data={data} selectedTimestampNs={selectedTimestampNs} />
      <ContextPanel title="QUEUE ANALYSIS">
        <QueueScatter points={scatter} selectedId={active?.id} onSelect={(point) => { const order = data.queue.find((row) => row.id === point.id); if (order) { setActiveId(order.id); onSelect({ timestampNs: order.timestampNs, fillId: order.fillId, orderId: order.id }) } }} />
        <div style={clusterStyle}>
          <MetricRow label="Orders" value={data.queue.length.toLocaleString()} />
          <MetricRow label="Average queue ahead" value={formatNumber(data.queue.reduce((total, row) => total + row.queueAhead, 0) / Math.max(data.queue.length, 1), 2)} />
          <MetricRow label="Average modeled fill" value={formatPercent(data.queue.reduce((total, row) => total + row.fillProbability, 0) / Math.max(data.queue.length, 1) * 100, 1)} />
          <MetricRow label="Selected status" value={active?.status.replace('_', ' ') ?? '—'} />
        </div>
        <ViewNote>Queue-ahead and fill probability are simulated model values. The scatter is a calibration view for the selected deterministic result, not a live order-routing claim.</ViewNote>
      </ContextPanel>
      <Panel title="QUEUE PROGRESSION (SIMULATED)" bodyStyle={{ padding: 'var(--space-3)' }}>
        {active ? <>
          <LineChart points={active.timeline.map((point) => ({ timestampNs: point.timestampNs, value: point.queueAhead }))} color="var(--color-warning)" zeroLine formatValue={(value) => formatNumber(value, 2)} ariaLabel="Simulated queue progression timeline" onPointClick={(point) => onSelect({ timestampNs: point.timestampNs, orderId: active.id, fillId: active.fillId })} />
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
            {active.timeline.map((point) => <span key={`${point.label}-${point.timestampNs}`} className="mono dim" style={{ fontSize: 'var(--font-size-xs)' }}>{point.label}: {formatNumber(point.queueAhead, 2)}</span>)}
          </div>
        </> : <EmptyState title="NO SIMULATED ORDERS" description="No queue progression is available." />}
      </Panel>
      <Panel title="ORDER QUEUE LEDGER (SIMULATED)" bodyStyle={{ padding: 0 }}>
        <DataTable
          rows={data.queue}
          rowKey={(row) => row.id}
          ariaLabel="Simulated queue order ledger"
          columns={[
            { key: 'order', header: 'Order', render: (row) => <button type="button" style={tableButtonStyle} onClick={() => { setActiveId(row.id); onSelect({ timestampNs: row.timestampNs, orderId: row.id, fillId: row.fillId }) }}>{row.id}</button> },
            { key: 'side', header: 'Side', render: (row) => <span className={row.side === 'BUY' ? 'pos' : 'neg'}>{row.side}</span> },
            { key: 'queue', header: 'Queue ahead', render: (row) => formatNumber(row.queueAhead, 2) },
            { key: 'probability', header: 'P(fill)', render: (row) => formatPercent(row.fillProbability * 100, 1) },
            { key: 'status', header: 'Status', render: (row) => row.status.replace('_', ' ') },
          ]}
        />
        <div style={{ padding: 8 }}><button type="button" style={quietButton} onClick={() => onViewChange('fills')}>VIEW FILLS</button></div>
      </Panel>
    </ViewStack>
  )
}

function QueueScatter({ points, selectedId, onSelect }: { points: Array<{ id: string; label: string; queue: number; probability: number; timestampNs: string }>; selectedId?: string; onSelect: (point: { id: string }) => void }) {
  const width = 640
  const height = 190
  const maxQueue = Math.max(...points.map((point) => point.queue), 1)
  return (
    <div style={chartSurface}>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Simulated queue ahead versus fill probability scatter" preserveAspectRatio="none" style={{ width: '100%', height, display: 'block' }}>
        {[0, 0.5, 1].map((fraction) => <line key={fraction} x1="0" x2={width} y1={18 + 140 * fraction} y2={18 + 140 * fraction} stroke="var(--color-border-subtle)" strokeWidth="1" opacity="0.55" />)}
        {points.map((point) => {
          const x = 20 + (point.queue / maxQueue) * 590
          const y = 158 - point.probability * 120
          return <circle key={point.id} cx={x} cy={y} r={point.id === selectedId ? 5 : 3} fill={point.id === selectedId ? 'var(--color-info)' : 'var(--color-warning)'} tabIndex={0} role="button" aria-label={`${point.id}: queue ${formatNumber(point.queue, 2)}, modeled fill ${formatPercent(point.probability * 100, 1)}`} onClick={() => onSelect(point)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(point) } }} style={{ cursor: 'pointer' }}><title>{point.id} · queue {formatNumber(point.queue, 2)} · P(fill) {formatPercent(point.probability * 100, 1)}</title></circle>
        })}
        <text x="20" y="180" fill="var(--color-text-muted)" fontSize="9">queue ahead →</text>
        <text x="4" y="16" fill="var(--color-text-muted)" fontSize="9">P(fill)</text>
      </svg>
    </div>
  )
}

function percentile(values: readonly number[], fraction: number): number {
  if (values.length === 0) return 0
  const sorted = values.slice().sort((left, right) => left - right)
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * fraction)))
  return sorted[index]
}

function LatencyView({ data, selectedTimestampNs, onSelect }: AnalyticsViewProps) {
  const [mode, setMode] = useState<'distribution' | 'timeline' | 'breakdown'>('distribution')
  const histogram = Array.from({ length: 7 }, (_, index) => {
    const min = 8 + index * 7
    const max = min + 7
    const count = data.latency.filter((point) => point.total >= min && point.total < max).length
    return { id: `lat-${index}`, label: `${min}-${max}`, value: count }
  })
  const residual = data.latency.map((point) => Math.abs(point.residual))
  return (
    <ViewStack>
      <ContextHeader data={data} selectedTimestampNs={selectedTimestampNs} />
      <ContextPanel title="LATENCY ANALYSIS">
        <SegmentedControl value={mode} options={[{ value: 'distribution', label: 'Distribution' }, { value: 'timeline', label: 'Timeline' }, { value: 'breakdown', label: 'Breakdown' }]} onChange={setMode} ariaLabel="Latency analysis view" />
        <div style={{ height: 6 }} />
        {mode === 'distribution' && <BarChart bars={histogram} formatValue={(value) => `${Math.round(value)} observations`} ariaLabel="Simulated latency distribution" />}
        {mode === 'timeline' && <LineChart points={data.latency.map((point) => ({ timestampNs: point.timestampNs, value: point.total }))} color="var(--color-info)" formatValue={(value) => `${formatNumber(value, 2)}ms`} ariaLabel="Simulated latency over time" onPointClick={(point) => onSelect({ timestampNs: point.timestampNs })} />}
        {mode === 'breakdown' && <Panel title="COMPONENT BREAKDOWN (SIMULATED)" bodyStyle={{ padding: 0 }}>
          <DataTable rows={data.latency} rowKey={(row) => row.timestampNs} ariaLabel="Simulated latency component breakdown" columns={[
            { key: 'time', header: 'Timestamp', render: (row) => <button type="button" style={tableButtonStyle} onClick={() => onSelect({ timestampNs: row.timestampNs })}>{formatTimestamp(row.timestampNs)}</button> },
            { key: 'decision', header: 'Decision', render: (row) => `${formatNumber(row.decision, 2)}ms` },
            { key: 'creation', header: 'Creation', render: (row) => `${formatNumber(row.orderCreation, 2)}ms` },
            { key: 'arrival', header: 'Arrival', render: (row) => `${formatNumber(row.exchangeArrival, 2)}ms` },
            { key: 'fill', header: 'Fill', render: (row) => `${formatNumber(row.fill, 2)}ms` },
            { key: 'residual', header: 'Residual', render: (row) => <span className={Math.abs(row.residual) > 1 ? 'warn' : 'dim'}>{formatNumber(row.residual, 2)}ms</span> },
          ]} />
        </Panel>}
        <div style={clusterStyle}>
          <MetricRow label="p50" value={`${formatNumber(percentile(data.latency.map((row) => row.total), 0.5), 2)}ms`} />
          <MetricRow label="p90" value={`${formatNumber(percentile(data.latency.map((row) => row.total), 0.9), 2)}ms`} />
          <MetricRow label="p99" value={`${formatNumber(percentile(data.latency.map((row) => row.total), 0.99), 2)}ms`} />
          <MetricRow label="Largest residual" value={`${formatNumber(Math.max(...residual, 0), 2)}ms`} valueClass={Math.max(...residual, 0) > 1 ? 'warn' : undefined} />
        </div>
        <ViewNote>Latency values are simulated component estimates. The residual is shown so an unexplained gap cannot be hidden.</ViewNote>
      </ContextPanel>
    </ViewStack>
  )
}

function correlation(left: readonly number[], right: readonly number[]): number {
  if (left.length === 0 || left.length !== right.length) return 0
  const leftMean = left.reduce((total, value) => total + value, 0) / left.length
  const rightMean = right.reduce((total, value) => total + value, 0) / right.length
  const numerator = left.reduce((total, value, index) => total + (value - leftMean) * (right[index] - rightMean), 0)
  const leftScale = Math.sqrt(left.reduce((total, value) => total + (value - leftMean) ** 2, 0))
  const rightScale = Math.sqrt(right.reduce((total, value) => total + (value - rightMean) ** 2, 0))
  return leftScale === 0 || rightScale === 0 ? 0 : numerator / (leftScale * rightScale)
}

function ImbalanceView({ data, selectedTimestampNs, onSelect }: AnalyticsViewProps) {
  const [depth, setDepth] = useState(10)
  const values = data.imbalance.map((point) => ({ ...point, value: point.imbalance }))
  const bins = [-0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75].map((lower, index) => {
    const upper = index === 6 ? 1 : [-0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75][index + 1]
    const points = data.imbalance.filter((point) => point.imbalance >= lower && point.imbalance < upper)
    return { id: `bin-${index}`, label: `${lower.toFixed(2)}–${upper.toFixed(2)}`, value: points.reduce((total, point) => total + point.futureMove, 0) / Math.max(points.length, 1) }
  })
  const association = correlation(data.imbalance.map((point) => point.imbalance), data.imbalance.map((point) => point.futureMove))
  return (
    <ViewStack>
      <ContextHeader data={data} selectedTimestampNs={selectedTimestampNs} />
      <ContextPanel title="ORDER-BOOK IMBALANCE">
        <SliderField label="Depth window" value={depth} min={5} max={25} step={5} unit=" levels" description="Simulated depth setting for the historical association view." onChange={setDepth} />
        <LineChart points={values} color="var(--color-info)" zeroLine formatValue={(value) => formatNumber(value, 3)} ariaLabel="Simulated order-book imbalance over time" onPointClick={(point) => onSelect({ timestampNs: point.timestampNs })} />
        <div style={{ height: 6 }} />
        <BarChart bars={bins} zeroLine formatValue={(value) => `${(value * 100).toFixed(2)}%`} ariaLabel="Binned simulated future movement by imbalance" onBarClick={(bar) => { const index = Number(bar.id.replace('bin-', '')); const lower = [-0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75][index]; const upper = index === 6 ? 1 : [-0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75][index + 1]; const bin = data.imbalance.find((point) => point.imbalance >= lower && point.imbalance < upper); if (bin) onSelect({ timestampNs: bin.timestampNs }) }} />
        <div style={clusterStyle}>
          <MetricRow label="Depth setting" value={`${depth} levels`} />
          <MetricRow label="Historical association" value={formatNumber(association, 3)} />
          <MetricRow label="Samples" value={data.imbalance.length.toLocaleString()} />
        </div>
        <ViewNote warning>Historical statistical association, not a trading recommendation or a claim of predictive certainty.</ViewNote>
      </ContextPanel>
    </ViewStack>
  )
}

function VolatilityView({ data, selectedTimestampNs, onSelect }: AnalyticsViewProps) {
  const [estimator, setEstimator] = useState<'realized' | 'parkinson'>('realized')
  const bars = data.volatility.map((row) => ({ id: row.id, label: row.label, value: row.pnl }))
  return (
    <ViewStack>
      <ContextHeader data={data} selectedTimestampNs={selectedTimestampNs} />
      <ContextPanel title="VOLATILITY ANALYSIS">
        <SegmentedControl value={estimator} options={[{ value: 'realized', label: 'Realized log returns' }, { value: 'parkinson', label: 'Parkinson range' }]} onChange={setEstimator} ariaLabel="Volatility estimator display" />
        <div style={{ height: 6 }} />
        <BarChart bars={bars} formatValue={formatMoney} ariaLabel="Simulated P&L by volatility bucket" onBarClick={(bar) => { const index = data.volatility.findIndex((row) => row.id === bar.id); const point = data.equity[Math.min(index, data.equity.length - 1)]; if (point) onSelect({ timestampNs: point.timestampNs }) }} />
        <Panel title="VOLATILITY BUCKETS (SIMULATED)" bodyStyle={{ padding: 0 }}>
          <DataTable rows={data.volatility} rowKey={(row) => row.id} ariaLabel="Simulated volatility bucket metrics" columns={[
            { key: 'bucket', header: 'Bucket', render: (row) => row.label },
            { key: 'pnl', header: 'P&L', render: (row) => <span className={valueClass(row.pnl)}>{formatMoney(row.pnl)}</span> },
            { key: 'fill', header: 'Fill rate', render: (row) => formatPercent(row.fillRate, 1) },
            { key: 'spread', header: 'Spread captured', render: (row) => formatNumber(row.spreadCaptured, 3) },
            { key: 'adverse', header: 'Adverse', render: (row) => <span className="neg">{formatMoney(row.adverseSelection)}</span> },
            { key: 'drawdown', header: 'Drawdown', render: (row) => <span className="neg">{formatPercent(row.drawdown, 2)}</span> },
          ]} />
        </Panel>
        <ViewNote>Simulated percentile buckets are used consistently for the displayed research view. Estimator selection changes the analysis label only in this mock surface.</ViewNote>
      </ContextPanel>
    </ViewStack>
  )
}

function LiquidityView({ data, selectedTimestampNs, onSelect }: AnalyticsViewProps) {
  const [depth, setDepth] = useState(10)
  const bars = data.liquidity.map((row) => ({ id: row.id, label: row.depth, value: row.pnl }))
  return (
    <ViewStack>
      <ContextHeader data={data} selectedTimestampNs={selectedTimestampNs} />
      <ContextPanel title="LIQUIDITY ANALYSIS">
        <SliderField label="Depth window" value={depth} min={1} max={25} step={1} unit=" levels" description="Select a simulated depth lens; the available mock buckets remain visible." onChange={setDepth} />
        <BarChart bars={bars} formatValue={formatMoney} ariaLabel="Simulated P&L by liquidity depth" onBarClick={(bar) => { const index = data.liquidity.findIndex((row) => row.id === bar.id); const point = data.equity[Math.min(index, data.equity.length - 1)]; if (point) onSelect({ timestampNs: point.timestampNs }) }} />
        <Panel title="LIQUIDITY BUCKETS (SIMULATED)" bodyStyle={{ padding: 0 }}>
          <DataTable rows={data.liquidity} rowKey={(row) => row.id} ariaLabel="Simulated liquidity metrics" columns={[
            { key: 'depth', header: 'Depth', render: (row) => row.depth },
            { key: 'spread', header: 'Spread', render: (row) => formatNumber(row.spread, 3) },
            { key: 'density', header: 'Density', render: (row) => formatNumber(row.density, 2) },
            { key: 'volume', header: 'Volume', render: (row) => row.tradeVolume.toLocaleString() },
            { key: 'frequency', header: 'Frequency', render: (row) => row.tradeFrequency.toFixed(1) },
            { key: 'fill', header: 'Fill rate', render: (row) => formatPercent(row.fillRate, 1) },
          ]} />
        </Panel>
        <ViewNote>Depth, spread, density, volume, and frequency are deterministic simulated summaries. Select a bucket to commit its representative timestamp.</ViewNote>
      </ContextPanel>
    </ViewStack>
  )
}

function TimeAnalysisView({ data, selectedTimestampNs, onSelect }: AnalyticsViewProps) {
  const [timezone, setTimezone] = useState<'exchange' | 'utc' | 'local'>('exchange')
  const rows = data.time.map((row) => ({ ...row, label: timezone === 'utc' ? row.label : timezone === 'local' ? `${row.hour.toString().padStart(2, '0')}:00 local` : `${row.hour.toString().padStart(2, '0')}:00 exchange` }))
  const bars = rows.map((row) => ({ id: row.id, label: row.label, value: row.pnl, timestampNs: row.timestampNs }))
  return (
    <ViewStack>
      <ContextHeader data={data} selectedTimestampNs={selectedTimestampNs} />
      <ContextPanel title="TIME ANALYSIS">
        <SelectField label="Timezone lens" value={timezone} options={[{ value: 'exchange', label: 'Exchange local (mock)' }, { value: 'utc', label: 'UTC' }, { value: 'local', label: 'User local' }]} onChange={setTimezone} description="The selected result is a simulated UTC scenario; timezone is a display lens." />
        <BarChart bars={bars} formatValue={formatMoney} ariaLabel="Simulated P&L by time bucket" onBarClick={(bar) => { const row = rows.find((item) => item.id === bar.id); if (row) onSelect({ timestampNs: row.timestampNs }) }} />
        <Panel title="INTRADAY METRICS (SIMULATED)" bodyStyle={{ padding: 0 }}>
          <DataTable rows={rows} rowKey={(row) => row.id} ariaLabel="Simulated intraday analytics" columns={[
            { key: 'time', header: 'Bucket', render: (row) => <button type="button" style={tableButtonStyle} onClick={() => onSelect({ timestampNs: row.timestampNs })}>{row.label}</button> },
            { key: 'pnl', header: 'P&L', render: (row) => <span className={valueClass(row.pnl)}>{formatMoney(row.pnl)}</span> },
            { key: 'fill', header: 'Fill rate', render: (row) => formatPercent(row.fillRate, 1) },
            { key: 'spread', header: 'Spread', render: (row) => formatNumber(row.spread, 3) },
            { key: 'volatility', header: 'Volatility', render: (row) => formatNumber(row.volatility, 3) },
            { key: 'adverse', header: 'Adverse', render: (row) => <span className="neg">{formatMoney(row.adverseSelection)}</span> },
          ]} />
        </Panel>
        <ViewNote>All time buckets are simulated. Clicking a bucket routes its representative timestamp to the shared workspace.</ViewNote>
      </ContextPanel>
    </ViewStack>
  )
}

function StrategyComparisonView({ data, selectedTimestampNs, onExperimentSelect, onSelect }: AnalyticsViewProps) {
  const defaultIds = data.comparison.slice(0, Math.min(2, data.comparison.length)).map((row) => row.id)
  const [selectedIds, setSelectedIds] = useState<string[]>(defaultIds)
  const activeRows = data.comparison.filter((row) => selectedIds.includes(row.id))
  const rows = activeRows.length > 0 ? activeRows : data.comparison.slice(0, 2)
  const colors = ['var(--color-info)', 'var(--color-warning)', 'var(--color-positive)', 'var(--color-negative)']
  const series = rows.map((row, index) => ({
    id: row.id,
    label: row.strategy,
    color: colors[index % colors.length],
    points: row.equity.map((point) => ({ timestampNs: point.timestampNs, value: (point.capital - data.result.headline.initialCapital) / data.result.headline.initialCapital * 100 })),
  }))
  const toggle = (id: string) => setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  return (
    <ViewStack>
      <ContextHeader data={data} selectedTimestampNs={selectedTimestampNs} />
      <ContextPanel title="STRATEGY COMPARISON">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          {data.comparison.map((row) => <button key={row.id} type="button" aria-pressed={selectedIds.includes(row.id)} onClick={() => toggle(row.id)} style={{ ...compactButton, background: selectedIds.includes(row.id) ? 'var(--color-bg-control)' : 'transparent', color: selectedIds.includes(row.id) ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>{row.strategy}</button>)}
        </div>
        <MultiLineChart series={series} ariaLabel="Overlaid simulated equity curves for strategy comparison" />
        <Panel title="SIDE-BY-SIDE METRICS (SIMULATED)" bodyStyle={{ padding: 0 }}>
          <DataTable rows={rows} rowKey={(row) => row.id} ariaLabel="Strategy comparison metrics" columns={[
            { key: 'strategy', header: 'Experiment', render: (row) => <button type="button" style={tableButtonStyle} onClick={() => onExperimentSelect?.(row.id)}>{row.strategy} · {row.id}</button> },
            { key: 'return', header: 'Return', render: (row) => <span className={valueClass(row.returnPct)}>{formatPercent(row.returnPct)}</span> },
            { key: 'drawdown', header: 'Max drawdown', render: (row) => <span className="neg">{formatPercent(row.maxDrawdownPct)}</span> },
            { key: 'fill', header: 'Fill rate', render: (row) => formatPercent(row.fillRatePct, 1) },
            { key: 'fees', header: 'Fees', render: (row) => formatMoney(row.fees) },
            { key: 'slippage', header: 'Slippage', render: (row) => formatMoney(row.slippage) },
            { key: 'latency', header: 'p90 latency', render: (row) => `${formatNumber(percentile(row.latency.map((item) => item.total), 0.9), 2)}ms` },
            { key: 'action', header: 'Open', render: (row) => <button type="button" style={quietButton} onClick={() => { onExperimentSelect?.(row.id); const point = row.equity[Math.floor(row.equity.length / 2)]; if (point) onSelect({ timestampNs: point.timestampNs }) }}>SELECT</button> },
          ]} />
        </Panel>
        <ViewNote>Side-by-side simulated differences are shown without an automatic winner badge or ranking score. Select an experiment to make it the active result context.</ViewNote>
      </ContextPanel>
    </ViewStack>
  )
}

export function renderAnalyticsView(view: AnalyticsViewId, props: AnalyticsViewProps): ReactNode {
  if (view === 'equity') return <EquityCurveView {...props} />
  if (view === 'drawdown') return <DrawdownView {...props} />
  if (view === 'attribution') return <AttributionView {...props} />
  if (view === 'trades') return <TradeAnalysisView {...props} />
  if (view === 'fills') return <FillAnalysisView {...props} />
  if (view === 'adverse') return <AdverseSelectionView {...props} />
  if (view === 'slippage') return <SlippageView {...props} />
  if (view === 'queue') return <QueueView {...props} />
  if (view === 'latency') return <LatencyView {...props} />
  if (view === 'imbalance') return <ImbalanceView {...props} />
  if (view === 'volatility') return <VolatilityView {...props} />
  if (view === 'liquidity') return <LiquidityView {...props} />
  if (view === 'time') return <TimeAnalysisView {...props} />
  return <StrategyComparisonView {...props} />
}
