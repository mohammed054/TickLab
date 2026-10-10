import type { ReactNode } from 'react';
import { GLOSSARY } from '@shared/glossary';
import { Tooltip } from './Tooltip';

/** Dotted underline; the tooltip shows the definition from shared/glossary.ts. */
export function GlossaryTerm({ term, children }: { term: string; children?: ReactNode }) {
  const def = GLOSSARY[term];
  const inner = <span className="glossary" style={{ borderBottom: '1px dotted var(--text-3)' }}>{children ?? term}</span>;
  return def ? <Tooltip content={def}>{inner}</Tooltip> : inner;
}
