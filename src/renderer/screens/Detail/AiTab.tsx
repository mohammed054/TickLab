import { useEffect, useRef, useState } from 'react';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { MiniMarkdown } from '../../components/MiniMarkdown';
import { Spinner } from '../../components/Spinner';
import { invoke, useInvoke } from '../../state/hooks';
import type { AiAnswer } from '@shared/api';

type Preset = 'simple' | 'risks' | 'next' | 'custom';
const PRESETS: { id: Exclude<Preset, 'custom'>; label: string }[] = [
  { id: 'simple', label: 'Explain this launch simply' }, { id: 'risks', label: 'What are the biggest risks?' }, { id: 'next', label: 'What should a beginner check next?' },
];
const MAX_Q = 500;
interface Req { preset: Preset; question?: string }

export function AiTab({ tokenId }: { tokenId: number }) {
  const usage = useInvoke('ai:usage', {});
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<AiAnswer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [left, setLeft] = useState<number | null>(null);
  const last = useRef<Req | null>(null);
  useEffect(() => { setAnswer(null); setError(null); }, [tokenId]);
  const remaining = left ?? usage.data?.remaining ?? null;
  const run = async (req: Req) => {
    last.current = req;
    setBusy(true); setError(null);
    const r = await invoke('ai:explain', req.question ? { tokenId, preset: req.preset, question: req.question } : { tokenId, preset: req.preset });
    setBusy(false);
    if (r.ok) { setAnswer(r.value); setLeft(r.value.remainingToday); }
    else { setAnswer(null); setError(r.error.message); usage.reload(); }
  };
  const q = question.trim();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 760 }}>
      <div className="row-flex" style={{ flexWrap: 'wrap' }}>
        {PRESETS.map((p) => <Button key={p.id} variant="secondary" disabled={busy} onClick={() => { void run({ preset: p.id }); }}>{p.label}</Button>)}
      </div>
      <div className="row-flex" style={{ alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <Input aria-label="Your question" placeholder="Ask your own question about this launch" maxLength={MAX_Q} value={question} onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && q && !busy) void run({ preset: 'custom', question: q }); }} />
          <div className="meta" style={{ textAlign: 'right' }}>{question.length}/{MAX_Q}</div>
        </div>
        <Button variant="primary" disabled={busy || !q} onClick={() => { void run({ preset: 'custom', question: q }); }}>Ask</Button>
      </div>
      <div className="panel" style={{ padding: 12, minHeight: 120 }}>
        {busy ? <Spinner label="Thinking…" /> : null}
        {!busy && error ? (
          <div className="err-box row-flex" style={{ justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12 }}>{error}</span>
            <Button variant="secondary" onClick={() => { if (last.current) void run(last.current); }}>Retry</Button>
          </div>
        ) : null}
        {!busy && !error && answer ? (<><MiniMarkdown text={answer.text} /><div className="meta" style={{ marginTop: 8 }}>{answer.cached ? 'cached · ' : ''}{answer.model}</div></>) : null}
        {!busy && !error && !answer ? <span className="muted" style={{ fontSize: 12 }}>Pick a question above to get a plain-words explanation of the data.</span> : null}
      </div>
      <div className="meta">AI can be wrong and cannot see the future. Not financial advice. Free requests left today: {remaining ?? '—'}</div>
    </div>
  );
}
