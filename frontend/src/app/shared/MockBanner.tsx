import { MOCK_DATA_DISCLAIMER } from '../../mock/mockData'

export function MockBanner() {
  return (
    <div className="mock-banner" role="status">
      <span>⚠ MOCK DATA ONLY —</span>
      <span style={{ color: 'var(--text-1)', fontWeight: 400 }}>{MOCK_DATA_DISCLAIMER}</span>
    </div>
  )
}

export function MockTag() {
  return <span className="mock-tag">MOCK</span>
}
