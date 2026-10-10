import { fmtAddr } from '@shared/format';
import { copyText } from './clipboard';
import { toast } from './Toast';
import { Tooltip } from './Tooltip';

/** Shortened address; full value on hover, click copies and toasts "Copied". */
export function AddrText({ value }: { value: string | null | undefined }) {
  if (!value) return <span className="mono">—</span>;
  return (
    <Tooltip content={value}>
      <button type="button" className="mono" style={{ background: 'none', border: 0, padding: 0, fontSize: 'inherit', cursor: 'copy', color: 'inherit' }}
        onClick={(e) => { e.stopPropagation(); void copyText(value).then((ok) => toast(ok ? 'Copied' : 'Copy failed', ok ? 'info' : 'bad')); }}>
        {fmtAddr(value)}
      </button>
    </Tooltip>
  );
}
