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
import { NewDecisionModal } from './NewDecisionModal';
import { RiskPanel } from './RiskPanel';
import { SummaryCards } from './SummaryCards';
import { UnlinkedTrades } from './UnlinkedTrades';
import { useDecisions } from './useDecisions';

type JTab = 'open' | 'closed' | 'pending' | 'equity';
const TABS: { id: JTab; label: string }[] = [{ id: 'open', label: 'Open' }, { id: 'closed', label: 'Closed' }, { id: 'pending', label: 'Pending' }, { id: 'equity', label: 'Equity' }];

function DecisionList({ account, status, onOpen, openId }: { account: Account; status: 'open' | 'closed' | 'pending'; onOpen: (id: number) => void; openId: number | null }) {
  const { rows, loading } = useDecisions(undefined, { account, status });
  if (!loading && rows.length === 0) return <div className="muted" style={{ padding: 16, fontSize: 12 }}>No {status} decisions for this account.</div>;
  return <DecisionTable rows={rows} onOpen={(d) => onOpen(d.id)} selectedId={openId} />;
}

export default function JournalScreen() {
  const [account, setAccount] = useState<Account>('paper');
  const [tab, setTab] = useState<JTab>('open');
  const [drawer, setDrawer] = useState<{ id: number; fill?: 'entry' | 'exit' } | null>(null);
  const [newFor, setNewFor] = useState<number | null>(null);
  const tick = useStore((s) => s.journalTick);
  const selected = useStore((s) => s.selectedTokenId);
  const pending = useStore((s) => s.pendingDrawer);
  const summary = useInvoke('journal:summary', { account });
  const setRisk = useStore((s) => s.setRisk);
  useEffect(() => { summary.reload(); }, [tick, summary.reload]);
  useEffect(() => { if (summary.data) setRisk(account, summary.data.risk); }, [summary.data, account, setRisk]);
  useIpcEvent('evt:risk-state', (p) => { if (p.account === account) summary.reload(); });
  useEffect(() => {
    if (!pending) return;
    setDrawer({ id: pending.decisionId, ...(pending.fill ? { fill: pending.fill } : {}) });
    useStore.getState().setPendingDrawer(null);
  }, [pending]);
  const exportCsv = async () => {
    const r = await invoke('journal:export', { account });
    toast(r.ok ? `Exported to ${r.value.path}` : r.error.message, r.ok ? 'good' : 'bad');
  };
  const newDecision = () => (selected === null ? toast('Select a launch in the Feed first, then choose New decision.', 'warn') : setNewFor(selected));
  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="row-flex">
        <Segmented options={[{ id: 'paper', label: 'Paper' }, { id: 'real', label: 'Real' }]} value={account} onChange={setAccount} />
        <span className="spacer" />
        <Button variant="primary" onClick={newDecision}>New decision</Button>
        <Button variant="secondary" icon={<Download size={16} strokeWidth={1.5} />} onClick={() => { void exportCsv(); }}>Export CSV</Button>
      </div>
      <SummaryCards s={summary.data} />
      <RiskPanel account={account} risk={summary.data?.risk ?? null} onChanged={summary.reload} />
      <div>
        <Tabs tabs={TABS} active={tab} onChange={setTab} />
        <div style={{ paddingTop: 12 }}>
          {tab === 'equity' ? <EquityTab account={account} /> : <DecisionList account={account} status={tab} onOpen={(id) => setDrawer({ id })} openId={drawer?.id ?? null} />}
        </div>
      </div>
      {account === 'real' ? <UnlinkedTrades /> : null}
      {drawer ? <DecisionDrawer decisionId={drawer.id} {...(drawer.fill ? { initialFill: drawer.fill } : {})} onClose={() => setDrawer(null)} /> : null}
      {newFor !== null ? <NewDecisionModal tokenId={newFor} onClose={() => setNewFor(null)} onCreated={(id, acc) => { if (acc === 'real') setDrawer({ id, fill: 'entry' }); }} /> : null}
    </div>
  );
}
