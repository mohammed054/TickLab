import { useState } from 'react'
import { Panel } from '../shared/Panel'

function Slider({ label, min, max, step, value, onChange, unit }: any) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
        <span className="dim">{label}</span>
        <span className="mono">
          {value}
          {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(+e.target.value)}
        style={{ width: '100%', accentColor: 'var(--accent)' }}
      />
    </div>
  )
}

export function ParametersPanel() {
  const [spread, setSpread] = useState(5)
  const [orderSize, setOrderSize] = useState(0.01)
  const [requote, setRequote] = useState(50)
  const [invLimit, setInvLimit] = useState(2)
  const [invSkew, setInvSkew] = useState(0.35)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, height: '100%', overflow: 'auto' }}>
      <Panel title="QUOTE PARAMETERS (MOCK)">
        <Slider label="Spread" min={1} max={20} step={1} value={spread} onChange={setSpread} unit=" ticks" />
        <Slider label="Order size" min={0.001} max={0.1} step={0.001} value={orderSize} onChange={setOrderSize} unit=" BTC" />
        <Slider label="Requote interval" min={10} max={500} step={10} value={requote} onChange={setRequote} unit="ms" />
        <Slider label="Inventory limit" min={0.1} max={5} step={0.1} value={invLimit} onChange={setInvLimit} unit=" BTC" />
        <Slider label="Inventory skew" min={0} max={1} step={0.05} value={invSkew} onChange={setInvSkew} unit="" />
      </Panel>
      <Panel title="EXECUTION MODEL (MOCK)">
        {[
          ['Maker fee', '-0.005%'],
          ['Taker fee', '0.020%'],
          ['Tick size', '0.1 USDT'],
          ['Lot size', '0.001 BTC'],
          ['Latency model', 'Empirical'],
          ['Queue model', 'Power(2.0)'],
        ].map(([k, v]) => (
          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', fontSize: 11.5 }}>
            <span className="dim">{k}</span>
            <span className="mono">{v}</span>
          </div>
        ))}
      </Panel>
    </div>
  )
}
