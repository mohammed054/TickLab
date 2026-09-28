import { useState, useRef } from 'react'
import {
  DATASET_DATA_TYPES,
  DATASET_EXCHANGES,
  mockDatasetStore,
} from '../../mock/datasets/datasetCatalog'
import type { DatasetDataType } from '../../mock/datasets/datasetCatalog'

interface ImportDatasetModalProps {
  isOpen: boolean
  onClose: () => void
  onImportSuccess: (datasetId: string) => void
}

export function ImportDatasetModal({ isOpen, onClose, onImportSuccess }: ImportDatasetModalProps) {
  const [name, setName] = useState('Binance BTC/USDT High-Res L2 (Custom)')
  const [exchange, setExchange] = useState('binance-futures')
  const [market, setMarket] = useState('usdt-futures')
  const [symbol, setSymbol] = useState('BTCUSDT')
  const [startDate, setStartDate] = useState('2024-08-08')
  const [startTime, setStartTime] = useState('00:00:00')
  const [endDate, setEndDate] = useState('2024-08-09')
  const [endTime, setEndTime] = useState('23:59:59')
  const [dataTypes, setDataTypes] = useState<DatasetDataType[]>(['trades', 'l2_order_book', 'snapshots'])
  const [tickSize, setTickSize] = useState(0.1)
  const [lotSize, setLotSize] = useState(0.001)
  const [fileSizeBytes, setFileSizeBytes] = useState(4_200_000_000)
  const [eventCount, setEventCount] = useState(24_850_000)
  const [sourceFileName, setSourceFileName] = useState('')
  const [filePreview, setFilePreview] = useState<string[]>([])
  const [qualityProfile, setQualityProfile] = useState<'green' | 'yellow' | 'red'>('green')
  const fileInputRef = useRef<HTMLInputElement>(null)

  if (!isOpen) return null

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setSourceFileName(file.name)
    setFileSizeBytes(file.size || 1_850_000_000)
    
    // Auto-detect symbol and exchange from filename if possible
    const upper = file.name.toUpperCase()
    if (upper.includes('BTC')) setSymbol('BTCUSDT')
    else if (upper.includes('ETH')) setSymbol('ETHUSDT')
    else if (upper.includes('SOL')) setSymbol('SOLUSDT')

    if (upper.includes('BYBIT')) setExchange('bybit')
    else if (upper.includes('BINANCE')) setExchange('binance-futures')
    else if (upper.includes('COINBASE')) setExchange('coinbase')

    // Read initial text preview
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      if (text) {
        const lines = text.split(/\r?\n/).slice(0, 8).filter(Boolean)
        setFilePreview(lines)
        const estimatedEvents = Math.max(10_000, Math.round(file.size / 64))
        setEventCount(estimatedEvents)
      }
    }
    reader.readAsText(file.slice(0, 8192))
  }

  const handleImport = () => {
    const record = mockDatasetStore.importCustomDataset({
      name,
      exchange,
      market,
      symbol,
      startDate,
      endDate,
      startTime,
      endTime,
      dataTypes,
      fileSizeBytes,
      eventCount,
      tickSize,
      lotSize,
      sourceFileName: sourceFileName || `${symbol}_custom_ticks.csv`,
      qualityProfile,
    })

    onImportSuccess(record.id)
    onClose()
  }

  const toggleDataType = (type: DatasetDataType) => {
    if (dataTypes.includes(type)) {
      if (dataTypes.length > 1) setDataTypes(dataTypes.filter((t) => t !== type))
    } else {
      setDataTypes([...dataTypes, type])
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 9999,
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: 680,
          maxHeight: '90vh',
          background: 'var(--bg-1)',
          border: '1px solid var(--border-focus)',
          borderRadius: 8,
          boxShadow: '0 20px 50px rgba(0,0,0,0.8)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: '12px 16px', background: 'var(--bg-2)', borderBottom: '1px solid var(--border-1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.08em', color: 'var(--color-brand-primary)' }}>
              IMPORT CUSTOM BACKTESTING DATASET
            </div>
            <div className="dim" style={{ fontSize: 10.5, marginTop: 2 }}>
              Ingest raw tick streams, L2/L3 order books, CSV, Parquet, or exchange archive dumps.
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 0,
              color: 'var(--text-2)',
              fontSize: 14,
              cursor: 'pointer',
              padding: 4,
            }}
          >
            ✕
          </button>
        </div>

        {/* Content Body */}
        <div style={{ padding: 16, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* File Upload Drop Area */}
          <div
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: '2px dashed var(--border-focus)',
              borderRadius: 6,
              background: 'var(--bg-0)',
              padding: '16px 20px',
              textAlign: 'center',
              cursor: 'pointer',
              transition: 'background 0.15s ease',
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.parquet,.json,.txt,.gz,.zst"
              style={{ display: 'none' }}
              onChange={handleFileUpload}
            />
            <div style={{ fontSize: 24, marginBottom: 4 }}>📥</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-0)' }}>
              {sourceFileName ? `Selected: ${sourceFileName}` : 'Drag and drop backtest data file, or click to browse'}
            </div>
            <div className="dim mono" style={{ fontSize: 10, marginTop: 4 }}>
              Supports CSV, Parquet, JSON lines, Compressed GZ/ZST (Trades, L2 Delta, L3 MBO)
            </div>
          </div>

          {filePreview.length > 0 && (
            <div style={{ background: 'var(--bg-0)', padding: 10, borderRadius: 4, border: '1px solid var(--border-1)', fontSize: 10.5 }} className="mono">
              <div className="dim" style={{ marginBottom: 4 }}>PARSED SAMPLE PREVIEW:</div>
              {filePreview.map((line, idx) => (
                <div key={idx} style={{ color: 'var(--text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {line}
                </div>
              ))}
            </div>
          )}

          {/* Configuration Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 10.5, color: 'var(--text-2)', marginBottom: 4 }}>
                DATASET ALIAS / LABEL
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={inputStyle}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 10.5, color: 'var(--text-2)', marginBottom: 4 }}>
                SOURCE VENUE / EXCHANGE
              </label>
              <select
                value={exchange}
                onChange={(e) => setExchange(e.target.value)}
                style={inputStyle}
              >
                {DATASET_EXCHANGES.map((ex) => (
                  <option key={ex.value} value={ex.value}>
                    {ex.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 10.5, color: 'var(--text-2)', marginBottom: 4 }}>
                MARKET CONTRACT TYPE
              </label>
              <select
                value={market}
                onChange={(e) => setMarket(e.target.value)}
                style={inputStyle}
              >
                <option value="usdt-futures">USDT Perpetual Futures</option>
                <option value="coinm-futures">COIN-M Inverse Futures</option>
                <option value="spot">Spot Order Book</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 10.5, color: 'var(--text-2)', marginBottom: 4 }}>
                INSTRUMENT SYMBOL
              </label>
              <input
                type="text"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                style={inputStyle}
              />
            </div>
          </div>

          {/* Exact Time Window */}
          <div style={{ background: 'var(--bg-0)', padding: 12, borderRadius: 6, border: '1px solid var(--border-1)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-brand-primary)', marginBottom: 8 }}>
              EXACT SIMULATION TIME WINDOW (UTC)
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 10, color: 'var(--text-2)', marginBottom: 2 }}>
                  START DATE & TIME
                </label>
                <div style={{ display: 'flex', gap: 4 }}>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    style={{ ...inputStyle, flex: 2 }}
                  />
                  <input
                    type="time"
                    step="1"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    style={{ ...inputStyle, flex: 1 }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 10, color: 'var(--text-2)', marginBottom: 2 }}>
                  END DATE & TIME
                </label>
                <div style={{ display: 'flex', gap: 4 }}>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    style={{ ...inputStyle, flex: 2 }}
                  />
                  <input
                    type="time"
                    step="1"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    style={{ ...inputStyle, flex: 1 }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Feed Types Selection */}
          <div>
            <label style={{ display: 'block', fontSize: 10.5, color: 'var(--text-2)', marginBottom: 6 }}>
              INCLUDED FEED STREAMS
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
              {DATASET_DATA_TYPES.map((dt) => {
                const isSelected = dataTypes.includes(dt.value)
                return (
                  <button
                    key={dt.value}
                    type="button"
                    onClick={() => toggleDataType(dt.value)}
                    style={{
                      padding: '6px 8px',
                      borderRadius: 4,
                      border: isSelected ? '1px solid var(--color-brand-primary)' : '1px solid var(--border-1)',
                      background: isSelected ? 'rgba(56, 189, 248, 0.1)' : 'var(--bg-0)',
                      color: isSelected ? 'var(--color-brand-primary)' : 'var(--text-1)',
                      fontSize: 10.5,
                      fontWeight: isSelected ? 600 : 400,
                      textAlign: 'left',
                      cursor: 'pointer',
                    }}
                  >
                    {isSelected ? '✓ ' : '+ '}{dt.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Microstructure Specs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            <div>
              <label style={{ display: 'block', fontSize: 10, color: 'var(--text-2)', marginBottom: 2 }}>
                TICK SIZE (MIN INCREMENT)
              </label>
              <input
                type="number"
                step="0.01"
                value={tickSize}
                onChange={(e) => setTickSize(parseFloat(e.target.value) || 0.1)}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 10, color: 'var(--text-2)', marginBottom: 2 }}>
                LOT SIZE (MIN QTY)
              </label>
              <input
                type="number"
                step="0.001"
                value={lotSize}
                onChange={(e) => setLotSize(parseFloat(e.target.value) || 0.001)}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 10, color: 'var(--text-2)', marginBottom: 2 }}>
                TOTAL EVENT ESTIMATE
              </label>
              <input
                type="number"
                value={eventCount}
                onChange={(e) => setEventCount(parseInt(e.target.value, 10) || 100_000)}
                style={inputStyle}
              />
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div style={{ padding: '12px 16px', background: 'var(--bg-2)', borderTop: '1px solid var(--border-1)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '8px 16px',
              borderRadius: 4,
              border: '1px solid var(--border-1)',
              background: 'var(--bg-0)',
              color: 'var(--text-1)',
              fontSize: 11,
              cursor: 'pointer',
            }}
          >
            CANCEL
          </button>
          <button
            type="button"
            onClick={handleImport}
            style={{
              padding: '8px 20px',
              borderRadius: 4,
              border: 'none',
              background: 'var(--color-brand-primary)',
              color: '#080a0d',
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: '0.04em',
              cursor: 'pointer',
            }}
          >
            INGEST & VALIDATE PIPELINE
          </button>
        </div>
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--bg-0)',
  color: 'var(--text-0)',
  border: '1px solid var(--border-1)',
  borderRadius: 4,
  padding: '6px 8px',
  fontSize: 11,
  fontFamily: 'var(--font-mono)',
  outline: 'none',
}
