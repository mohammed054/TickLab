import { useCallback } from 'react';
import { useInvoke } from '../../state/hooks';
import { AiSection } from './AiSection';
import { AlertsSection, CostsSection, DataSourcesSection, TrackingSection } from './DataSections';
import { saveSetting } from './fields';
import type { SettingsCtx } from './fields';
import { RiskSection } from './RiskSection';
import { AboutSection, StorageSection } from './StorageSection';
import { WalletSection } from './WalletSection';

export default function SettingsScreen() {
  const q = useInvoke('settings:get', {});
  const reload = q.reload;
  const save = useCallback(async (key: string, value: unknown) => { const ok = await saveSetting(key, value); reload(); return ok; }, [reload]);
  if (!q.data) return <div className="page muted">{q.error ?? 'Loading…'}</div>;
  const ctx: SettingsCtx = { values: q.data, save };
  return (
    <div className="page">
      <div style={{ maxWidth: 720 }}>
        <DataSourcesSection ctx={ctx} />
        <TrackingSection ctx={ctx} />
        <AlertsSection ctx={ctx} />
        <CostsSection ctx={ctx} />
        <RiskSection ctx={ctx} pending={q.data.__pending ?? []} />
        <AiSection ctx={ctx} />
        <WalletSection ctx={ctx} />
        <StorageSection ctx={ctx} />
        <AboutSection />
      </div>
    </div>
  );
}
