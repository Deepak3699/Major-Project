import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { motion } from 'framer-motion';
import { leads as leadsApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { PageHeader } from '@/components/ui/page-header';
import { PageLoader } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { useToast } from '@/components/ui/toast';
import { AlertTriangle, Merge, Copy } from 'lucide-react';
import { stageMeta, SCORE_BAND_META, formatDate } from '@/lib/format';

interface DuplicateCandidate {
  lead_id: string;
  lead_score: number;
  pipeline_stage: string;
  created_at: string;
  company_name: string;
  job_title: string;
  duplicate_of_id: string;
  dup_score: number;
  dup_stage: string;
  dup_company_name: string;
  dup_job_title: string;
  similarity: number;
}

const stageBadge = (stage: string) => {
  const meta = stageMeta(stage);
  return meta ? <Badge className={meta.className}>{meta.label}</Badge> : <Badge variant="secondary">{stage}</Badge>;
};

const scoreBadge = (score: number) => {
  const band = score >= 80 ? 'hot' : score >= 50 ? 'warm' : 'cold';
  const meta = SCORE_BAND_META[band as keyof typeof SCORE_BAND_META];
  return <Badge className={meta.className}>Score {score}</Badge>;
};

const EASE = [0.22, 1, 0.36, 1] as const;

const Duplicates: React.FC = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading, error, refetch } = useQuery('duplicates', () => leadsApi.getDuplicates());

  const mergeMutation = useMutation(
    ({ leadId, mergeIntoId }: { leadId: string; mergeIntoId: string }) =>
      leadsApi.mergeDuplicate(leadId, mergeIntoId),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('duplicates');
        queryClient.invalidateQueries('leads');
        toast({ title: 'Leads merged', variant: 'success' });
      },
      onError: (err) => toast({ title: 'Merge failed', description: (err as Error).message, variant: 'error' }),
    },
  );

  const handleMerge = (leadId: string, mergeIntoId: string) => {
    setPendingMerge({ leadId, mergeIntoId });
  };

  const confirmMerge = () => {
    if (!pendingMerge || mergeMutation.isLoading) return;
    mergeMutation.mutate(pendingMerge, { onSuccess: () => setPendingMerge(null) });
  };

  const [pendingMerge, setPendingMerge] = useState<{ leadId: string; mergeIntoId: string } | null>(null);

  if (isLoading) return <PageLoader label="Loading duplicates..." />;

  if (error)
    return (
      <ErrorState title="Failed to load duplicates" message={(error as Error).message} onRetry={() => refetch()} />
    );

  const duplicates: DuplicateCandidate[] = (data as any)?.duplicates || [];

  return (
    <div className="space-y-4">
      <ConfirmDialog
        open={!!pendingMerge}
        onClose={() => (mergeMutation.isLoading ? null : setPendingMerge(null))}
        onConfirm={confirmMerge}
        title="Merge these leads?"
        description="Outreach history, drafts and verification logs move to the surviving lead. The merged lead is deleted. This cannot be undone."
        confirmLabel="Merge leads"
        loading={mergeMutation.isLoading}
      />
      <PageHeader
        title="Duplicate Leads"
        description="Review and resolve potential duplicate leads in your pipeline"
      />

      {duplicates.length === 0 ? (
        <div className="card p-10">
          <EmptyState
            icon={Copy}
            title="No duplicate candidates found."
            description="Your pipeline is clean — we'll flag potential duplicates here as they're detected."
          />
        </div>
      ) : (
        <div className="space-y-4">
          {duplicates.map((dup, index) => (
            <motion.div
              key={dup.lead_id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: EASE, delay: Math.min(index * 0.05, 0.25) }}
              className="card overflow-hidden transition-colors duration-150 hover:border-border-strong"
            >
              {/* Similarity strip */}
              <div className="flex items-center gap-3 border-b border-border px-5 py-3">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-warning/25 bg-warning-soft">
                  <AlertTriangle className="h-3.5 w-3.5 text-warning" strokeWidth={1.75} />
                </span>
                <span className="font-mono text-[13px] font-semibold tabular-nums text-warning">
                  {Math.round(dup.similarity * 100)}% similar
                </span>
                <span className="ml-auto font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                  detected {formatDate(dup.created_at)}
                </span>
              </div>

              {/* Side-by-side comparison */}
              <div className="grid grid-cols-1 md:grid-cols-2 md:divide-x md:divide-border">
                <div className="px-5 py-4">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="eyebrow">Lead</p>
                    <div className="flex flex-wrap justify-end gap-1.5">
                      {scoreBadge(dup.lead_score)}
                      {stageBadge(dup.pipeline_stage)}
                    </div>
                  </div>
                  <p className="truncate text-[15px] font-semibold tracking-[-0.01em] text-foreground">
                    {dup.company_name || '—'}
                  </p>
                  <p className="mt-0.5 truncate text-[13px] text-muted-foreground">{dup.job_title || '—'}</p>
                </div>

                <div className="border-t border-border px-5 py-4 md:border-t-0">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="eyebrow">Possible duplicate</p>
                    <div className="flex flex-wrap justify-end gap-1.5">
                      {scoreBadge(dup.dup_score)}
                      {stageBadge(dup.dup_stage)}
                    </div>
                  </div>
                  <p className="truncate text-[15px] font-semibold tracking-[-0.01em] text-foreground">
                    {dup.dup_company_name || '—'}
                  </p>
                  <p className="mt-0.5 truncate text-[13px] text-muted-foreground">{dup.dup_job_title || '—'}</p>
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-wrap items-center gap-2 border-t border-border bg-muted/30 px-5 py-3">
                <Button
                  onClick={() => handleMerge(dup.lead_id, dup.duplicate_of_id)}
                  disabled={mergeMutation.isLoading}
                  size="sm"
                  variant="default"
                >
                  <Merge className="h-3.5 w-3.5" />
                  Merge into this
                </Button>
                <Button
                  onClick={() => handleMerge(dup.lead_id, dup.lead_id)}
                  disabled={mergeMutation.isLoading}
                  size="sm"
                  variant="outline"
                >
                  Keep this
                </Button>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Duplicates;
