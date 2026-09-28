import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useWorkspace } from '../../state/useWorkspace'
import {
  canRunBacktest,
  formatBytes,
  formatCount,
  formatTimestampNs,
  getAuditRecords,
  getBacktestBlockers,
  getOverallQualityStatus,
  getPipelineStatusLabel,
  getQualityChecks,
  getQualityVisualState,
  getSelectedRecord,
  getStatusVisualState,
  mockDatasetStore,
  useMockDatasetStore,
} from '../../mock/datasets/datasetCatalog'
import type { DatasetOverrideRecord, QualityCheck } from '../../mock/datasets/datasetCatalog'
import { AttributionBadge, DataTable, EmptyState, ErrorState, LoadingState, MetricRow, Panel, StatusDot } from '../shared/Panel'
import type { DataColumn } from '../shared/Panel'
import { useFocusTrap } from '../../shared/hooks/useFocusTrap'

export function DataQualityPanel() {
  const store = useMockDatasetStore()
  const [, updateWorkspace] = useWorkspace()
  const [overrideCheckId, setOverrideCheckId] = useState<QualityCheck['id'] | null>(null)
  const [justification, setJustification] = useState('')
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeDialog = useCallback(() => setOverrideCheckId(null), [])
  useFocusTrap(Boolean(overrideCheckId), dialogRef, closeDialog)
  const activeRecord = getSelectedRecord(store)
  const checks = activeRecord ? getQualityChecks(activeRecord) : []
  const dialogCheck = checks.find((check) => check.id === overrideCheckId)

  useEffect(() => {
    setJustification('')
  }, [overrideCheckId])

  if (!activeRecord) {
    return (
      <div style={{ height: '100%', overflow: 'auto' }}>
        <Panel title="DATA QUALITY AUDIT">
          <EmptyState
            icon="🛡"
            title="NO DATASET SELECTED"
            description="Select a market depth dataset in the Data hub before reviewing quality gate checks."
          />
        </Panel>
      </div>
    )
  }

  const overallStatus = getOverallQualityStatus(activeRecord)
  const blockers = getBacktestBlockers(activeRecord)
  const canRun = canRunBacktest(activeRecord)
  const auditRecords = getAuditRecords(store, activeRecord.id)

  const qualityColumns: DataColumn<QualityCheck>[] = [
    {
      key: 'check',
      header: 'VALIDATION CHECK',
      render: (check) => (
        <div>
          <strong style={{ fontWeight: 600 }}>{check.label}</strong>
          <div className="dim" style={{ fontSize: 'var(--font-size-xs)', marginTop: 2 }}>
            {check.detail}
          </div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'GATE STATUS',
      render: (check) => (
        <QualityValue status={check.status} label={check.overridden ? 'OVERRIDDEN' : check.status.toUpperCase()} />
      ),
    },
    {
      key: 'count',
      header: 'ANOMALIES',
      align: 'right',
      render: (check) => <span className="mono">{formatCount(check.count)}</span>,
    },
    {
      key: 'action',
      header: 'COMPLIANCE',
      align: 'right',
      render: (check) =>
        check.status === 'red' && !check.overridden ? (
          <button
            type="button"
            onClick={() => setOverrideCheckId(check.id)}
            style={{
              padding: '2px 7px',
              fontSize: 'var(--font-size-2xs)',
              color: 'var(--color-text-primary)',
              background: 'var(--color-bg-control)',
              border: '1px solid var(--color-border-subtle)',
              borderRadius: 'var(--radius-xs)',
              cursor: 'pointer',
            }}
          >
            OVERRIDE
          </button>
        ) : check.overridden ? (
          <span className="mono dim" style={{ fontSize: 'var(--font-size-2xs)' }}>
            ACKNOWLEDGED
          </span>
        ) : (
          <span className="dim">—</span>
        ),
    },
  ]

  const auditColumns: DataColumn<DatasetOverrideRecord>[] = [
    {
      key: 'timestamp',
      header: 'TIMESTAMP (UTC)',
      render: (entry) => <span className="mono">{formatTimestampNs(entry.timestampNs)}</span>,
    },
    {
      key: 'action',
      header: 'ACTION',
      render: (entry) => <span className="mono">{entry.action}</span>,
    },
    {
      key: 'object',
      header: 'TARGET',
      render: (entry) => (
        <span className="mono">
          {entry.datasetId} · {entry.checkLabel}
        </span>
      ),
    },
    {
      key: 'actor',
      header: 'OPERATOR',
      render: (entry) => (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)' }}>
          <AttributionBadge kind="human" /> {entry.actor.id}
        </span>
      ),
    },
    {
      key: 'justification',
      header: 'COMPLIANCE JUSTIFICATION',
      render: (entry) => <span style={{ whiteSpace: 'normal' }}>{entry.justification}</span>,
    },
  ]

  const submitOverride = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!dialogCheck || !justification.trim()) return
    mockDatasetStore.overrideQualityCheck(activeRecord.id, dialogCheck.id, justification)
    setOverrideCheckId(null)
    setJustification('')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', height: '100%', overflow: 'auto' }}>
      <Panel
        title="INGESTION PIPELINE STATUS"
        right={
          <span className="mono" style={{ fontSize: 'var(--font-size-xs)' }}>
            <StatusDot state={getStatusVisualState(activeRecord.status)} /> {getPipelineStatusLabel(activeRecord.status)}
          </span>
        }
      >
        {activeRecord.status === 'failed' ? (
          <ErrorState
            title="PIPELINE FAILED"
            message={activeRecord.errorMessage ?? 'Pipeline failed during normalization.'}
            onRetry={() => mockDatasetStore.prepareDataset(activeRecord.id)}
          />
        ) : (
          <LoadingState
            label={`${getPipelineStatusLabel(activeRecord.status)} · ${formatCount(
              activeRecord.processedEvents
            )} / ${formatCount(activeRecord.totalEvents)} events`}
            progress={activeRecord.progress}
          />
        )}
        <MetricRow label="Processing Stage" value={activeRecord.activeStage.toUpperCase()} />
        <MetricRow label="Completion" value={`${activeRecord.progress.toFixed(0)}%`} />
        <MetricRow label="Dataset ID" value={activeRecord.id} />
      </Panel>

      <Panel
        title="DATA QUALITY AUDIT SCORECARD"
        right={<QualityValue status={overallStatus} label={overallStatus.toUpperCase()} />}
      >
        <MetricRow label="Total Market Events" value={formatCount(activeRecord.quality.totalEvents)} />
        <MetricRow label="Trades Recorded" value={formatCount(activeRecord.quality.trades)} />
        <MetricRow label="L2/L3 Order-Book Updates" value={formatCount(activeRecord.quality.orderBookUpdates)} />
        <MetricRow label="Snapshots" value={formatCount(activeRecord.quality.snapshots)} />
        <MetricRow
          label="Missing Time Intervals"
          value={
            <QualityValue
              status={activeRecord.quality.missingIntervals.status}
              label={`${formatCount(activeRecord.quality.missingIntervals.count)} ${activeRecord.quality.missingIntervals.status.toUpperCase()}`}
            />
          }
        />
        <MetricRow
          label="Duplicate Sequence Events"
          value={
            <QualityValue
              status={activeRecord.quality.duplicateEvents.status}
              label={`${formatCount(activeRecord.quality.duplicateEvents.count)} ${activeRecord.quality.duplicateEvents.status.toUpperCase()}`}
            />
          }
        />
        <MetricRow
          label="Sequence Number Gaps"
          value={
            <QualityValue
              status={activeRecord.quality.sequenceGaps.status}
              label={`${formatCount(activeRecord.quality.sequenceGaps.count)} ${activeRecord.quality.sequenceGaps.status.toUpperCase()}`}
            />
          }
        />
        <MetricRow
          label="Coverage Window"
          value={
            <span className="mono">
              {formatTimestampNs(activeRecord.quality.timestampRange[0])} → {formatTimestampNs(activeRecord.quality.timestampRange[1])}
            </span>
          }
        />
        <MetricRow label="Uncompressed Size" value={formatBytes(activeRecord.quality.fileSizeBytes)} />
        <MetricRow label="Exchange Source" value={activeRecord.quality.source} />
        <MetricRow label="Schema Normalization" value={activeRecord.quality.normalizationVersion} />
        <MetricRow label="Tick / Lot Precision" value={`${activeRecord.quality.tickSize} / ${activeRecord.quality.lotSize}`} />
      </Panel>

      <Panel title="QUANTITATIVE QUALITY GATE CHECKS">
        <DataTable
          rows={checks}
          columns={qualityColumns}
          rowKey={(check) => check.id}
          ariaLabel="Dataset quality checks"
          emptyState="No quality checks are available."
        />
      </Panel>

      <Panel title="SIMULATION GATE DISPATCH">
        <div
          role={blockers.length > 0 ? 'alert' : 'status'}
          style={{
            color: blockers.length > 0 ? 'var(--color-negative)' : 'var(--color-positive)',
            fontSize: 'var(--font-size-sm)',
            fontWeight: 600,
            lineHeight: 1.45,
          }}
        >
          {blockers.length > 0 ? 'BACKTEST ACCESS BLOCKED BY QUALITY GATE' : 'DATA QUALITY GATE PASSED — READY'}
        </div>
        {blockers.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', marginTop: 'var(--space-2)' }}>
            {blockers.map((blocker) => (
              <div key={blocker} style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-xs)' }}>
                {blocker}
              </div>
            ))}
          </div>
        )}
        <button
          type="button"
          disabled={!canRun}
          onClick={() => updateWorkspace({ activeTab: { secondaryMonitor: 'backtest' } })}
          style={{
            marginTop: 'var(--space-3)',
            width: '100%',
            padding: '8px 10px',
            borderRadius: 'var(--radius-xs)',
            border: '1px solid var(--color-info)',
            background: canRun ? 'var(--color-info)' : 'var(--color-bg-control)',
            color: canRun ? 'var(--color-bg-base)' : 'var(--color-text-disabled)',
            fontWeight: 700,
            fontSize: 'var(--font-size-sm)',
            cursor: canRun ? 'pointer' : 'not-allowed',
          }}
        >
          {canRun ? 'PROCEED TO BACKTEST STUDIO' : 'BACKTEST BLOCKED'}
        </button>
      </Panel>

      <Panel title={`AUDIT OVERRIDE RECORD (${auditRecords.length})`}>
        <DataTable
          rows={auditRecords}
          columns={auditColumns}
          rowKey={(entry) => entry.id}
          ariaLabel="Data quality override audit records"
          emptyState="No override records for this dataset."
        />
      </Panel>

      {dialogCheck && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 'var(--space-4)',
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(2px)',
          }}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="quality-override-title"
            tabIndex={-1}
            style={{
              width: 'min(520px, 100%)',
              background: 'var(--color-bg-panel)',
              border: '1px solid var(--color-border-strong)',
              borderRadius: 'var(--radius-md)',
              padding: 'var(--space-4)',
              boxShadow: 'var(--shadow-dropdown)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 'var(--space-3)',
                marginBottom: 'var(--space-3)',
              }}
            >
              <strong id="quality-override-title" style={{ fontSize: 'var(--font-size-md)' }}>
                OVERRIDE QUALITY GATE CHECK
              </strong>
              <StatusDot state="bad" />
            </div>
            <div className="dim" style={{ fontSize: 'var(--font-size-xs)', marginBottom: 'var(--space-3)' }}>
              Dataset: <span className="mono">{activeRecord.id}</span>
              <br />
              Check: <span className="mono">{dialogCheck.label}</span> · {formatCount(dialogCheck.count)} affected events
            </div>
            <form onSubmit={submitOverride}>
              <label
                htmlFor="quality-override-justification"
                style={{
                  display: 'block',
                  color: 'var(--color-text-secondary)',
                  fontSize: 'var(--font-size-sm)',
                  marginBottom: 'var(--space-1)',
                }}
              >
                Compliance Justification <span style={{ color: 'var(--color-negative)' }}>*</span>
              </label>
              <textarea
                id="quality-override-justification"
                value={justification}
                onChange={(event) => setJustification(event.target.value)}
                required
                rows={4}
                autoFocus
                placeholder="Document quantitative rationale for overriding this quality check…"
                style={{
                  width: '100%',
                  resize: 'vertical',
                  background: 'var(--color-bg-base)',
                  color: 'var(--color-text-primary)',
                  border: '1px solid var(--color-border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  padding: 'var(--space-2)',
                  lineHeight: 1.45,
                }}
              />
              <div
                style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', marginTop: 'var(--space-4)' }}
              >
                <button
                  type="button"
                  onClick={() => setOverrideCheckId(null)}
                  style={{
                    padding: '6px 12px',
                    background: 'var(--color-bg-control)',
                    color: 'var(--color-text-primary)',
                    border: '1px solid var(--color-border-subtle)',
                    borderRadius: 'var(--radius-xs)',
                    fontSize: 'var(--font-size-sm)',
                    cursor: 'pointer',
                  }}
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  disabled={!justification.trim()}
                  style={{
                    padding: '6px 12px',
                    background: 'var(--color-negative)',
                    color: 'var(--color-text-primary)',
                    border: '1px solid var(--color-negative)',
                    borderRadius: 'var(--radius-xs)',
                    fontSize: 'var(--font-size-sm)',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  SUBMIT OVERRIDE AUDIT
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

function QualityValue({ status, label }: { status: 'green' | 'yellow' | 'red'; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)' }}>
      <StatusDot state={getQualityVisualState(status)} /> <span className="mono">{label}</span>
    </span>
  )
}
