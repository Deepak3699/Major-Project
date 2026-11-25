import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import { Activity, AlertTriangle, Bot, CalendarDays, Coins, DollarSign, KeyRound, RefreshCw, SlidersHorizontal, Zap } from 'lucide-react';
import { adminAI } from '@/lib/api';
import type { AiConfig, AiOverview } from '@/lib/types';
import { PageHeader } from '@/components/ui/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { StatCard, StatCardGrid } from '@/components/ui/stat-card';
import { PageLoader } from '@/components/ui/spinner';
import { useToast } from '@/components/ui/toast';
import { formatDateTime } from '@/lib/format';

const FEATURE_LABELS: Record<string, string> = {
  questions: 'Interview questions',
  grading: 'Answer grading',
  summary: 'Session summary',
  follow_up: 'Follow-up questions',
  opening: 'Interviewer opening',
  reply: 'Interviewer replies',
  learning: 'Learning tracks',
  adaptive_question: 'Adaptive questions',
  presentation: 'Camera presentation review',
  report: 'Interview reports',
  preparation: 'Preparation workspace',
  application_documents: 'Application documents',
  admin_test: 'Admin test call',
};

const MODELS = [
  { value: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash Lite (recommended / cheapest)' },
  { value: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash' },
  { value: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash' },
  { value: 'gemini-3.7-flash', label: 'Gemini 3.7 Flash' },
  { value: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash' },
  { value: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro (preview)' },
];

const money = (value: number) => `$${Number(value || 0).toFixed(4)}`;

function SettingsCard({ config, features, onSaved }: {
  config: AiConfig;
  features: string[];
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [draft, setDraft] = useState<AiConfig>(config);
  const [dirty, setDirty] = useState(false);

  React.useEffect(() => {
    setDraft(config);
    setDirty(false);
  }, [config]);

  const save = useMutation((values: AiConfig) => adminAI.saveSettings(values), {
    onSuccess: () => {
      toast({ title: 'AI settings saved', description: 'Limits apply to the next Gemini call.', variant: 'success' });
      setDirty(false);
      onSaved();
    },
    onError: (err: Error) => toast({ title: 'Could not save settings', description: err.message, variant: 'error' }),
  });

  const patch = <K extends keyof AiConfig>(key: K, value: AiConfig[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  return (
    <div className="card p-5">
      <div className="mb-4 flex items-center gap-2">
        <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">Gemini controls</h2>
        <span className="ml-auto text-[11px] text-muted-foreground">Enforced server-side on every call</span>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-lg border border-border bg-surface/50 p-3">
            <div>
              <p className="text-sm font-medium text-foreground">Gemini enabled</p>
              <p className="text-[12px] text-muted-foreground">Off means every feature uses its template fallback.</p>
            </div>
            <Switch
              checked={draft.enabled}
              onCheckedChange={(checked) => patch('enabled', checked)}
              aria-label="Gemini enabled"
            />
          </div>
          <label className="block space-y-1.5">
            <span className="label">Model</span>
            <Select value={draft.model} onChange={(e) => patch('model', e.target.value)}>
              {!MODELS.some((m) => m.value === draft.model) && <option value={draft.model}>{draft.model}</option>}
              {MODELS.map((model) => <option key={model.value} value={model.value}>{model.label}</option>)}
            </Select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1.5">
              <span className="label">Monthly budget (USD)</span>
              <Input type="number" min="0" step="1" value={draft.monthly_budget_usd}
                onChange={(e) => patch('monthly_budget_usd', Number(e.target.value))} />
            </label>
            <label className="block space-y-1.5">
              <span className="label">Max output tokens</span>
              <Input type="number" min="128" max="8192" step="128" value={draft.max_output_tokens}
                onChange={(e) => patch('max_output_tokens', Number(e.target.value))} />
            </label>
            <label className="block space-y-1.5">
              <span className="label">Daily request cap</span>
              <Input type="number" min="0" step="10" value={draft.daily_request_cap}
                onChange={(e) => patch('daily_request_cap', Number(e.target.value))} />
            </label>
            <label className="block space-y-1.5">
              <span className="label">Monthly request cap</span>
              <Input type="number" min="0" step="100" value={draft.monthly_request_cap}
                onChange={(e) => patch('monthly_request_cap', Number(e.target.value))} />
            </label>
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            A cap of 0 disables that limit. Spend is estimated from Gemini token pricing and recorded for every call.
          </p>
        </div>

        <div>
          <p className="label mb-2">Per-feature toggles</p>
          <div className="grid max-h-[280px] gap-1.5 overflow-y-auto pr-1 sm:grid-cols-2">
            {features.map((feature) => (
              <div key={feature} className="flex items-center justify-between gap-2 rounded-md border border-border px-2.5 py-2">
                <span className="truncate text-[12px] text-foreground" title={feature}>
                  {FEATURE_LABELS[feature] || feature}
                </span>
                <Switch
                  checked={draft.features[feature] !== false}
                  onCheckedChange={(checked) => patch('features', { ...draft.features, [feature]: checked })}
                  aria-label={`Enable ${FEATURE_LabelsSafe(feature)}`}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-end gap-2">
        {dirty && <span className="text-[11px] text-warning">Unsaved changes</span>}
        <Button size="sm" loading={save.isLoading} disabled={!dirty} onClick={() => save.mutate(draft)}>Save controls</Button>
      </div>
    </div>
  );
}

function FEATURE_LabelsSafe(feature: string): string {
  return FEATURE_LABELS[feature] || feature;
}

function DailyChart({ daily }: { daily: AiOverview['daily'] }) {
  const max = Math.max(1, ...daily.map((d) => d.calls));
  return (
    <div className="card p-5">
      <div className="mb-4 flex items-center gap-2">
        <CalendarDays className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">Calls · last 30 days</h2>
      </div>
      {daily.length === 0 ? (
        <p className="py-8 text-center text-[13px] text-muted-foreground">No Gemini calls recorded yet.</p>
      ) : (
        <div className="flex h-32 items-end gap-1">
          {daily.map((day) => (
            <div key={day.day} className="group relative flex h-full flex-1 items-end" title={`${day.day}: ${day.calls} calls, ${money(day.cost_usd)}`}>
              <div className="w-full rounded-t bg-primary/70 transition-all group-hover:bg-primary" style={{ height: `${Math.max(3, (day.calls / max) * 100)}%` }} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const AdminAI: React.FC = () => {
  const client = useQueryClient();
  const { toast } = useToast();
  const overview = useQuery('admin-ai-overview', () => adminAI.overview(), { refetchInterval: 15000 });
  const calls = useQuery('admin-ai-calls', () => adminAI.calls(50, 0), { refetchInterval: 15000 });
  const [testing, setTesting] = useState(false);

  const refresh = () => {
    client.invalidateQueries('admin-ai-overview');
    client.invalidateQueries('admin-ai-calls');
  };

  const test = async () => {
    setTesting(true);
    try {
      const res = await adminAI.test();
      if (res.ok) {
        toast({ title: 'Gemini is working', description: `${res.model} replied: ${res.text || '(empty)'}`, variant: 'success' });
      } else {
        toast({ title: 'Gemini test failed', description: res.message || res.error_code || 'Unknown error', variant: 'error' });
      }
    } catch (err) {
      toast({ title: 'Gemini test failed', description: (err as Error).message, variant: 'error' });
    } finally {
      setTesting(false);
      refresh();
    }
  };

  if (overview.isLoading) return <PageLoader label="Loading Gemini usage..." />;

  const data = overview.data;
  const recent = calls.data?.calls || [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gemini usage & cost"
        description="Monitor provider spend, cap requests and budget, and rotate the key. Every interview answer stays visible to admins regardless of provider state."
        actions={
          <>
            <Button variant="ghost" size="sm" onClick={refresh}><RefreshCw className="h-4 w-4" /> Refresh</Button>
            <Button size="sm" loading={testing} onClick={test}><Zap className="h-4 w-4" /> Test connection</Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface/50 px-3 py-2 text-[12px]">
        <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-muted-foreground">API key:</span>
        <Badge variant={data?.key_configured ? 'success' : 'warning'}>
          {data?.key_configured ? 'Configured' : 'Not configured'}
        </Badge>
        <Link to="/settings" className="ml-1 text-primary hover:underline">Manage key in System settings</Link>
      </div>

      <StatCardGrid>
        <StatCard icon={DollarSign} label="Spend this month" value={money(data?.summary.cost_this_month_usd || 0)}
          hint={`of ${money(data?.config.monthly_budget_usd || 0)} budget`} tone="primary" />
        <StatCard icon={Activity} label="Calls today" value={data?.summary.calls_today || 0}
          hint={`cap ${data?.config.daily_request_cap || 0}`} tone="info" />
        <StatCard icon={Bot} label="Calls this month" value={data?.summary.calls_this_month || 0}
          hint={`${(data?.summary.tokens_this_month || 0).toLocaleString()} tokens`} tone="success" />
        <StatCard icon={AlertTriangle} label="Errors this month" value={data?.summary.errors_this_month || 0}
          hint={`${data?.summary.calls_all_time || 0} calls all time`} tone={(data?.summary.errors_this_month || 0) > 0 ? 'warning' : 'muted'} />
        <StatCard icon={Coins} label="Estimated total spend" value={money(data?.summary.cost_all_time_usd || 0)} tone="muted" />
      </StatCardGrid>

      {data && (
        <SettingsCard config={data.config} features={data.features} onSaved={refresh} />
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <DailyChart daily={data?.daily || []} />
        </div>
        <div className="card p-5">
          <div className="mb-4 flex items-center gap-2">
            <Coins className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">Live limits</h2>
          </div>
          <dl className="space-y-2.5 text-[13px]">
            <div className="flex justify-between"><dt className="text-muted-foreground">Today's requests</dt><dd className="font-mono">{data?.usage.daily_requests || 0} / {data?.config.daily_request_cap || 0}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Monthly requests</dt><dd className="font-mono">{data?.usage.monthly_requests || 0} / {data?.config.monthly_request_cap || 0}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Monthly cost</dt><dd className="font-mono">{money(data?.usage.monthly_cost_usd || 0)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Model</dt><dd className="font-mono text-[11px]">{data?.config.model}</dd></div>
          </dl>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4">
          <h2 className="text-sm font-semibold text-foreground">Recent Gemini calls</h2>
          <span className="text-[11px] text-muted-foreground">Updates every 15s · no secrets included</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[12px]">
            <thead className="border-y border-border bg-surface/60 text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-5 py-2.5">When</th><th className="px-3 py-2.5">Feature</th><th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5">Model</th><th className="px-3 py-2.5">Tokens</th>
                <th className="px-3 py-2.5">Cost</th><th className="px-3 py-2.5">Latency</th><th className="px-5 py-2.5">Error</th>
              </tr>
            </thead>
            <tbody>
              {recent.length === 0 && (
                <tr><td colSpan={8} className="px-5 py-8 text-center text-muted-foreground">No calls recorded yet. Use “Test connection” to create one.</td></tr>
              )}
              {recent.map((call) => (
                <tr key={call.id} className="border-b border-border/60 last:border-0">
                  <td className="whitespace-nowrap px-5 py-2.5 text-muted-foreground">{formatDateTime(call.created_at)}</td>
                  <td className="px-3 py-2.5">{FEATURE_LABELS[call.feature] || call.feature}</td>
                  <td className="px-3 py-2.5">
                    <Badge variant={call.status === 'success' ? 'success' : call.status === 'blocked' ? 'warning' : 'danger'}>{call.status}</Badge>
                  </td>
                  <td className="px-3 py-2.5 font-mono text-[11px]">{call.model}</td>
                  <td className="px-3 py-2.5 font-mono">{call.total_tokens}</td>
                  <td className="px-3 py-2.5 font-mono">{money(Number(call.estimated_cost_usd))}</td>
                  <td className="px-3 py-2.5 font-mono">{call.latency_ms} ms</td>
                  <td className="px-5 py-2.5 font-mono text-[11px] text-muted-foreground">{call.error_code || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AdminAI;
