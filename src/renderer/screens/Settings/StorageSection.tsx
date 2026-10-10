import { fmtBytes } from '@shared/format';
import { Button } from '../../components/Button';
import { toast } from '../../components/Toast';
import { invoke, useInvoke } from '../../state/hooks';
import { openExternal } from '../../state/actions';
import { NumberSetting, Row, Section } from './fields';
import type { SettingsCtx } from './fields';

export function StorageSection({ ctx }: { ctx: SettingsCtx }) {
  const ov = useInvoke('health:overview', {});
  const backup = async () => {
    const r = await invoke('app:backupNow', {});
    toast(r.ok ? `Backup saved to ${r.value.path}` : r.error.message, r.ok ? 'good' : 'bad');
  };
  return (
    <Section title="Storage">
      <Row label="Database size"><span className="mono">{fmtBytes(ov.data?.dbBytes)}</span></Row>
      <NumberSetting ctx={ctx} k="retention.snapshotDays" label="Snapshot retention (days)" integer min={1} />
      <NumberSetting ctx={ctx} k="retention.tradeDays" label="Trade retention (days)" integer min={1} />
      <div className="row-flex">
        <Button variant="secondary" onClick={() => { void backup(); }}>Backup now</Button>
        <Button variant="secondary" onClick={() => { void invoke('app:openDataFolder', {}); }}>Open data folder</Button>
      </div>
    </Section>
  );
}

export function AboutSection() {
  const info = useInvoke('app:info', {}).data;
  return (
    <Section title="About">
      <div style={{ fontSize: 12 }}>TickLab Radar v{info?.version ?? '1.0.0'}. A research tool: it reads public data, holds no keys and places no orders. Scores are warning-sign counts, not predictions.</div>
      <div className="row-flex">
        <Button variant="ghost" onClick={() => { void openExternal('https://www.geckoterminal.com/'); }}>GeckoTerminal</Button>
        <Button variant="ghost" onClick={() => { void openExternal('https://solscan.io/'); }}>Solscan</Button>
      </div>
    </Section>
  );
}
