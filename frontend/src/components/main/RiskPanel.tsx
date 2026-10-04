import type { RuntimeSnapshot } from '../../contracts'
import { fmtBtc, fmtInt, fmtUsdWhole } from '../../shared/format'
import { evaluateRisk, RiskLine } from '../../shared/risk'
import { MMPanel, UsageBar } from './mm'

function formatLine(line: RiskLine): { current: string; limit: string } {
  switch (line.key) {
    case 'position':
      return { current: fmtBtc(line.current), limit: fmtBtc(line.limit) }
    case 'loss':
    case 'notional':
      return { current: fmtUsdWhole(line.current), limit: fmtUsdWhole(line.limit) }
    case 'drawdown':
      return { current: `${line.current.toFixed(2)}%`, limit: `${line.limit.toFixed(2)}%` }
    case 'rate':
      return { current: `${line.current.toFixed(1)}/s`, limit: `${fmtInt(line.limit)}/s` }
    default:
      return { current: fmtInt(line.current), limit: fmtInt(line.limit) }
  }
}

/** Every row is "current / limit" with usage, so one glance shows what is close to breaching. */
export function RiskPanel({ runtime, mid }: { runtime: RuntimeSnapshot; mid: number }) {
  const risk = evaluateRisk(runtime.strategy, runtime.riskLimits, runtime.initialCapital, mid, runtime.orderRatePerSec)
  const tone = risk.level === 'breach' || runtime.strategy.halted ? 'neg' : risk.level === 'warn' ? 'warn' : 'pos'
  return (
    <MMPanel title="Risk" right={<span className={tone}>{risk.label}</span>}>
      {runtime.strategy.halted && (
        <div className="neg" style={{ padding: '2px 0 4px' }}>{runtime.strategy.halted}. Quoting stopped.</div>
      )}
      <div className="mm-cols">
        <span className="h">Limit</span>
        <span className="h">Used / max</span>
        <span className="h" />
        {risk.lines.map((line) => {
          const text = formatLine(line)
          return (
            <RiskRow key={line.key} name={line.label} text={`${text.current} / ${text.limit}`} usage={line.usage} level={line.level} />
          )
        })}
      </div>
    </MMPanel>
  )
}

function RiskRow({ name, text, usage, level }: { name: string; text: string; usage: number; level: RiskLine['level'] }) {
  return (
    <>
      <span className="c name">{name}</span>
      <span className={`c num ${level === 'breach' ? 'neg' : level === 'warn' ? 'warn' : ''}`}>{text}</span>
      <span className="c"><UsageBar usage={usage} level={level} /></span>
    </>
  )
}
