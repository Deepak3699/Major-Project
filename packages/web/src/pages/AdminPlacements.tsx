import React, { useState } from 'react';
import { useQuery } from 'react-query';
import { Award, Search } from 'lucide-react';
import { engagementAdmin } from '@/lib/api';
import { PlacementOutcome } from '@/lib/types';
import { PageHeader } from '@/components/ui/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/empty-state';
import { formatDate, formatDateTime } from '@/lib/format';

const AdminPlacements: React.FC = () => {
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const limit = 25;
  const placements = useQuery(
    ['admin-placements', search, offset],
    () => engagementAdmin.placements(search, limit, offset),
    { keepPreviousData: true },
  );

  const rows = placements.data?.data || [];
  const total = placements.data?.pagination.total || 0;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Placement outcomes"
        description="Voluntary placement reports shared by candidates. Read-only; use them to understand outcomes without exposing private data to other users."
      />

      <section className="card overflow-hidden" aria-labelledby="admin-placements-heading">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div>
            <p id="admin-placements-heading" className="eyebrow">Reports</p>
            <p className="mt-1 text-[12.5px] text-muted-foreground">{total} voluntary placement {total === 1 ? 'report' : 'reports'}.</p>
          </div>
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="Search placements"
              value={search}
              onChange={(event) => { setSearch(event.target.value); setOffset(0); }}
              placeholder="Search email, company or role"
              className="pl-8"
            />
          </div>
        </div>

        {placements.isLoading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 5 }).map((_, index) => <div key={index} className="skeleton h-12 w-full" />)}</div>
        ) : placements.isError ? (
          <div className="flex items-center justify-between gap-3 px-4 py-6">
            <p className="text-[13px] text-destructive">{(placements.error as Error)?.message || 'Placements could not be loaded.'}</p>
            <Button variant="outline" size="sm" onClick={() => placements.refetch()}>Retry</Button>
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Award}
            title="No placement reports"
            description={search ? 'No report matches this search.' : 'Voluntary placement reports will appear here.'}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[56rem] border-collapse text-left">
              <thead>
                <tr className="border-b border-border bg-muted/40 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                  <th className="px-4 py-2 font-normal">Candidate</th>
                  <th className="px-4 py-2 font-normal">Company / role</th>
                  <th className="px-4 py-2 font-normal">Outcome</th>
                  <th className="px-4 py-2 font-normal">Joined</th>
                  <th className="px-4 py-2 font-normal">Reported</th>
                  <th className="px-4 py-2 font-normal">Notes</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((item: PlacementOutcome) => (
                  <tr key={item.id} className="border-b border-border last:border-0 hover:bg-accent/40">
                    <td className="px-4 py-2.5 text-[12.5px] text-foreground">{item.user_email || item.user_id}</td>
                    <td className="px-4 py-2.5">
                      <p className="text-[13px] font-medium text-foreground">{item.role_title}</p>
                      <p className="text-[12px] text-muted-foreground">{item.company_name}</p>
                    </td>
                    <td className="px-4 py-2.5"><Badge variant={item.outcome === 'joined' ? 'success' : 'signal'}>{item.outcome === 'joined' ? 'Joined' : 'Offer received'}</Badge></td>
                    <td className="whitespace-nowrap px-4 py-2.5 font-mono text-[11px] text-muted-foreground">{item.joined_on ? formatDate(item.joined_on) : '—'}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 font-mono text-[11px] text-muted-foreground">{formatDateTime(item.created_at)}</td>
                    <td className="max-w-[22rem] px-4 py-2.5 text-[12px] text-foreground/80">{item.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-2.5">
          <p className="font-mono text-[10.5px] tabular-nums text-muted-foreground">{total === 0 ? '0' : `${offset + 1}–${Math.min(offset + limit, total)}`} of {total}</p>
          <div className="flex gap-1.5">
            <Button variant="outline" size="sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))}>Previous</Button>
            <Button variant="outline" size="sm" disabled={offset + limit >= total} onClick={() => setOffset(offset + limit)}>Next</Button>
          </div>
        </div>
      </section>
    </div>
  );
};

export default AdminPlacements;
