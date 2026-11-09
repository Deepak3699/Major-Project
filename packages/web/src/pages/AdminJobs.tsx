import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import { Check, ExternalLink, Search, ShieldAlert } from 'lucide-react';
import { candidate } from '@/lib/api';
import { safeExternalUrl } from '@/lib/safe-url';
import { CandidateJob } from '@/lib/types';
import { PageHeader } from '@/components/ui/page-header';
import { PageLoader } from '@/components/ui/spinner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

type ReviewStatus = 'published' | 'pending' | 'quarantined' | 'rejected';

const AdminJobs: React.FC = () => {
  const client = useQueryClient();
  const [status, setStatus] = useState<ReviewStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const [searchValue, setSearchValue] = useState('');
  const { data, isLoading, error } = useQuery(
    ['admin-jobs', status, search],
    () => candidate.adminJobs({ status: status === 'all' ? undefined : status, q: search || undefined }),
  );
  const mutation = useMutation(
    ({ id, review_status }: { id: string; review_status: ReviewStatus }) => candidate.reviewJob(id, review_status),
    {
      onSuccess: () => {
        client.invalidateQueries(['admin-jobs']);
        client.invalidateQueries('candidate-admin-overview');
      },
    },
  );
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchValue.trim());
  };
  return (
    <div className="space-y-4">
      <PageHeader
        title="Job quality review"
        description="Inspect source evidence and trust signals. Publishing a listing makes it visible to candidates; quarantined or rejected listings stay hidden."
      />

      {/* Filter row */}
      <form onSubmit={submit} className="card grid gap-3 p-5 sm:grid-cols-[1fr_200px_auto]">
        <label className="relative block">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            className="input pl-9"
            placeholder="Search title or company"
          />
        </label>
        <select value={status} onChange={(e) => setStatus(e.target.value as any)} className="input">
          <option value="all">All review states</option>
          <option value="pending">Pending</option>
          <option value="published">Published</option>
          <option value="quarantined">Quarantined</option>
          <option value="rejected">Rejected</option>
        </select>
        <Button type="submit">Search jobs</Button>
      </form>

      {isLoading ? (
        <PageLoader label="Loading job listings…" />
      ) : error ? (
        <div className="card p-5 text-sm text-destructive">{(error as Error).message}</div>
      ) : data?.data?.length ? (
        <div className="space-y-3">
          {data.data.map((job: CandidateJob & { review_status: string }) => (
            <article key={job.id} className="card p-5">
              <div className="flex flex-col justify-between gap-4 lg:flex-row">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant={
                        job.review_status === 'published'
                          ? 'success'
                          : job.review_status === 'quarantined' || job.review_status === 'rejected'
                            ? 'danger'
                            : 'warning'
                      }
                    >
                      {job.review_status}
                    </Badge>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      Trust {job.trust_score}/100 · {job.trust_band.replace('_', ' ')}
                    </span>
                    <Badge variant="outline">{job.source_site}</Badge>
                  </div>
                  <h2 className="mt-2.5 text-[15px] font-semibold tracking-[-0.01em]">{job.title}</h2>
                  <p className="mt-0.5 text-[13px] text-muted-foreground">
                    {job.company_name}
                    {job.location ? ` · ${job.location}` : ''}
                  </p>
                  <p className="mt-2.5 line-clamp-2 text-[12.5px] leading-relaxed text-muted-foreground">
                    {job.description || job.about_job || 'No description provided.'}
                  </p>

                  {/* Trust evidence */}
                  {job.trust_evidence && job.trust_evidence.length > 0 && (
                    <div className="mt-4">
                      <p className="eyebrow">Trust evidence</p>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                        {job.trust_evidence.map((item) => (
                          <div
                            key={item.signal}
                            className="rounded-lg border border-border bg-muted/40 px-3 py-2.5"
                          >
                            <div className="flex items-center justify-between gap-2 text-[11px]">
                              <span className="font-medium text-foreground">{item.signal}</span>
                              <span className="font-mono tabular-nums text-success">+{item.points}</span>
                            </div>
                            <p className="mt-1 text-[10.5px] leading-relaxed text-muted-foreground">
                              {item.detail}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex shrink-0 flex-wrap items-start gap-2 lg:w-44 lg:flex-col lg:items-stretch">
                  {safeExternalUrl(job.apply_url || job.job_url) ? (
                    <Button variant="outline" size="sm" asChild>
                      <a
                        href={safeExternalUrl(job.apply_url || job.job_url) as string}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open source
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </Button>
                  ) : null}
                  {job.review_status !== 'published' && (
                    <Button
                      variant="success"
                      size="sm"
                      disabled={mutation.isLoading}
                      onClick={() => mutation.mutate({ id: job.id, review_status: 'published' })}
                    >
                      <Check className="h-3.5 w-3.5" />
                      Publish
                    </Button>
                  )}
                  {job.review_status !== 'quarantined' && (
                    <Button
                      variant="warning"
                      size="sm"
                      disabled={mutation.isLoading}
                      onClick={() => mutation.mutate({ id: job.id, review_status: 'quarantined' })}
                    >
                      <ShieldAlert className="h-3.5 w-3.5" />
                      Quarantine
                    </Button>
                  )}
                  {job.review_status !== 'rejected' && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={mutation.isLoading}
                      onClick={() => mutation.mutate({ id: job.id, review_status: 'rejected' })}
                      className="border-destructive/30 text-destructive hover:bg-destructive-soft hover:text-destructive"
                    >
                      Reject listing
                    </Button>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="card p-8 text-center text-[13px] leading-relaxed text-muted-foreground">
          No jobs match this review filter. Job rows appear as configured sources run.
        </div>
      )}
      {mutation.error && <p className="text-[13px] text-destructive">{(mutation.error as Error).message}</p>}
    </div>
  );
};

export default AdminJobs;
