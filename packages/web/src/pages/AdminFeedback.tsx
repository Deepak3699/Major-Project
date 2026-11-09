import React from 'react';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import { Check, MessageCircle, Star, X } from 'lucide-react';
import { candidate } from '@/lib/api';
import { PageHeader } from '@/components/ui/page-header';
import { PageLoader } from '@/components/ui/spinner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

const AdminFeedback: React.FC = () => {
  const client = useQueryClient();
  const { data, isLoading, error } = useQuery('admin-feedback-pending', () => candidate.adminFeedback('pending'));
  const mutation = useMutation(
    ({ id, status }: { id: string; status: 'approved' | 'rejected' }) => candidate.moderateFeedback(id, status),
    {
      onSuccess: () => {
        client.invalidateQueries('admin-feedback-pending');
        client.invalidateQueries('candidate-admin-overview');
      },
    },
  );
  return (
    <div className="space-y-4">
      <PageHeader
        title="Candidate feedback"
        description="Review feedback before it becomes visible. Moderation decisions are added to the audit log."
      />
      {isLoading ? (
        <PageLoader label="Loading feedback…" />
      ) : error ? (
        <div className="card p-5 text-sm text-destructive">{(error as Error).message}</div>
      ) : data?.data?.length ? (
        <div className="space-y-3">
          {data.data.map((item: any) => (
            <article key={item.id} className="card p-5">
              <div className="flex flex-col justify-between gap-4 sm:flex-row">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="warning">Pending review</Badge>
                    <span className="flex items-center gap-0.5 text-warning" aria-label={`${item.rating} of 5`}>
                      {Array.from({ length: 5 }, (_, i) => (
                        <Star key={i} className={`h-3 w-3 ${i < item.rating ? 'fill-current' : ''}`} />
                      ))}
                    </span>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {new Date(item.created_at).toLocaleString()}
                    </span>
                  </div>
                  <p className="mt-3 text-[13.5px] leading-relaxed text-foreground">{item.feedback}</p>
                  <p className="mt-3 font-mono text-[11px] text-muted-foreground">
                    {item.candidate_email}
                    {item.company_name ? ` · ${item.company_name}` : ''}
                    {item.job_title ? ` · ${item.job_title}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    variant="success"
                    size="sm"
                    disabled={mutation.isLoading}
                    onClick={() => mutation.mutate({ id: item.id, status: 'approved' })}
                  >
                    <Check className="h-3.5 w-3.5" />
                    Approve
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={mutation.isLoading}
                    onClick={() => mutation.mutate({ id: item.id, status: 'rejected' })}
                    className="border-destructive/30 text-destructive hover:bg-destructive-soft hover:text-destructive"
                  >
                    <X className="h-3.5 w-3.5" />
                    Reject
                  </Button>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="card p-9 text-center">
          <MessageCircle className="mx-auto h-8 w-8 text-muted-foreground" />
          <h2 className="mt-3 font-semibold">No feedback to review</h2>
          <p className="mt-1 text-[13px] text-muted-foreground">New candidate feedback appears here until moderated.</p>
        </div>
      )}
      {mutation.error && <p className="text-[13px] text-destructive">{(mutation.error as Error).message}</p>}
    </div>
  );
};

export default AdminFeedback;
