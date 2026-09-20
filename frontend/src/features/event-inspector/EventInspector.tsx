import { useWorkspaceContext } from '../../shared/sync-bus'

export interface EventEvent {
  type: 'OrderAdd' | 'OrderModify' | 'OrderCancel' | 'Trade' | 'Snapshot' | 'StrategyDecision'
  timestamp: number
  price?: number
  size?: number
  side?: 'bid' | 'ask' | 'buy' | 'sell'
  orderId?: string
  sideId?: string
  sequence?: number
  marketState?: {
    bids: Array<[price: number, size: number]>
    asks: Array<[price: number, size: number]>
  }
  strategyState?: {
    inventory: number
    position: number
    equity: number
  }
}

export const EventInspector: React.FC = () => {
  const {
    timestamp,
    selectedTradeId,
    selectedOrderId,
    selectedFillId,
    experiment,
  } = useWorkspaceContext()

  // In a full implementation, this would fetch the raw event from the backend
  // For now, we render a placeholder with the timestamp and context
  const event: EventEvent = {
    type: 'Trade',
    timestamp: timestamp || Date.now(),
  }

  return (
    <div className="event-inspector">
      <h3>Event Inspector</h3>
      <div className="event-details">
        <p>Timestamp: {new Date(event.timestamp).toISOString()}</p>
        <p>Type: {event.type}</p>
        {event.orderId && <p>Order ID: {event.orderId}</p>}
        {event.side && <p>Side: {event.side}</p>}
        {event.price !== undefined && <p>Price: {event.price}</p>}
        {event.size !== undefined && <p>Size: {event.size}</p>}
        {event.marketState && (
          <div>
            <p>Best Bid: {event.marketState.bids[0]?.[0]}</p>
            <p>Best Ask: {event.markState.asks[0]?.[0]}</p>
          </div>
        )}
        {event.strategyState && (
          <div>
            <p>Inventory: {event.strategyState.inventory}</p>
            <p>Position: {event.strategyState.position}</p>
            <p>Equity: {event.strategyState.equity}</p>
          </div>
        )}
      </div>
      <div className="event-nav">
        <button>⏪ Prev Event</button>
        <button>Next Event ⏩</button>
      </div>
      <div className="event-actions">
        <button>view raw event</button>
      </div>
    </div>
  )
}