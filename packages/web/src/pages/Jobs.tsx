import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { BriefcaseBusiness, Search, SlidersHorizontal } from 'lucide-react';
import { candidate } from '@/lib/api';
import { JobCard } from '@/components/candidate/JobCard';
import { PageLoader } from '@/components/ui/spinner';
import { PageHeader } from '@/components/ui/page-header';

const Jobs: React.FC = () => {
  const queryClient = useQueryClient();
  const [input, setInput] = useState('');
  const [filters, setFilters] = useState<Record<string, unknown>>({ days: 7, page: 1, limit: 20, sort: 'newest' });
  const [savingId, setSavingId] = useState<string | null>(null);
  const { data, isLoading, error } = useQuery(['candidate-jobs', filters], () => candidate.jobs(filters), { keepPreviousData: true });
  const saveMutation = useMutation((id: string) => candidate.saveJob(id), {
    onMutate: (id) => setSavingId(id),
    onSettled: () => { setSavingId(null); queryClient.invalidateQueries('candidate-applications'); queryClient.invalidateQueries('candidate-summary'); },
  });

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setFilters((current) => ({ ...current, q: input.trim() || undefined, page: 1 }));
  };
  const setFilter = (key: string, value: unknown) => setFilters((current) => ({ ...current, [key]: value, page: 1 }));

  return (
    <div className="space-y-5">
      <PageHeader title="Discover jobs" description="Search all trusted recent listings. Your profile match score is shown on each job when your profile is available." />
      <form onSubmit={submit} className="card grid gap-3 p-4 md:grid-cols-[1fr_200px_170px_auto]">
        <label className="relative block"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Role, company, or skill" className="input pl-9" /></label>
        <label className="relative"><span className="sr-only">Location</span><input value={String(filters.location || '')} onChange={(e) => setFilter('location', e.target.value || undefined)} placeholder="City or region" className="input" /></label>
        <label><span className="sr-only">Work setup</span><select value={String(filters.work_type || '')} onChange={(e) => setFilter('work_type', e.target.value || undefined)} className="input"><option value="">Any work setup</option><option value="remote">Remote</option><option value="hybrid">Hybrid</option><option value="onsite">On-site</option></select></label>
        <button type="submit" className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary-hover"><Search className="h-4 w-4" />Search</button>
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3 md:col-span-4"><SlidersHorizontal className="h-4 w-4 text-muted-foreground" /><span className="mr-1 text-xs text-muted-foreground">Posted within</span>{[7, 14, 30].map((days) => <button key={days} type="button" onClick={() => setFilter('days', days)} className={`rounded-full border px-3 py-1 text-xs transition ${filters.days === days ? 'border-primary/50 bg-primary-soft text-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}>{days} days</button>)}<span className="ml-auto text-xs text-muted-foreground">Sorted by recent</span></div>
      </form>
      <div className="flex items-center justify-between"><p className="text-sm text-muted-foreground">{data?.pagination.total ?? 0} matching jobs</p>{error && <span className="text-xs text-destructive">{(error as Error).message}</span>}</div>
      {isLoading ? <PageLoader label="Finding recent jobs…" /> : data?.data?.length ? <div className="space-y-3">{data.data.map((job) => <JobCard key={job.id} job={job} saving={savingId === job.id} onSave={(item) => saveMutation.mutate(item.id)} />)}</div> : <div className="card flex flex-col items-center p-10 text-center"><BriefcaseBusiness className="h-8 w-8 text-muted-foreground" /><h2 className="mt-3 font-semibold">No roles found in this window</h2><p className="mt-1 max-w-md text-sm text-muted-foreground">Try a broader search or a longer date window. New listings appear when an enabled source run completes.</p></div>}
      {data && data.pagination.pages > 1 && <div className="flex items-center justify-center gap-3"><button disabled={Number(filters.page) <= 1} onClick={() => setFilter('page', Number(filters.page) - 1)} className="rounded-lg border border-border px-3 py-2 text-sm disabled:opacity-40">Previous</button><span className="text-xs text-muted-foreground">Page {Number(filters.page)} of {data.pagination.pages}</span><button disabled={Number(filters.page) >= data.pagination.pages} onClick={() => setFilter('page', Number(filters.page) + 1)} className="rounded-lg border border-border px-3 py-2 text-sm disabled:opacity-40">Next</button></div>}
    </div>
  );
};

export default Jobs;
