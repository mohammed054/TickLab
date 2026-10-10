import { useState } from 'react';
import { Star } from 'lucide-react';
import { Button } from '../components/Button';
import { Chip } from '../components/Chip';
import { Field, Input, Select } from '../components/Input';
import { GlossaryTerm } from '../components/GlossaryTerm';
import { Identicon } from '../components/Identicon';
import { Modal, ModalButtons } from '../components/Modal';
import { ScoreChip } from '../components/ScoreChip';
import { Spinner } from '../components/Spinner';
import { StatCard } from '../components/StatCard';
import { Tabs } from '../components/Tabs';
import { toast } from '../components/Toast';
import { Toggle } from '../components/Toggle';
import { Tooltip } from '../components/Tooltip';

/** Dev-only component gallery (#/kit). */
export default function Kit() {
  const [on, setOn] = useState(true);
  const [tab, setTab] = useState('a');
  const [open, setOpen] = useState(false);
  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="row-flex">
        <Button variant="primary">Primary</Button><Button>Secondary</Button><Button variant="ghost">Ghost</Button><Button variant="danger">Danger</Button>
        <Button disabled>Disabled</Button><Button iconOnly aria-label="Star" icon={<Star size={16} strokeWidth={1.5} />} />
      </div>
      <div className="row-flex"><Chip color="var(--good)">CHIP</Chip><ScoreChip score={12} band="LOW" completeness={0.8} /><ScoreChip score={38} band="MEDIUM" completeness={0.72} /><ScoreChip score={61} band="HIGH" completeness={0.9} /><ScoreChip score={90} band="EXTREME" completeness={1} /><ScoreChip score={10} band="LOW" completeness={0.3} /><ScoreChip big score={38} band="MEDIUM" completeness={0.72} /></div>
      <div className="row-flex" style={{ maxWidth: 520 }}><Input placeholder="Input" /><Input numeric type="number" defaultValue={12} /><Select><option>Select</option></Select><Toggle checked={on} onChange={setOn} label="Toggle" /></div>
      <Tabs tabs={[{ id: 'a', label: 'One' }, { id: 'b', label: 'Two' }]} active={tab} onChange={setTab} />
      <div className="row-flex"><Spinner label="Spinner" /><Tooltip content="Tooltip text"><span>Hover me</span></Tooltip><GlossaryTerm term="Liquidity" /><Identicon seed="kit" /><StatCard label="Stat" value="$1.23M" sub="sub-line" /></div>
      <div className="row-flex"><Button onClick={() => toast('Toast example', 'info')}>Toast</Button><Button onClick={() => setOpen(true)}>Modal</Button></div>
      <Modal open={open} onClose={() => setOpen(false)} title="Modal"><Field label="Field"><Input /></Field><ModalButtons><Button onClick={() => setOpen(false)}>Close</Button></ModalButtons></Modal>
    </div>
  );
}
