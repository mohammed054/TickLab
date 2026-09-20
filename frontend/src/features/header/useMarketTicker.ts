import { useEffect, useRef, useState } from 'react'
import { GATEWAY_WS_URL } from '../../shared/sync-bus'

/** Top-of-book / 24h stats delivered on market.{symbol}.ticker (docs/15 §15.3). */
export interface TickerState {
  lastPrice: number | null
  changePct24h: number | null
  bid: number | null
  ask: number | null
  high24h: number | null
  low24h: number | null
  volume24hUsd: number | null
  /** 'connecting' before the first frame, 'live' while frames arrive, 'down' after a drop. */
  status: 'connecting' | 'live' | 'down'
}

const STALE_AFTER_MS = 10_000

/**
 * Subscribes to market.{symbol}.ticker on the gateway WS (docs/15 §15.3).
 * The Block 2.8 gateway answers market.* subscribes with an `unknown_topic` wire
 * error ("market.* topics arrive with later phases"), so until that phase lands
 * every field stays null and the header renders "—" per docs/14 §14.7 — never a
 * fabricated placeholder number. No code changes are needed here when the topic
 * goes live: the first ticker frame flips status to 'live' automatically.
 */
export function useMarketTicker(symbol: string): TickerState {
  const [state, setState] = useState<TickerState>({
    lastPrice: null,
    changePct24h: null,
    bid: null,
    ask: null,
    high24h: null,
    low24h: null,
    volume24hUsd: null,
    status: 'connecting'
  })
  const lastFrameAt = useRef(0)
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    let cancelled = false
    let staleTimer: ReturnType<typeof setInterval> | undefined

    setState({
      lastPrice: null,
      changePct24h: null,
      bid: null,
      ask: null,
      high24h: null,
      low24h: null,
      volume24hUsd: null,
      status: 'connecting'
    })
    lastFrameAt.current = 0

    try {
      const ws = new WebSocket(GATEWAY_WS_URL)
      wsRef.current = ws

      ws.onopen = () => {
        if (cancelled) { ws.close(); return }
        ws.send(JSON.stringify({ action: 'subscribe', topic: `market.${symbol}.ticker` }))
      }

      ws.onmessage = (event) => {
        if (cancelled) return
        try {
          const msg = JSON.parse(event.data)
          const payload = msg.ticker ?? msg.payload ?? msg.data
          if (msg.topic === `market.${symbol}.ticker` && payload && typeof payload === 'object') {
            lastFrameAt.current = Date.now()
            setState((s) => ({
              ...s,
              lastPrice: numOrNull(payload.lastPrice),
              changePct24h: numOrNull(payload.changePct24h),
              bid: numOrNull(payload.bid),
              ask: numOrNull(payload.ask),
              high24h: numOrNull(payload.high24h ?? payload.high24H),
              low24h: numOrNull(payload.low24h ?? payload.low24H),
              volume24hUsd: numOrNull(payload.volume24hUsd ?? payload.volumeUsd24h),
              status: 'live'
            }))
          }
          // {error:{code:'...',...}} (e.g. unknown_topic for market.*) is expected
          // pre-market-phase: stay on dashes, no exception surfaces (docs/14 §14.9).
        } catch {
          // Unparseable frame — ignore, keep last state (never crash the header).
        }
      }

      const markDown = () => {
        if (cancelled) return
        setState((s) => (s.status === 'live' && Date.now() - lastFrameAt.current > STALE_AFTER_MS)
          ? { ...s, status: 'down' }
          : s.status === 'connecting' ? { ...s, status: 'down' } : s)
      }
      ws.onclose = markDown
      ws.onerror = markDown
      staleTimer = setInterval(markDown, 2000)
    } catch {
      setState((s) => ({ ...s, status: 'down' }))
    }

    return () => {
      cancelled = true
      if (staleTimer) clearInterval(staleTimer)
      try {
        wsRef.current?.send(JSON.stringify({ action: 'unsubscribe', topic: `market.${symbol}.ticker` }))
      } catch { /* already closed */ }
      wsRef.current?.close()
      wsRef.current = null
    }
  }, [symbol])

  return state
}

function numOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}
