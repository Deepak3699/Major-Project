import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { useNavigate } from 'react-router-dom';
import { admin } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { useToast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { PageLoader } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Key,
  Save,
  RefreshCw,
  BarChart3,
  ToggleLeft,
  Calendar,
  Play,
  CheckCircle2,
  Activity,
  ShieldCheck,
  Lock,
} from 'lucide-react';

const ALL_SOURCES = [
  { name: 'naukri', label: 'Naukri.com' },
  { name: 'internshala', label: 'Internshala' },
  { name: 'freshersworld', label: 'Freshersworld' },
  { name: 'apna', label: 'Apna' },
  { name: 'workindia', label: 'WorkIndia' },
  { name: 'shine', label: 'Shine.com' },
  { name: 'timesjobs', label: 'TimesJobs' },
  { name: 'foundit', label: 'Foundit/Monster' },
  { name: 'instahyre', label: 'Instahyre' },
  { name: 'cutshort', label: 'CutShort' },
  { name: 'unstop', label: 'Unstop' },
  { name: 'iimjobs', label: 'iimjobs' },
  { name: 'jobinsider', label: 'JobInsider' },
  { name: 'hirist', label: 'Hirist' },
  { name: 'classicjobs', label: 'Classic Jobs' },
  { name: 'hackerearth', label: 'HackerEarth' },
  { name: 'ambitionbox', label: 'AmbitionBox' },
  { name: 'greenhouse', label: 'Greenhouse (ATS)' },
  { name: 'lever', label: 'Lever (ATS)' },
  { name: 'ashby', label: 'Ashby (ATS)' },
  { name: 'workday', label: 'Workday (ATS)' },
  { name: 'smartrecruiters', label: 'SmartRecruiters (ATS)' },
  { name: 'recruitee', label: 'Recruitee (ATS)' },
  { name: 'teamtailor', label: 'Teamtailor (ATS)' },
  { name: 'breezy', label: 'Breezy (ATS)' },
  { name: 'bamboohr', label: 'BambooHR (ATS)' },
  { name: 'personio', label: 'Personio (ATS)' },
  { name: 'indeed', label: 'Indeed India' },
  { name: 'duckduckgo', label: 'DuckDuckGo Search' },
  { name: 'amazon', label: 'Amazon Jobs' },
  { name: 'offcampus', label: 'Off-campus aggregators' },
  { name: 'hasjob', label: 'Hasjob' },
  { name: 'glassdoor', label: 'Glassdoor' },
  { name: 'wellfound', label: 'AngelList/Wellfound' },
  { name: 'linkedin', label: 'LinkedIn Jobs' },
  { name: 'remoteok', label: 'RemoteOK' },
  { name: 'github_jobs', label: 'GitHub Jobs' },
  { name: 'arbeitnow', label: 'Arbeitnow' },
  { name: 'adzuna', label: 'Adzuna' },
  { name: 'jooble', label: 'Jooble' },
  { name: 'usajobs', label: 'USAJobs' },
  { name: 'reddit', label: 'Reddit Jobs' },
  { name: 'twitter', label: 'Twitter Jobs' },
  { name: 'telegram', label: 'Telegram Channels' },
  { name: 'facebook', label: 'Facebook Groups' },
  { name: 'whatsapp', label: 'WhatsApp Listener' },
  { name: 'college_portals', label: 'College Portals' },
];

const DEFAULT_SCORING_WEIGHTS = {
  hr_name_found: 20,
  hr_personal_contact: 25,
  hr_linkedin_found: 15,
  company_official_contact: 10,
  job_description_quality: 10,
  email_verified: 10,
  whatsapp_verified: 10,
};

const API_KEY_FIELDS: { name: string; label: string; placeholder?: string }[] = [
  { name: 'contactout', label: 'ContactOut API Key', placeholder: 'Auto-fill or leave blank' },
  { name: 'snovio', label: 'Snov.io API Key' },
  { name: 'gemini', label: 'Gemini API Key' },
  { name: 'whatsapp', label: 'WhatsApp Session (Base64 JSON)', placeholder: 'whatsapp-web.js session data' },
  { name: 'reacher', label: 'Reacher API Key' },
  { name: 'resend', label: 'Resend API Key' },
  { name: 'brevo', label: 'Brevo API Key' },
  { name: 'adzuna_app_id', label: 'Adzuna App ID' },
  { name: 'adzuna_app_key', label: 'Adzuna App Key' },
  { name: 'jooble', label: 'Jooble API Key' },
  { name: 'twitter', label: 'Twitter API Key' },
  { name: 'reddit_client_id', label: 'Reddit Client ID' },
  { name: 'reddit_client_secret', label: 'Reddit Client Secret' },
  { name: 'telegram_api_id', label: 'Telegram API ID' },
  { name: 'telegram_api_hash', label: 'Telegram API Hash' },
];

const Settings: React.FC = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { toast } = useToast();
  const [apiKeysDirty, setApiKeysDirty] = useState(false);
  const [sourcesDirty, setSourcesDirty] = useState(false);
  const [scoringDirty, setScoringDirty] = useState(false);
  const [cronDirty, setCronDirty] = useState(false);

  const isAdmin = user?.role === 'admin';

  const { data: keyData, isLoading, refetch } = useQuery('api-keys', () => admin.getApiKeys(), {
    enabled: isAdmin,
    retry: false,
  });
  const { data: sourcesData } = useQuery('sources-enabled', () => admin.getSetting('sources_enabled'), {
    enabled: isAdmin,
    retry: false,
  });
  const { data: weightsData } = useQuery('scoring-weights', () => admin.getSetting('scoring_weights'), {
    enabled: isAdmin,
    retry: false,
  });
  const { data: cronData } = useQuery('cron-schedule', () => admin.getSetting('cron_schedule'), {
    enabled: isAdmin,
    retry: false,
  });
  const { data: healthData } = useQuery('source-health', () => admin.sourceHealth(), {
    enabled: isAdmin,
    retry: false,
  });

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (apiKeysDirty || sourcesDirty || scoringDirty || cronDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [apiKeysDirty, sourcesDirty, scoringDirty, cronDirty]);

  const handleAuthError = (error: any) => {
    if (error?.response?.status === 401) {
      useAuthStore.getState?.()?.logout?.();
      navigate('/login');
      return true;
    }
    return false;
  };

  const saveMutation = useMutation((keys: Record<string, string>) => admin.updateApiKeys(keys), {
    onSuccess: () => {
      queryClient.invalidateQueries('api-keys');
      setApiKeysDirty(false);
      toast({ title: 'API keys saved', description: 'Keys are encrypted at rest.', variant: 'success' });
    },
    onError: (error: any) => {
      if (!handleAuthError(error)) {
        setApiKeysDirty(false);
        toast({ title: 'Failed to save API keys', description: error?.message || 'Unknown error', variant: 'error' });
      }
    },
  });

  const saveSettingsMutation = useMutation((settings: Record<string, any>) => admin.updateSettings(settings), {
    onSuccess: () => {
      queryClient.invalidateQueries('sources-enabled');
      queryClient.invalidateQueries('scoring-weights');
      queryClient.invalidateQueries('cron-schedule');
      setSourcesDirty(false);
      setScoringDirty(false);
      setCronDirty(false);
      toast({ title: 'Settings saved', variant: 'success' });
    },
    onError: (error: any) => {
      if (!handleAuthError(error)) {
        setSourcesDirty(false);
        setScoringDirty(false);
        setCronDirty(false);
        toast({ title: 'Failed to save settings', description: error?.message || 'Unknown error', variant: 'error' });
      }
    },
  });

  const triggerRunMutation = useMutation((sources?: string[]) => admin.triggerRun(sources), {
    onSuccess: () => {
      queryClient.invalidateQueries('dashboard-runs');
      queryClient.invalidateQueries('dashboard-stats');
      toast({ title: 'Scrape run triggered', description: 'A scrape has been queued across enabled sources.', variant: 'success' });
    },
    onError: (error: any) => {
      if (!handleAuthError(error)) {
        toast({ title: 'Failed to trigger run', description: error?.message || 'Unknown error', variant: 'error' });
      }
    },
  });

  if (isLoading) return <PageLoader label="Loading settings..." />;

  const apiKeys = (keyData as any)?.api_keys || {};
  const sourcesEnabled = (sourcesData as any)?.value || {};
  const scoringWeights = (weightsData as any)?.value || DEFAULT_SCORING_WEIGHTS;
  const cronSchedule = (cronData as any)?.value || '0 2 * * *';
  const healthSources = (healthData as any)?.sources || [];

  const handleSaveApiKeys = () => {
    const form = document.getElementById('api-keys-form') as HTMLFormElement;
    const formData = new FormData(form);
    const keys: Record<string, string> = {};
    ['contactout', 'snovio', 'gemini', 'whatsapp', 'resend', 'brevo'].forEach((key) => {
      const val = (formData.get(key) as string) || '';
      const trimmed = val.trim();
      // NEVER submit masked placeholders back: the server returns keys masked
      // (••••abcd) and saving one would overwrite the real key with the mask.
      if (trimmed && !trimmed.startsWith('•')) keys[key] = trimmed;
    });
    if (Object.keys(keys).length === 0) {
      toast({ title: 'Nothing to save', description: 'Enter a new key value first — masked placeholders are never re-submitted.', variant: 'error' });
      return;
    }
    saveMutation.mutate(keys);
    setApiKeysDirty(false);
  };

  const handleSaveSources = () => {
    const form = document.getElementById('source-toggles-form') as HTMLFormElement;
    const formData = new FormData(form);
    const sources: Record<string, boolean> = {};
    ALL_SOURCES.forEach((s) => {
      sources[s.name] = formData.get(s.name) === 'on';
    });
    saveSettingsMutation.mutate({ sources_enabled: sources });
  };

  const handleSaveScoring = () => {
    const form = document.getElementById('scoring-weights-form') as HTMLFormElement;
    const formData = new FormData(form);
    const weights: Record<string, number> = {};
    let hasInvalid = false;
    Object.keys(DEFAULT_SCORING_WEIGHTS).forEach((key) => {
      const val = formData.get(key);
      if (val) {
        const num = parseInt(val as string, 10);
        if (isNaN(num) || num < 0 || num > 100) {
          hasInvalid = true;
          return;
        }
        weights[key] = num;
      }
    });
    if (hasInvalid) {
      toast({ title: 'Invalid scoring weights', description: 'Weights must be numbers between 0 and 100.', variant: 'error' });
      return;
    }
    saveSettingsMutation.mutate({ scoring_weights: weights });
  };

  const handleSaveCron = () => {
    const form = document.getElementById('cron-form') as HTMLFormElement;
    const formData = new FormData(form);
    const schedule = (formData.get('cron_schedule') as string).trim();
    if (!schedule) {
      toast({ title: 'Cron schedule required', description: 'Please enter a valid cron expression.', variant: 'error' });
      return;
    }
    saveSettingsMutation.mutate({ cron_schedule: schedule });
  };

  const handleTriggerRun = () => {
    const enabledSources = ALL_SOURCES.filter((s) => sourcesEnabled[s.name] !== false).map((s) => s.name);
    triggerRunMutation.mutate(enabledSources.length > 0 ? enabledSources : undefined);
  };

  return (
    <div className="space-y-phi4">
      <PageHeader
        title="Settings"
        description="Configure scrapers, API keys, scoring, and scheduling"
        actions={
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        }
      />

      {!isAdmin && (
        <div className="flex items-center gap-3 rounded-lg border border-warning/30 bg-warning-soft px-4 py-3 text-[13px] text-warning">
          <ShieldCheck className="h-4 w-4" />
          You have read-only access. Only admins can change settings.
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Play className="h-5 w-5 text-success" />
            Manual Scrape Trigger
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-[13px] text-muted-foreground">
            Manually trigger a scrape run across all enabled sources. This bypasses the cron schedule.
          </p>
          <Button onClick={handleTriggerRun} loading={triggerRunMutation.isLoading} variant="default">
            <Play className="h-4 w-4" />
            {triggerRunMutation.isLoading ? 'Starting…' : 'Run Now'}
          </Button>
          {triggerRunMutation.isError && (
            <p className="mt-3 text-[13px] text-destructive">
              Failed to trigger run: {(triggerRunMutation.error as Error).message}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5 text-muted-foreground" />
            API Keys & Credentials
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-5 flex items-center gap-1.5 text-[13px] text-muted-foreground">
            <Lock className="h-3.5 w-3.5" />
            Configure API keys for third-party services. Keys are encrypted at rest.
          </p>

          <form id="api-keys-form" className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {API_KEY_FIELDS.map((field) => (
              <div key={field.name}>
                <label className="label" htmlFor={`key-${field.name}`}>
                  {field.label}
                  {apiKeys[field.name] ? (
                    <span className="ml-2 rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-semibold text-success">configured</span>
                  ) : (
                    <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">not set</span>
                  )}
                </label>
                <Input
                  id={`key-${field.name}`}
                  type="password"
                  name={field.name}
                  defaultValue={apiKeys[field.name] || ''}
                  onChange={() => setApiKeysDirty(true)}
                  placeholder={field.placeholder}
                  autoComplete="off"
                />
              </div>
            ))}
          </form>

          <div className="mt-6 flex items-center justify-end gap-3">
            {saveMutation.isSuccess && (
              <span className="inline-flex items-center gap-1.5 text-[13px] text-success">
                <CheckCircle2 className="h-4 w-4" />
                API keys saved successfully.
              </span>
            )}
            {saveMutation.isError && (
              <span className="text-[13px] text-destructive">
                Failed to save: {(saveMutation.error as Error).message}
              </span>
            )}
            <Button onClick={handleSaveApiKeys} loading={saveMutation.isLoading}>
              <Save className="h-4 w-4" />
              {saveMutation.isLoading ? 'Saving…' : 'Save Changes'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ToggleLeft className="h-5 w-5 text-muted-foreground" />
            Source Enable / Disable
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-5 text-[13px] text-muted-foreground">
            Enable or disable individual scrapers for the daily scrape run.
          </p>
          <form id="source-toggles-form" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {ALL_SOURCES.map((src) => (
              <label
                key={src.name}
                className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-3.5 py-2.5 transition-colors hover:border-foreground/20"
              >
                <span className="text-[13px] font-medium text-foreground">{src.label}</span>
                <span className="relative inline-flex shrink-0">
                  <input
                    type="checkbox"
                    name={src.name}
                    defaultChecked={sourcesEnabled[src.name] !== false}
                    onChange={() => setSourcesDirty(true)}
                    className="peer sr-only"
                  />
                  <span className="h-5 w-9 rounded-full bg-muted-foreground/25 transition-colors peer-checked:bg-success peer-focus-visible:ring-2 peer-focus-visible:ring-ring" />
                  <span className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-background shadow-sm transition-transform peer-checked:translate-x-4" />
                </span>
              </label>
            ))}
          </form>
          <div className="mt-6 flex items-center justify-end gap-3">
            <Button onClick={handleSaveSources} loading={saveSettingsMutation.isLoading} disabled={!sourcesDirty}>
              <Save className="h-4 w-4" />
              {saveSettingsMutation.isLoading ? 'Saving…' : 'Save Sources'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-muted-foreground" />
            Scoring Weights
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-5 text-[13px] text-muted-foreground">
            Adjust lead scoring weights. Higher values increase the score contribution.
          </p>
          <form id="scoring-weights-form" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(DEFAULT_SCORING_WEIGHTS).map(([key, defaultVal]) => (
              <div key={key}>
                <label className="label" htmlFor={`weight-${key}`}>
                  {key.replace(/_/g, ' ')}
                </label>
                <Input
                  id={`weight-${key}`}
                  type="number"
                  name={key}
                  defaultValue={scoringWeights[key] ?? defaultVal}
                  min={0}
                  max={100}
                  onChange={() => setScoringDirty(true)}
                />
              </div>
            ))}
          </form>
          <div className="mt-6 flex items-center justify-end gap-3">
            <Button onClick={handleSaveScoring} loading={saveSettingsMutation.isLoading} disabled={!scoringDirty}>
              <Save className="h-4 w-4" />
              {saveSettingsMutation.isLoading ? 'Saving…' : 'Save Scoring'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-muted-foreground" />
            Cron Schedule
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-5 text-[13px] text-muted-foreground">
            The daily scrape runs on <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">DAILY_SCRAPE_HOUR</code> (env, default 03:00 UTC) plus n8n cron.
            This field is informational — the schedule is operator-managed, not stored here.
          </p>
          <form id="cron-form" className="flex flex-wrap items-end gap-4" onSubmit={(e) => e.preventDefault()}>
            <div className="min-w-[240px] flex-1">
              <label className="label" htmlFor="cron_schedule">
                Stored notes (informational only)
              </label>
              <Input
                id="cron_schedule"
                type="text"
                name="cron_schedule"
                defaultValue={cronSchedule}
                placeholder="0 2 * * *"
                onChange={() => setCronDirty(true)}
                className="font-mono"
              />
            </div>
            <Button onClick={handleSaveCron} loading={saveSettingsMutation.isLoading} disabled={!cronDirty}>
              <Save className="h-4 w-4" />
              {saveSettingsMutation.isLoading ? 'Saving…' : 'Save Note'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-muted-foreground" />
            Source Health
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-[13px] text-muted-foreground">
            Monitor scraper source status and circuit breaker state.
          </p>
          {healthSources.length > 0 ? (
            <div className="space-y-2">
              {healthSources.map((s: any) => (
                <div
                  key={s.source_name}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-3.5 py-2.5"
                >
                  <span className="text-sm font-medium capitalize">{s.source_name}</span>
                  {s.is_open ? (
                    <Badge variant="danger">Circuit open ({s.consecutive_failures} failures)</Badge>
                  ) : (
                    <Badge variant="success">Healthy</Badge>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon={Activity} title="No source health data yet." description="Source status will appear once scrapers begin running." />
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Settings;