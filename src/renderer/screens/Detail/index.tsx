import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Tabs } from '../../components/Tabs';
import type { TabItem } from '../../components/Tabs';
import { Spinner } from '../../components/Spinner';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import { ToastHost } from '../../components/Toast';
import { NewDecisionModal } from '../Journal/NewDecisionModal';
import { DecisionDrawer } from '../Journal/DecisionDrawer';
import { invoke, useIpcEvent } from '../../state/hooks';
import { AiTab } from './AiTab';
import { ChartTab } from './ChartTab';
import { Evidence } from './Evidence';
import { Header } from './Header';
import { Holders } from './Holders';
import { JournalTab } from './JournalTab';
import { Overview } from './Overview';
import { Trades } from './Trades';
import { useTokenDetail } from './useTokenDetail';

export type DetailTab = 'overview' | 'evidence' | 'trades' | 'holders' | 'chart' | 'journal' | 'ai';
const TABS: TabItem<DetailTab>[] = [
  { id: 'overview', label: 'Overview' }, { id: 'evidence', label: 'Evidence' }, { id: 'trades', label: 'Trades' }, { id: 'holders', label: 'Holders' },
  { id: 'chart', label: 'Chart' }, { id: 'journal', label: 'Journal' }, { id: 'ai', label: 'AI' },
];

export default function DetailScreen() {
  const params = useParams();
  const fromRoute = params.tokenId && Number.isInteger(Number(params.tokenId)) && Number(params.tokenId) > 0 ? Number(params.tokenId) : null;
  const [tokenId, setTokenId] = useState<number | null>(fromRoute);
  const [pinned, setPinned] = useState(false);
  const [tab, setTab] = useState<DetailTab>('overview');
  const [paper, setPaper] = useState(false);
  const [drawerId, setDrawerId] = useState<number | null>(null);
  useEffect(() => { if (fromRoute !== null) setTokenId(fromRoute); }, [fromRoute]);
  useIpcEvent('evt:detail-selected', (p) => { if (!pinned) setTokenId(p.tokenId); });
  useIpcEvent('evt:pin-changed', (p) => setPinned(p.pinned));
  const { detail, loading, error } = useTokenDetail(tokenId);
  const togglePin = () => { const next = !pinned; setPinned(next); void invoke('detail:pin', { pinned: next }); };

  if (tokenId === null) return <div className="center-fill" style={{ height: '100%' }}>Select a launch in the Feed window.<ToastHost /></div>;
  if (!detail) {
    return <div className="center-fill" style={{ height: '100%' }}>{error ? <span className="bad">{error}</span> : loading ? <Spinner label="Loading…" /> : null}<ToastHost /></div>;
  }
  const tok = detail.token.id;
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <Header detail={detail} pinned={pinned} onPin={togglePin} onPaper={() => setPaper(true)} onAsk={() => setTab('ai')} />
      <Tabs tabs={TABS} active={tab} onChange={setTab} />
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 16 }}>
        <ErrorBoundary key={`${tok}-${tab}`}>
          {tab === 'overview' ? <Overview detail={detail} /> : null}
          {tab === 'evidence' ? <Evidence judgement={detail.judgement} /> : null}
          {tab === 'trades' ? <Trades tokenId={tok} /> : null}
          {tab === 'holders' ? <Holders tokenId={tok} /> : null}
          {tab === 'chart' ? <ChartTab tokenId={tok} /> : null}
          {tab === 'journal' ? <JournalTab tokenId={tok} onNew={() => setPaper(true)} onOpen={setDrawerId} /> : null}
          {tab === 'ai' ? <AiTab tokenId={tok} /> : null}
        </ErrorBoundary>
      </div>
      {paper ? <NewDecisionModal tokenId={tok} onClose={() => setPaper(false)} onCreated={(id) => { setTab('journal'); setDrawerId(id); }} /> : null}
      {drawerId !== null ? <DecisionDrawer decisionId={drawerId} onClose={() => setDrawerId(null)} /> : null}
      <ToastHost />
    </div>
  );
}
