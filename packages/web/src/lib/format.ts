import type {
  DataQuality,
  EmailStatus,
  PipelineStage,
  ScoreBand,
  WhatsAppStatus,
} from '@/lib/types';

export function formatDate(value?: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatDateTime(value?: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}



export function initials(name?: string | null): string {
  if (!name) return '?';
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}

export function domainFromUrl(url?: string | null): string {
  if (!url) return '';
  try {
    return new URL(url.includes('://') ? url : `https://${url}`).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export const SCORE_BAND_META: Record<
  ScoreBand,
  { label: string; className: string; dot: string }
> = {
  hot: {
    label: 'Hot',
    className: 'bg-hot-soft text-hot border-hot/20',
    dot: 'bg-hot',
  },
  warm: {
    label: 'Warm',
    className: 'bg-warm-soft text-warm border-warm/20',
    dot: 'bg-warm',
  },
  cold: {
    label: 'Cold',
    className: 'bg-cold-soft text-cold border-cold/20',
    dot: 'bg-cold',
  },
};

export const STAGE_META: Record<PipelineStage, { label: string; className: string }> = {
  discovered: { label: 'Discovered', className: 'bg-muted text-muted-foreground border-border' },
  enriched: { label: 'Enriched', className: 'bg-info-soft text-info border-info/20' },
  verified: { label: 'Verified', className: 'bg-success-soft text-success border-success/20' },
  drafted: { label: 'Drafted', className: 'bg-primary-soft text-primary border-primary/20' },
  contacted: { label: 'Contacted', className: 'bg-primary-soft text-primary border-primary/20' },
  replied: { label: 'Replied', className: 'bg-success-soft text-success border-success/20' },
  bounced: { label: 'Bounced', className: 'bg-destructive-soft text-destructive border-destructive/20' },
  contact_unavailable: { label: 'Contact unavailable', className: 'bg-warning-soft text-warning border-warning/20' },
  suppressed: { label: 'Suppressed', className: 'bg-destructive-soft text-destructive border-destructive/20' },
  send_failed: { label: 'Send failed', className: 'bg-destructive-soft text-destructive border-destructive/20' },
  provider_error: { label: 'Provider error', className: 'bg-destructive-soft text-destructive border-destructive/20' },
  retry_pending: { label: 'Retry pending', className: 'bg-muted text-muted-foreground border-border' },
};

// Never let an unknown/unmapped backend stage crash the UI: fall back to a
// readable label + neutral style instead of undefined.className.
export function stageMeta(stage?: string | null): { label: string; className: string } {
  return (STAGE_META as Record<string, { label: string; className: string }>)[stage ?? ''] ?? {
    label: (stage || 'unknown').replace(/_/g, ' '),
    className: 'bg-muted text-muted-foreground border-border',
  };
}

export function emailStatusMeta(s?: string | null): { label: string; className: string } {
  const map = EMAIL_STATUS_META as Record<string, { label: string; className: string }>;
  return map[s ?? 'null'] ?? map['null'];
}

export function whatsappStatusMeta(s?: string | null): { label: string; className: string } {
  const map = WHATSAPP_STATUS_META as Record<string, { label: string; className: string }>;
  return map[s ?? 'null'] ?? map['null'];
}

const EMAIL_STATUS_META: Record<Exclude<EmailStatus, null> | 'null', { label: string; className: string }> = {
  valid: { label: 'Email valid', className: 'bg-success-soft text-success border-success/20' },
  invalid: { label: 'Email invalid', className: 'bg-destructive-soft text-destructive border-destructive/20' },
  catch_all: { label: 'Catch-all', className: 'bg-warning-soft text-warning border-warning/20' },
  disposable: { label: 'Disposable', className: 'bg-warning-soft text-warning border-warning/20' },
  unknown: { label: 'Email unknown', className: 'bg-muted text-muted-foreground border-border' },
  expired: { label: 'Re-verify required', className: 'bg-warning-soft text-warning border-warning/20' },
  null: { label: 'Not verified', className: 'bg-muted text-muted-foreground border-border' },
};

const WHATSAPP_STATUS_META: Record<Exclude<WhatsAppStatus, null> | 'null', { label: string; className: string }> = {
  registered: { label: 'WhatsApp on', className: 'bg-success-soft text-success border-success/20' },
  not_registered: {
    label: 'No WhatsApp',
    className: 'bg-destructive-soft text-destructive border-destructive/20',
  },
  unknown: { label: 'WhatsApp unknown', className: 'bg-muted text-muted-foreground border-border' },
  expired: { label: 'Re-verify required', className: 'bg-warning-soft text-warning border-warning/20' },
  null: { label: 'Not verified', className: 'bg-muted text-muted-foreground border-border' },
};

export const DATA_QUALITY_META: Record<DataQuality, { label: string; className: string }> = {
  complete: { label: 'Complete', className: 'bg-success-soft text-success border-success/20' },
  incomplete: { label: 'Incomplete', className: 'bg-warning-soft text-warning border-warning/20' },
};





