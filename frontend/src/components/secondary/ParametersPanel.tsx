import { NumericField, Panel, PresetChips, SelectField, SliderField } from '../shared/Panel'
import { resetStrategyParameters, useStrategyParameters } from '../../state/parameterStore'

export function ParametersPanel() {
  const [parameters, setParameters] = useStrategyParameters()

  const applyPreset = (value: string) => {
    if (value === 'conservative') setParameters({ preset: value, spreadTicks: 8, orderSize: 0.005, inventorySkew: 0.2 })
    else if (value === 'aggressive') setParameters({ preset: value, spreadTicks: 3, orderSize: 0.02, inventorySkew: 0.5 })
    else setParameters({ preset: value, spreadTicks: 5, orderSize: 0.01, inventorySkew: 0.35 })
  }

  const reset = () => resetStrategyParameters()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, height: '100%', overflow: 'auto' }}>
      <Panel title="QUOTE PARAMETERS (MOCK)">
        <SliderField label="Spread" value={parameters.spreadTicks} min={1} max={20} step={1} unit=" ticks" description="Distance from mid used for the strategy quote." onChange={(value) => setParameters({ spreadTicks: value })} />
        <SliderField label="Order size" value={parameters.orderSize} min={0.001} max={0.1} step={0.001} unit=" BTC" description="Base quote size submitted by the strategy." onChange={(value) => setParameters({ orderSize: value })} />
        <SliderField label="Requote interval" value={parameters.requoteMs} min={10} max={500} step={10} unit="ms" description="Minimum time between quote updates." onChange={(value) => setParameters({ requoteMs: value })} />
        <SliderField label="Inventory limit" value={parameters.inventoryLimit} min={0.1} max={5} step={0.1} unit=" BTC" description="Maximum inventory used for skew and risk checks." onChange={(value) => setParameters({ inventoryLimit: value })} />
        <SliderField label="Inventory skew" value={parameters.inventorySkew} min={0} max={1} step={0.05} description="Inventory-based skew strength." onChange={(value) => setParameters({ inventorySkew: value })} />
        <PresetChips ariaLabel="Parameter presets" selected={parameters.preset} values={[{ value: 'baseline', label: 'Baseline' }, { value: 'conservative', label: 'Conservative' }, { value: 'aggressive', label: 'Aggressive' }]} onSelect={applyPreset} />
        <button type="button" onClick={reset} style={{ marginTop: 6, fontSize: 10.5, padding: '4px 8px', background: 'var(--color-bg-control)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-sm)' }}>RESET TO DEFAULTS</button>
      </Panel>
      <Panel title="EXECUTION MODEL (MOCK)">
        <NumericField label="Maker fee" value={parameters.makerFee} min={-1} max={1} step={0.001} unit="%" onChange={(value) => setParameters({ makerFee: value })} />
        <NumericField label="Taker fee" value={parameters.takerFee} min={0} max={1} step={0.001} unit="%" onChange={(value) => setParameters({ takerFee: value })} />
        <SelectField label="Latency model" value={parameters.latencyModel} options={[{ value: 'fixed', label: 'Fixed' }, { value: 'empirical', label: 'Empirical' }, { value: 'custom', label: 'Custom distribution' }]} onChange={(value) => setParameters({ latencyModel: value })} />
        <SelectField label="Queue model" value={parameters.queueModel} options={[{ value: 'risk-averse', label: 'Risk averse' }, { value: 'power-2.0', label: 'Power (2.0)' }, { value: 'probabilistic', label: 'Probabilistic' }]} onChange={(value) => setParameters({ queueModel: value })} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--color-text-muted)' }}><input type="checkbox" checked={parameters.allowPartialFills} onChange={(event) => setParameters({ allowPartialFills: event.target.checked })} /> Allow partial fills</label>
      </Panel>
    </div>
  )
}
