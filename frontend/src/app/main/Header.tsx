import { useEffect, useState } from 'react'
import { StatusDot } from '../shared/Panel'
import { MockTag } from '../shared/MockBanner'

export function Header({ price, changePct, bid, ask }: { price: number; changePct: number; bid: number; ask: number }) {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 250)
    return () => clearInterval(id)
  }, [])
  const spread = +(ask - bid).toFixed(1)
  const utc = now.toISOString().slice(11, 23)

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 24,
        padding: '8px 14px',
        background: 'var(--bg-1)',
        borderBottom: '1px solid var(--border-1)',
        flex: '0 0 auto',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <strong style={{ fontSize: 15 }}>BTC/USDT</strong>
        <span className="mono" style={{ fontSize: 20, fontWeight: 700 }}>
          ${price.toLocaleString(undefined, { maximumFractionDigits: 1 })}
        </span>
        <span className={`mono ${changePct >= 0 ? 'pos' : 'neg'}`}>
          {changePct >= 0 ? '+' : ''}
          {changePct.toFixed(2)}%
        </span>
        <MockTag />
      </div>

      <div className="mono dim" style={{ display: 'flex', gap: 16, fontSize: 11.5 }}>
        <span>
          BID <span className="pos">{bid.toFixed(1)}</span>
        </span>
        <span>
          ASK <span className="neg">{ask.toFixed(1)}</span>
        </span>
        <span>
          SPREAD {spread} <span className="dim">(1 tick)</span>
        </span>
        <span>24H HIGH 113,902</span>
        <span>24H LOW 109,817</span>
        <span>24H VOL $42.8B</span>
      </div>

      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 14 }} className="mono dim">
        <span>
          <StatusDot state="warn" /> MARKET DATA (SIMULATED)
        </span>
        <span>
          <StatusDot state="off" /> EXCHANGE (NOT CONNECTED)
        </span>
        <span>LATENCY 18.4ms</span>
        <span>UTC {utc}</span>
      </div>
    </div>
  )
}
