import type { ReactNode } from 'react';

function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith('**') && p.endsWith('**') && p.length > 4 ? <strong key={i}>{p.slice(2, -2)}</strong> : p));
}

/** Paragraphs, **bold** and bullet lists only. Everything is rendered as React text, never as HTML. */
export function MiniMarkdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length === 0) return;
    const items = list;
    list = [];
    blocks.push(<ul key={`u${blocks.length}`} style={{ margin: '4px 0', paddingLeft: 18 }}>{items.map((l, i) => <li key={i}>{inline(l)}</li>)}</ul>);
  };
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    const m = /^[-*•]\s+(.*)$/.exec(line);
    if (m) { list.push(m[1] ?? ''); continue; }
    flush();
    if (line) blocks.push(<p key={`p${blocks.length}`} style={{ margin: '0 0 8px' }}>{inline(line)}</p>);
  }
  flush();
  return <div style={{ fontSize: 13, lineHeight: '18px' }}>{blocks}</div>;
}
