import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import {
  useReactTable, getCoreRowModel, getSortedRowModel, getFilteredRowModel,
  getPaginationRowModel, flexRender, createColumnHelper, SortingState,
  ColumnFiltersState, VisibilityState,
} from '@tanstack/react-table';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { leads as leadsApi, admin } from '@/lib/api';
import { Lead } from '@/lib/types';
import {
  Search, RefreshCw, ChevronUp, ChevronDown, ChevronRight, Play, Sparkles,
  BadgeCheck, FileText, MessageCircle, Mail, Eye, Users, XCircle, MoreVertical,
  Columns3, LayoutGrid, Download, Zap, ExternalLink, Phone, Copy, Check, Radar,
} from 'lucide-react';
import { useSSE, isLeadLifecycleEvent } from '@/hooks/useSSE';
import { useAuthStore } from '@/stores/auth';
import { useToast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/avatar';
import { Select } from '@/components/ui/select';
import { Menu } from '@/components/ui/menu';
import { PageHeader } from '@/components/ui/page-header';
import { PageLoader } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Pagination } from '@/components/ui/pagination';
import { SCORE_BAND_META, stageMeta, emailStatusMeta, whatsappStatusMeta, formatDate } from '@/lib/format';

type Density = 'comfortable' | 'compact';

// Providers offered in the manual "Enrich via" menu. `key` is what the API/worker
// route on; hint tells the operator which need a configured key.
const ENRICH_PROVIDERS = [
  { key: 'auto', label: 'Full Army (auto)', hint: 'free OSINT cascade', icon: Radar },
  { key: 'contactout', label: 'ContactOut', hint: 'LinkedIn-based · key', icon: ExternalLink },
  { key: 'snovio', label: 'Snov.io', hint: 'name+domain · key', icon: Mail },
  { key: 'hunter', label: 'Hunter.io', hint: 'key', icon: Mail },
  { key: 'apollo', label: 'Apollo.io', hint: 'key', icon: Sparkles },
] as const;

const ALL_COLUMNS = [
  { id: 'lead_score', label: 'Score' }, { id: 'company_name', label: 'Company' },
  { id: 'job_title', label: 'Job Title' }, { id: 'hr_name', label: 'HR Contact' },
  { id: 'verification', label: 'Verification' }, { id: 'stage', label: 'Stage' },
  { id: 'source_site', label: 'Source' }, { id: 'created_at', label: 'Discovered' },
];

const Leads: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 25 });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [draftChannel, setDraftChannel] = useState<'email' | 'whatsapp' | 'both'>('both');
  const [experienceFilter, setExperienceFilter] = useState<'' | 'fresher' | '0-1yr' | '0-2yr' | 'no-experience'>('');
  const [visibility, setVisibility] = useState<VisibilityState>({});
  const [density, setDensity] = useState<Density>('comfortable');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const sortParam = sorting.length > 0 ? sorting[0].id : 'created_at';
  const sortOrder = sorting.length > 0 ? (sorting[0].desc ? 'desc' : 'asc') : 'desc';
  const scoreBand = columnFilters.find((f) => f.id === 'score_band')?.value as string | undefined;
  const pipelineStage = columnFilters.find((f) => f.id === 'pipeline_stage')?.value as string | undefined;
  const sourceSite = columnFilters.find((f) => f.id === 'source_site')?.value as string | undefined;
  const page = pagination.pageIndex + 1;

  const { data, isLoading, refetch, isFetching, isError, error } = useQuery(
    ['leads', page, pagination.pageSize, sortParam, sortOrder, scoreBand, pipelineStage, sourceSite, globalFilter, experienceFilter],
    () => leadsApi.list({
      page, limit: pagination.pageSize, sort_by: sortParam as any, sort_order: sortOrder as any,
      score_band: scoreBand, pipeline_stage: pipelineStage, source_site: sourceSite,
      filter: globalFilter || undefined, experience: experienceFilter || undefined,
    }),
    { staleTime: 15000, refetchInterval: 20000, onError: () => {} },
  );

  useSSE('/sse/token', (event) => {
    if (isLeadLifecycleEvent(event.type)) {
      refetch();
    }
  });

  const { data: armyStatus } = useQuery('army-status', () => admin.armyStatus(), { refetchInterval: 5000, refetchOnWindowFocus: false });
  const queued = armyStatus ? (armyStatus.raw || 0) + (armyStatus.enrichment || 0) + (armyStatus.verification || 0) + (armyStatus.draft || 0) : 0;
  const armyMutation = useMutation(() => admin.runArmy(), {
    onSuccess: (d: any) => { toast({ title: 'Army deployed', description: d?.sweep_reenqueued ? `Scraping all sources + re-enriching ${d.sweep_reenqueued} leads.` : 'Scraping all sources.', variant: 'success' }); queryClient.invalidateQueries(['army-status']); },
    onError: (e) => toast({ title: 'Could not start army', description: (e as Error).message, variant: 'error' }),
  });

  const runAction = (fn: Promise<unknown>, successMsg: string) =>
    fn.then(() => { toast({ title: successMsg, variant: 'success' }); queryClient.invalidateQueries('leads'); })
      .catch((err: Error) => toast({ title: 'Action failed', description: err.message, variant: 'error' }));

  const enrich = (id: string, provider: string) => runAction(leadsApi.enrich(id, provider), provider === 'auto' ? 'Full-army enrichment started' : `${provider} enrichment started`);

  const bulkEnrichMutation = useMutation(
    ({ ids, provider }: { ids: string[]; provider: string }) => Promise.all(ids.map((id) => leadsApi.enrich(id, provider))),
    { onSuccess: (_r, v) => { toast({ title: `Enrichment started`, description: `${v.ids.length} leads → ${v.provider}`, variant: 'success' }); setSelectedIds(new Set()); queryClient.invalidateQueries('leads'); }, onError: (e) => toast({ title: 'Bulk enrich failed', description: (e as Error).message, variant: 'error' }) },
  );
  const bulkDraftMutation = useMutation(
    ({ leadIds, channel }: { leadIds: string[]; channel: 'email' | 'whatsapp' | 'both' }) => leadsApi.bulkDraft(leadIds, channel),
    { onSuccess: () => { setSelectedIds(new Set()); queryClient.invalidateQueries('leads'); toast({ title: 'Drafts generated', variant: 'success' }); }, onError: (e) => toast({ title: 'Failed to generate drafts', description: (e as Error).message, variant: 'error' }) },
  );

  const leadData: any = data ?? { data: [], pagination: { page: 1, limit: 25, total: 0, pages: 0 } };
  const leadRows: Lead[] = leadData.data || [];

  const toggleSelectAll = () => {
    const allIds = leadRows.map((r) => r.id);
    const allSel = allIds.length > 0 && allIds.every((id) => selectedIds.has(id));
    setSelectedIds(allSel ? new Set() : new Set(allIds));
  };
  const toggleSelect = (id: string) => setSelectedIds((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleExpand = (id: string) => setExpanded((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const exportCsv = () => {
    const cols = table.getAllLeafColumns().filter((c) => visibility[c.id] !== false && !['select', 'actions', 'expand', 'verification'].includes(c.id));
    const header = cols.map((c) => c.id).join(',');
    const lines = leadRows.map((r: any) => cols.map((c) => `"${String(r[c.id] ?? '').replace(/"/g, '""')}"`).join(','));
    const blob = new Blob([[header, ...lines].join('\n')], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `hiregen-leads-page${page}.csv`; a.click();
  };

  const columnHelper = createColumnHelper<Lead & Record<string, any>>();

  const columns = useMemo(() => [
    columnHelper.display({ id: 'select', size: 40, header: () => (
      <input type="checkbox" aria-label="Select all" checked={leadRows.length > 0 && leadRows.every((r) => selectedIds.has(r.id))} onChange={toggleSelectAll} className="h-4 w-4 cursor-pointer rounded border-input accent-primary" />
    ), cell: ({ row }) => (
      <input type="checkbox" aria-label="Select row" checked={selectedIds.has(row.original.id)} onChange={() => toggleSelect(row.original.id)} className="h-4 w-4 cursor-pointer rounded border-input accent-primary" onClick={(e) => e.stopPropagation()} />
    ) }),
    columnHelper.display({ id: 'expand', size: 34, header: () => null, cell: ({ row }) => (
      <button onClick={(e) => { e.stopPropagation(); toggleExpand(row.original.id); }} className="grid h-6 w-6 place-items-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground" aria-label="Expand">
        <ChevronRight className={`h-4 w-4 transition-transform ${expanded.has(row.original.id) ? 'rotate-90' : ''}`} />
      </button>
    ) }),
    columnHelper.accessor('lead_score', { header: 'Score', cell: (info) => {
      const band = info.row.original.score_band as 'hot' | 'warm' | 'cold'; const meta = SCORE_BAND_META[band];
      return <div className="flex items-center gap-2"><span className="inline-flex h-8 w-8 items-center justify-center rounded-full border bg-muted text-[13px] font-bold tabular-nums text-gradient">{info.getValue()}</span>{meta && <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />}</div>;
    } }),
    columnHelper.accessor('company_name', { header: 'Company', cell: (info) => (
      <div className="min-w-0"><p className="truncate font-medium text-foreground">{info.getValue() || '—'}</p>{info.row.original.company_domain && <p className="truncate text-xs text-muted-foreground">{info.row.original.company_domain}</p>}</div>
    ) }),
    columnHelper.accessor('job_title', { header: 'Job Title', cell: (info) => <span className="line-clamp-1 text-muted-foreground">{info.getValue() || info.row.original.source_site || '—'}</span> }),
    columnHelper.accessor('hr_name', { header: 'HR Contact', cell: (info) => {
      const lead = info.row.original;
      return lead.hr_name ? (
        <div className="flex items-center gap-2.5"><Avatar name={lead.hr_name} size="sm" /><div className="min-w-0"><p className="truncate text-[13px] font-medium">{lead.hr_name}</p>{lead.hr_email && <p className="truncate text-xs text-muted-foreground">{lead.hr_email}</p>}</div></div>
      ) : <span className="inline-flex items-center gap-1.5 rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-[11px] font-medium text-warning"><Sparkles className="h-3 w-3" />needs enrichment</span>;
    } }),
    columnHelper.display({ id: 'verification', header: 'Verification', cell: ({ row }) => {
      const lead = row.original; const em = emailStatusMeta(lead.email_status); const wm = whatsappStatusMeta(lead.whatsapp_status);
      return <div className="flex flex-wrap gap-1.5">{em && <Badge className={em.className}>{em.label}</Badge>}{wm && <Badge className={wm.className}>{wm.label}</Badge>}</div>;
    } }),
    columnHelper.display({ id: 'stage', header: 'Stage', cell: ({ row }) => { const meta = stageMeta(row.original.pipeline_stage); return <Badge className={meta.className}><span className="capitalize">{meta.label}</span></Badge>; } }),
    columnHelper.accessor('source_site', { header: 'Source', cell: (info) => <span className="text-[13px] capitalize text-muted-foreground">{info.getValue() || '—'}</span> }),
    columnHelper.accessor('created_at', { header: 'Discovered', cell: (info) => <span className="text-[13px] text-muted-foreground">{formatDate(info.getValue())}</span> }),
    columnHelper.display({ id: 'actions', header: () => <MoreVertical className="h-4 w-4 text-muted-foreground" />, cell: ({ row }) => {
      const lead = row.original;
      return (
        <div className="flex items-center justify-end gap-1">
          <Button onClick={(e) => { e.stopPropagation(); navigate(`/leads/${lead.id}`); }} variant="ghost" size="icon-sm" title="Open"><Eye className="h-4 w-4" /></Button>
          <Menu ariaLabel="Row actions" align="end" trigger={<span className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"><MoreVertical className="h-4 w-4" /></span>} items={[
            { label: 'View full details', icon: <Eye />, onSelect: () => navigate(`/leads/${lead.id}`) },
            { label: 'Enrich via…', icon: <Sparkles />, onSelect: () => {} },
            ...ENRICH_PROVIDERS.map((p) => ({ label: `  ${p.label}`, hint: p.hint, icon: <Zap />, onSelect: () => enrich(lead.id, p.key) })),
            { label: 'Verify contacts', icon: <BadgeCheck />, onSelect: () => runAction(leadsApi.verify(lead.id), 'Verification started') },
            { label: 'Generate draft', icon: <FileText />, onSelect: () => runAction(leadsApi.draft(lead.id, 'both'), 'Draft started') },
            { label: lead.do_not_contact ? 'Allow contact' : 'Mark Do-Not-Contact', icon: <XCircle />, danger: !lead.do_not_contact, onSelect: () => runAction(leadsApi.setDoNotContact(lead.id, !lead.do_not_contact), 'Updated') },
          ]} />
        </div>
      );
    } }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [leadRows, selectedIds, expanded, visibility, density, navigate, toast]);

  const table = useReactTable({
    data: leadRows, columns, state: { sorting, columnFilters, globalFilter, pagination, columnVisibility: visibility },
    onSortingChange: setSorting, onColumnFiltersChange: setColumnFilters, onGlobalFilterChange: setGlobalFilter,
    onPaginationChange: setPagination, onColumnVisibilityChange: setVisibility,
    getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel(), getFilteredRowModel: getFilteredRowModel(), getPaginationRowModel: getPaginationRowModel(),
    manualPagination: true, manualSorting: true, manualFiltering: true, pageCount: leadData.pagination?.pages ?? 0,
  });

  if (isLoading) return <PageLoader label="Loading leads..." />;
  if (isError) return <ErrorState title="Error loading leads" message={(error as Error).message} onRetry={() => (error instanceof Error && error.message?.includes('401') ? (navigate('/login')) : refetch())} />;

  const pad = density === 'compact' ? 'py-1.5' : 'py-3.5';

  return (
    <div className="space-y-4">
      <PageHeader title="Leads" description="Your full India-fresher intelligence table — enrich, verify and draft any lead, one at a time or in bulk" actions={
        <>
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input value={globalFilter} onChange={(e) => setGlobalFilter(e.target.value)} placeholder="Search leads…" className="input pl-9" />
          </div>
          <Button variant="outline" onClick={() => armyMutation.mutate()} loading={armyMutation.isLoading} title="Scrape every source and auto-enrich all leads">
            <Zap className="h-4 w-4" />{armyMutation.isLoading ? 'Deploying…' : queued > 0 ? `Army · ${queued} running` : 'Run Army'}
          </Button>
        </>
      } />

      {/* toolbar */}
      <div className="card flex flex-wrap items-center gap-2 p-3">
        <Select value={experienceFilter} onChange={(e) => setExperienceFilter(e.target.value as never)} className="w-40" aria-label="Experience"><option value="">All experience</option><option value="fresher">Fresher</option><option value="0-1yr">0-1 years</option><option value="0-2yr">0-2 years</option><option value="no-experience">No experience</option></Select>
        <Select value={scoreBand || ''} onChange={(e) => setColumnFilters((f) => [...f.filter((x) => x.id !== 'score_band'), ...(e.target.value ? [{ id: 'score_band', value: e.target.value }] : [])])} className="w-32" aria-label="Score"><option value="">All scores</option><option value="hot">Hot ≥70</option><option value="warm">Warm 40+</option><option value="cold">Cold</option></Select>
        <Select value={pipelineStage || ''} onChange={(e) => setColumnFilters((f) => [...f.filter((x) => x.id !== 'pipeline_stage'), ...(e.target.value ? [{ id: 'pipeline_stage', value: e.target.value }] : [])])} className="w-40" aria-label="Stage"><option value="">All stages</option><option value="discovered">New</option><option value="enriched">Enriched</option><option value="verified">Verified</option><option value="drafted">Ready to send</option><option value="contacted">Sent</option><option value="replied">Replied</option><option value="bounced">Failed</option><option value="contact_unavailable">Needs enrichment</option><option value="verification_failed">Verify failed</option><option value="send_failed">Send failed</option><option value="suppressed">Suppressed</option></Select>
        <div className="h-6 w-px bg-border" />
        <Menu align="start" ariaLabel="Columns" trigger={<Button variant="outline" size="sm"><Columns3 className="h-4 w-4" />Columns</Button>} items={ALL_COLUMNS.map((c) => ({ label: c.label, checked: visibility[c.id] !== false, onSelect: () => setVisibility((v) => ({ ...v, [c.id]: v[c.id] === false })) }))} />
        <Menu align="start" ariaLabel="Density" trigger={<Button variant="outline" size="sm"><LayoutGrid className="h-4 w-4" />{density}</Button>} items={[{ label: 'Comfortable', checked: density === 'comfortable', onSelect: () => setDensity('comfortable') }, { label: 'Compact', checked: density === 'compact', onSelect: () => setDensity('compact') }]} />
        <Button variant="outline" size="sm" onClick={exportCsv}><Download className="h-4 w-4" />Export</Button>
        <div className="ml-auto flex items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${queued > 0 ? 'border-success/40 bg-success/10 text-success' : 'border-border text-muted-foreground'}`}><Radar className={`h-3 w-3 ${queued > 0 ? 'animate-pulse' : ''}`} />{queued > 0 ? `${queued} processing` : 'idle'}</span>
          <Button variant="outline" size="sm" onClick={() => refetch()} loading={isFetching}><RefreshCw className="h-4 w-4" /></Button>
        </div>
      </div>

      {/* bulk bar */}
      <AnimatePresence>
        {selectedIds.size > 0 && (
          <motion.div initial={{ opacity: 0, y: -8, height: 0 }} animate={{ opacity: 1, y: 0, height: 'auto' }} exit={{ opacity: 0, y: -8, height: 0 }} className="overflow-hidden">
            <div className="card flex flex-wrap items-center gap-2.5 border-primary/30 bg-primary-soft/60 px-4 py-3">
              <Users className="h-4 w-4 text-primary" /><span className="text-sm font-medium">{selectedIds.size} selected</span>
              <div className="h-5 w-px bg-border" />
              <span className="text-xs text-muted-foreground">Enrich via:</span>
              {ENRICH_PROVIDERS.map((p) => <Button key={p.key} variant="secondary" size="sm" onClick={() => { if (window.confirm(`Enrich ${selectedIds.size} leads via ${p.label}? Credits are consumed per lead (on-demand).`)) bulkEnrichMutation.mutate({ ids: Array.from(selectedIds), provider: p.key }); }}><Sparkles className="h-3.5 w-3.5" />{p.label.replace(' (auto)', '')}</Button>)}
              <Select value={draftChannel} onChange={(e) => setDraftChannel(e.target.value as any)} className="h-8 w-32" aria-label="Channel"><option value="both">Both</option><option value="email">Email</option><option value="whatsapp">WhatsApp</option></Select>
              <Button size="sm" onClick={() => { if (window.confirm(`Generate drafts for ${selectedIds.size} leads?`)) bulkDraftMutation.mutate({ leadIds: Array.from(selectedIds), channel: draftChannel }); }} loading={bulkDraftMutation.isLoading}><Play className="h-3.5 w-3.5" />Draft</Button>
              <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setSelectedIds(new Set())}>Clear</Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* table */}
      <div className="card overflow-hidden">
        <div className="max-h-[calc(100vh-280px)] overflow-auto">
          <table className="w-full border-separate border-spacing-0">
            <thead className="sticky top-0 z-20">
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id}>
                  {hg.headers.map((header) => {
                    const canSort = header.column.getCanSort();
                    const active = header.column.getIsSorted();
                    return (
                      <th key={header.id} onClick={canSort ? header.column.getToggleSortingHandler() : undefined} style={{ width: header.getSize() }} className={`table-th sticky top-0 bg-surface/90 backdrop-blur-xl ${canSort ? 'cursor-pointer select-none hover:text-foreground' : ''}`}>
                        <span className="inline-flex items-center gap-1">
                          {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                          {canSort && <span className="inline-flex flex-col">{active === 'asc' ? <ChevronUp className="h-3 w-3 text-primary" /> : active === 'desc' ? <ChevronDown className="h-3 w-3 text-primary" /> : <ChevronUp className="h-3 w-3 opacity-30" />}</span>}
                        </span>
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.length === 0 ? (
                <tr><td colSpan={columns.length} className="p-4"><EmptyState icon={Users} title="No leads found." description="Deploy the army to discover India fresher jobs, or adjust your search." action={<Button variant="outline" size="sm" onClick={() => armyMutation.mutate()}><Zap className="h-3.5 w-3.5" />Run Army</Button>} /></td></tr>
              ) : table.getRowModel().rows.map((row) => {
                const open = expanded.has(row.original.id);
                const lead: any = row.original;
                return (
                  <React.Fragment key={row.id}>
                    <tr onClick={() => toggleExpand(row.original.id)} className={`group cursor-pointer border-b border-border transition-colors last:border-0 hover:bg-accent/50 ${selectedIds.has(row.original.id) ? 'bg-primary-soft/30' : ''}`}>
                      {row.getVisibleCells().map((cell) => <td key={cell.id} className={`table-td ${pad}`}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}
                    </tr>
                    <AnimatePresence initial={false}>
                      {open && (
                        <tr>
                          <td colSpan={columns.length} className="border-b border-border p-0">
                            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }} className="overflow-hidden">
                              <div className="grid grid-cols-1 gap-4 bg-muted/30 px-6 py-4 md:grid-cols-3">
                                <DetailBlock title="Contact"><KV k="HR" v={lead.hr_name || '—'} /><KV k="Email" v={lead.hr_email} copyable mailto /><KV k="Phone" v={lead.hr_mobile} /><KV k="LinkedIn" v={lead.hr_linkedin_url} link /></DetailBlock>
                                <DetailBlock title="Company & Job"><KV k="Company" v={lead.company_name} /><KV k="Domain" v={lead.company_domain} link /><KV k="Job" v={lead.job_title} /><KV k="Source" v={lead.source_site} /></DetailBlock>
                                <DetailBlock title="Pipeline">
                                  <div className="mb-2 text-[11px] text-muted-foreground">Manual enrichment</div>
                                  <div className="flex flex-wrap gap-1.5">{ENRICH_PROVIDERS.map((p) => <Button key={p.key} size="sm" variant="secondary" onClick={() => enrich(lead.id, p.key)}><p.icon className="h-3.5 w-3.5" />{p.label.replace(' (auto)', '')}</Button>)}</div>
                                  <div className="mt-3 flex flex-wrap gap-1.5">
                                    <Button size="sm" variant="soft" onClick={() => runAction(leadsApi.verify(lead.id), 'Verifying')}><BadgeCheck className="h-3.5 w-3.5" />Verify</Button>
                                    <Button size="sm" variant="soft" onClick={() => runAction(leadsApi.draft(lead.id, 'both'), 'Drafting')}><FileText className="h-3.5 w-3.5" />Draft</Button>
                                    <Button size="sm" variant="outline" onClick={() => navigate(`/leads/${lead.id}`)}><Eye className="h-3.5 w-3.5" />Open</Button>
                                  </div>
                                </DetailBlock>
                              </div>
                            </motion.div>
                          </td>
                        </tr>
                      )}
                    </AnimatePresence>
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        {leadData.pagination && <div className="border-t border-border"><Pagination pagination={leadData.pagination} onPageChange={(p: number) => setPagination({ ...pagination, pageIndex: p - 1 })} /></div>}
      </div>
    </div>
  );
};

function DetailBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return <div><p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</p><div className="space-y-1">{children}</div></div>;
}
function KV({ k, v, link, mailto, copyable }: { k: string; v?: string | null; link?: boolean; mailto?: boolean; copyable?: boolean }) {
  const [copied, setCopied] = useState(false);
  const show = v && v !== '—';
  return (
    <div className="flex items-center gap-2 text-[13px]">
      <span className="w-16 shrink-0 text-muted-foreground">{k}</span>
      {show && link ? <a href={v!.startsWith('http') ? v : `https://${v}`} target="_blank" rel="noreferrer" className="truncate text-info hover:underline">{v}</a>
        : show && mailto ? <a href={`mailto:${v}`} className="truncate text-info hover:underline">{v}</a>
        : <span className="truncate text-foreground">{v || '—'}</span>}
      {show && copyable && <button onClick={() => { navigator.clipboard?.writeText(v!); setCopied(true); setTimeout(() => setCopied(false), 1200); }} className="shrink-0 text-muted-foreground hover:text-foreground" title="Copy">{copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}</button>}
    </div>
  );
}

export default Leads;
