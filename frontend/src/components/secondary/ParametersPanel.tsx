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
      <Panel title="HFT STRATEGY & QUOTING PARAMETERS">
        <SliderField
          label="Quoting Half-Spread"
          value={parameters.spreadTicks}
          min={1}
          max={20}
          step={1}
          unit=" ticks"
          description="Distance from mid price used for the passive quoting band."
          onChange={(value) => setParameters({ spreadTicks: value })}
        />
        <SliderField
          label="Base Order Size"
          value={parameters.orderSize}
          min={0.001}
          max={0.1}
          step={0.001}
          unit=" BTC"
          description="Base quote order size submitted by the strategy engine."
          onChange={(value) => setParameters({ orderSize: value })}
        />
        <SliderField
          label="Requote Interval"
          value={parameters.requoteMs}
          min={10}
          max={500}
          step={10}
          unit="ms"
          description="Minimum cooldown between cancel/replace orders."
          onChange={(value) => setParameters({ requoteMs: value })}
        />
        <SliderField
          label="Inventory Limit"
          value={parameters.inventoryLimit}
          min={0.1}
          max={5}
          step={0.1}
          unit=" BTC"
          description="Hard inventory cap for risk and position damping."
          onChange={(value) => setParameters({ inventoryLimit: value })}
        />
        <SliderField
          label="Inventory Skew Coefficient"
          value={parameters.inventorySkew}
          min={0}
          max={1}
          step={0.05}
          description="Avellaneda-Stoikov inventory skew factor."
          onChange={(value) => setParameters({ inventorySkew: value })}
        />

        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <PresetChips
            ariaLabel="Parameter presets"
            selected={parameters.preset}
            values={[
              { value: 'baseline', label: 'Baseline MM' },
              { value: 'conservative', label: 'Conservative Wide' },
              { value: 'aggressive', label: 'Aggressive Tight' },
            ]}
            onSelect={applyPreset}
          />
          <button
            type="button"
            onClick={reset}
            style={{
              fontSize: 'var(--font-size-2xs)',
              padding: '3px 8px',
              background: 'var(--color-bg-control)',
              color: 'var(--color-text-secondary)',
              border: '1px solid var(--color-border-subtle)',
              borderRadius: 'var(--radius-xs)',
              cursor: 'pointer',
            }}
          >
            RESET DEFAULTS
          </button>
        </div>
      </Panel>

      <Panel title="EXECUTION & SIMULATION MODEL">
        <NumericField
          label="Maker Fee Tier"
          value={parameters.makerFee}
          min={-1}
          max={1}
          step={0.001}
          unit="%"
          description="Rebate or cost for passive resting fills."
          onChange={(value) => setParameters({ makerFee: value })}
        />
        <NumericField
          label="Taker Fee Tier"
          value={parameters.takerFee}
          min={0}
          max={1}
          step={0.001}
          unit="%"
          description="Exchange fee for aggressive orders."
          onChange={(value) => setParameters({ takerFee: value })}
        />
        <SelectField
          label="Hardware Latency Model"
          value={parameters.latencyModel}
          options={[
            { value: 'fixed', label: 'Fixed (Empirical 200μs)' },
            { value: 'empirical', label: 'Empirical Jitter (Logged)' },
            { value: 'custom', label: 'Custom Distribution (L3 Tail)' },
          ]}
          onChange={(value) => setParameters({ latencyModel: value })}
        />
        <SelectField
          label="Queue Priority Model"
          value={parameters.queueModel}
          options={[
            { value: 'risk-averse', label: 'FIFO Conservative (Risk-Averse)' },
            { value: 'power-2.0', label: 'Power Law Depth (2.0)' },
            { value: 'probabilistic', label: 'Probabilistic Fill Model' },
          ]}
          onChange={(value) => setParameters({ queueModel: value })}
        />
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 'var(--font-size-xs)',
            color: 'var(--color-text-secondary)',
            marginTop: 4,
            cursor: 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={parameters.allowPartialFills}
            onChange={(event) => setParameters({ allowPartialFills: event.target.checked })}
          />
          <span>Allow partial fills on large block events</span>
        </label>
      </Panel>
    </div>
  )
}
