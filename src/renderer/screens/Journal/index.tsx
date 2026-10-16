// Legacy Archive — read-only journal (docs/09-research-system.md §9.9, T1.5).
// No new decision/fill entry, wallet import, or account mutation is possible
// from here. Existing rows are preserved and displayed as-is, labelled legacy.
import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import type { Account } from '@shared/types';
import { Button } from '../../components/Button';
import { Segmented, Tabs } from '../../components/Tabs';
import { toast } from '../../components/Toast';
import { invoke, useInvoke, useIpcEvent } from '../../state/hooks';
import { useStore } from '../../state/store';
import { DecisionDrawer } from './DecisionDrawer';
import { DecisionTable } from './DecisionTable';
import { EquityTab } from './EquityTab';
import { RiskPanel } from './RiskPanel';
import { SummaryCards } from './SummaryCards';
import { useDecisions } from './useDecisions';

type JTab = 'open' | 'closed' | 'pending' | 'equity';
const TABS: { id: JTab; label: string }[] = [
  { id: 'open', label: 'Open' }, { id: 'closed', label: 'Closed' },
  { id: 'pending', label: 'Pending' }, { id: 'equity', label: 'Equity' },
];

function DecisionList({ account, status, onOpen, openId }: { account: Account; status: 'open' | 'closed' | 'pending'; onOpen: (id: number) => void; openId: number | null }) {
  const { rows, loading } = useDecisions(undefined, { account, status });
  if (!loading && rows.length === 0) return <div className="muted" style={{ padding: 16, fontSize: 12 }}>No {status} legacy records for this account.</div>;
  return <DecisionTable rows={rows} onOpen={(d) => onOpen(d.id)} selectedId={openId} />;
}

export default function JournalScreen() {
  const [account, setAccount] = useState<Account>('paper');
  const [tab, setTab] = useState<JTab>('open');
  const [drawer, setDrawer] = useState<number | null>(null);
  const tick = useStore((s) => s.journalTick);
  const summary = useInvoke('journal:summary', { account });
  const setRisk = useStore((s) => s.setRisk);
  useEffect(() => { summary.reload(); }, [tick, summary.reload]);
  useEffect(() => { if (summary.data) setRisk(account, summary.data.risk); }, [summary.data, account, setRisk]);
  useIpcEvent('evt:risk-state', (p) => { if (p.account === account) summary.reload(); });

  const exportCsv = async () => {
    const r = await invoke('journal:export', { account });
    toast(r.ok ? `Exported to ${r.value.path}` : r.error.message, r.ok ? 'good' : 'bad');
  };
  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="row-flex" style={{ alignItems: 'center', gap: 10 }}>
        <span className="meta" style={{ fontWeight: 600, fontSize: 12, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Legacy Archive — read-only</span>
        <span className="spacer" />
        <Segmented options={[{ id: 'paper', label: 'Paper' }, { id: 'real', label: 'Real' }]} value={account} onChange={setAccount} />
        <Button variant="secondary" icon={<Download size={16} strokeWidth={1.5} />} onClick={() => { void exportCsv(); }}>Export CSV</Button>
      </div>
      <div className="panel" style={{ padding: 12 }}>
        <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>Past decisions and fills are retained exactly as recorded. No new records can be created, and nothing here can be edited, voided, or exported into model data.</div>
        <SummaryCards s={summary.data} />
        <RiskPanel account={account} risk={summary.data?.risk ?? null} onChanged={summary.reload} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Tabs tabs={TABS} active={tab} onChange={setTab} />
        <div style={{ paddingTop: 12 }}>
          {tab === 'equity' ? <EquityTab account={account} /> : <DecisionList account={account} status={tab} onOpen={(id) => setDrawer(id)} openId={drawer ?? null} />}
        </div>
      </div>
      {drawer !== null ? <DecisionDrawer decisionId={drawer} onClose={() => setDrawer(null)} /> : null}
    </div>
  );
}
