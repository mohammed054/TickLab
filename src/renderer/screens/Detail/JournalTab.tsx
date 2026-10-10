import { Button } from '../../components/Button';
import { DecisionTable } from '../Journal/DecisionTable';
import { useDecisions } from '../Journal/useDecisions';

export function JournalTab({ tokenId, onNew, onOpen }: { tokenId: number; onNew: () => void; onOpen: (decisionId: number) => void }) {
  const { rows, loading } = useDecisions(tokenId);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="row-flex"><span className="section-title">Decisions for this token</span><span className="spacer" /><Button variant="secondary" onClick={onNew}>New paper decision</Button></div>
      {!loading && rows.length === 0 ? <div className="muted">No decisions recorded for this token.</div> : <DecisionTable rows={rows} onOpen={(d) => onOpen(d.id)} />}
    </div>
  );
}
