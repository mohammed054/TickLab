import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useInvoke } from '../../state/hooks';
import { Button } from '../../components/Button';
import { AiSection } from './AiSection';
import { AlertsSection, CostsSection, DataSourcesSection, TrackingSection } from './DataSections';
import { saveSetting } from './fields';
import type { SettingsCtx } from './fields';
import { RiskSection } from './RiskSection';
import { AboutSection, StorageSection } from './StorageSection';

export default function SettingsScreen() {
  const navigate = useNavigate();
  const q = useInvoke('settings:get', {});
  const reload = q.reload;
  const save = useCallback(async (key: string, value: unknown) => { const ok = await saveSetting(key, value); reload(); return ok; }, [reload]);
  const openArchive = () => { navigate('/journal'); };
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
        <StorageSection ctx={ctx} />
        <section style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 16, lineHeight: '24px', fontWeight: 600, margin: 0 }}>Legacy Archive</h2>
          <p style={{ fontSize: 12, lineHeight: '16px', color: 'var(--text-2)', margin: '2px 0 8px' }}>
            Read-only view of past journal decisions, fills and equity events. Records are preserved exactly as recorded and are never used in model data.
          </p>
          <Button variant="secondary" onClick={openArchive}>Open Legacy Archive</Button>
        </section>
        <AboutSection />
      </div>
    </div>
  );
}
