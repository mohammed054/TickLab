// Read-only legacy journal tab for a token (T1.5). Lists existing decisions;
// no new decision can be created from here.
import { DecisionTable } from '../Journal/DecisionTable';
import { useDecisions } from '../Journal/useDecisions';

export function JournalTab({ tokenId, onOpen }: { tokenId: number; onOpen: (decisionId: number) => void }) {
  const { rows, loading } = useDecisions(tokenId);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="row-flex"><span className="section-title">Legacy decisions for this token</span><span className="spacer" /></div>
      {!loading && rows.length === 0 ? <div className="muted">No decisions recorded for this token.</div> : <DecisionTable rows={rows} onOpen={(d) => onOpen(d.id)} />}
    </div>
  );
}
