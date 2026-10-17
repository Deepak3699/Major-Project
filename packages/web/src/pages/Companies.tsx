import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth';
import { companies as companiesApi, Company } from '@/lib/api';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  flexRender,
  createColumnHelper,
  SortingState,
} from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Modal } from '@/components/ui/modal';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { PageHeader } from '@/components/ui/page-header';
import { PageLoader } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Pagination } from '@/components/ui/pagination';
import { useToast } from '@/components/ui/toast';
import { Plus, Search, RefreshCw, ChevronUp, ChevronDown, Trash2, Building2, Pencil, Globe, Users } from 'lucide-react';
import { domainFromUrl, formatDate } from '@/lib/format';

const PAGE_SIZE = 10;

const EMPTY_FORM = {
  name: '',
  domain: '',
  about: '',
  industry: '',
  size_estimate: '',
  default_email: '',
  default_phone: '',
  website_url: '',
};

const Companies: React.FC = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { toast } = useToast();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: PAGE_SIZE });
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] = useState<Company | null>(null);

  const isAdmin = user?.role === 'admin';

  const { data, isLoading, isError, error, refetch } = useQuery(
    ['companies', pagination.pageIndex + 1, PAGE_SIZE, globalFilter],
    () => companiesApi.list({ page: pagination.pageIndex + 1, limit: PAGE_SIZE, search: globalFilter || undefined }),
  );

  const createMutation = useMutation((data: Partial<Company>) => companiesApi.create(data), {
    onSuccess: () => {
      queryClient.invalidateQueries('companies');
      setShowForm(false);
      setFormData(EMPTY_FORM);
      toast({ title: 'Company created', variant: 'success' });
    },
    onError: (err) => toast({ title: 'Failed to create company', description: (err as Error).message, variant: 'error' }),
  });

  const updateMutation = useMutation(
    ({ id, data }: { id: string; data: Partial<Company> }) => companiesApi.update(id, data),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('companies');
        setEditingId(null);
        setShowForm(false);
        setFormData(EMPTY_FORM);
        toast({ title: 'Company updated', variant: 'success' });
      },
      onError: (err) => toast({ title: 'Failed to update company', description: (err as Error).message, variant: 'error' }),
    },
  );

  const deleteMutation = useMutation((id: string) => companiesApi.remove(id), {
    onSuccess: () => {
      queryClient.invalidateQueries('companies');
      toast({ title: 'Company deleted', variant: 'success' });
    },
    onError: (err) => toast({ title: 'Failed to delete company', description: (err as Error).message, variant: 'error' }),
  });

  const companyData = (data as any) ?? { data: [], pagination: { page: 1, limit: 50, total: 0, pages: 0 } };
  const companies: Company[] = companyData.data || [];

  const columnHelper = createColumnHelper<Company>();

  const columns = useMemo(
    () => [
      columnHelper.accessor('name', {
        header: 'Name',
        cell: (info) => {
          const c = info.row.original;
          return (
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-muted text-sm font-bold text-muted-foreground">
                {c.name?.charAt(0)?.toUpperCase() || '?'}
              </span>
              <div className="min-w-0">
                <p className="truncate font-medium text-foreground">{c.name || '—'}</p>
                {c.website_url && (
                  <a
                    href={c.website_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
                  >
                    <Globe className="h-3 w-3" />
                    {domainFromUrl(c.website_url)}
                  </a>
                )}
              </div>
            </div>
          );
        },
      }),
      columnHelper.accessor('industry', {
        header: 'Industry',
        cell: (info) => {
          const v = info.getValue();
          return v ? <Badge variant="secondary">{v}</Badge> : <span className="text-muted-foreground">—</span>;
        },
      }),
      columnHelper.accessor('size_estimate', {
        header: 'Size',
        cell: (info) => <span className="text-[13px] text-muted-foreground">{info.getValue() || '—'}</span>,
      }),
      columnHelper.accessor('default_email', {
        header: 'Email',
        cell: (info) => {
          const v = info.getValue();
          return v ? <span className="text-[13px] text-muted-foreground">{v}</span> : <span className="text-muted-foreground">—</span>;
        },
      }),
      columnHelper.accessor('default_phone', {
        header: 'Phone',
        cell: (info) => <span className="text-[13px] text-muted-foreground">{info.getValue() || '—'}</span>,
      }),
      columnHelper.accessor('lead_count', {
        header: 'Leads',
        cell: (info) => (
          <span className="inline-flex items-center gap-1.5 text-[13px] font-medium tabular-nums">
            <Users className="h-3.5 w-3.5 text-muted-foreground" />
            {info.getValue() || 0}
          </span>
        ),
      }),
      columnHelper.accessor('created_at', {
        header: 'Added',
        cell: (info) => <span className="text-[13px] text-muted-foreground">{formatDate(info.getValue())}</span>,
      }),
      columnHelper.display({
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => {
          const company = row.original;
          return (
            <div className="flex items-center gap-1.5 whitespace-nowrap">
              <Button
                variant="ghost"
                size="icon-sm"
                title="Edit company"
                onClick={() => {
                  setEditingId(company.id);
                  setFormData({
                    name: company.name,
                    domain: company.domain || '',
                    about: company.about || '',
                    industry: company.industry || '',
                    size_estimate: company.size_estimate || '',
                    default_email: company.default_email || '',
                    default_phone: company.default_phone || '',
                    website_url: company.website_url || '',
                  });
                  setShowForm(true);
                }}
              >
                <Pencil className="h-4 w-4" />
              </Button>
              {isAdmin ? (
                <Button variant="ghost" size="icon-sm" title="Delete company" className="text-destructive hover:bg-destructive-soft" onClick={() => setDeleteTarget(company)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              ) : null}
            </div>
          );
        },
      }),
    ],
    [isAdmin],
  );

  const table = useReactTable({
    data: companies,
    columns,
    state: { sorting, globalFilter, pagination },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    manualPagination: true,
    pageCount: companyData.pagination?.pages ?? 0,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const openCreate = () => {
    setEditingId(null);
    setFormData(EMPTY_FORM);
    setShowForm(true);
  };

  // NOTE: these early returns must stay BELOW every hook (useMemo/useReactTable).
  // Returning before those hooks made the hook count differ between the loading
  // render (0 table hooks) and the data render (all table hooks), throwing React's
  // "Rendered more hooks than during the previous render" and blanking the page.
  if (isLoading) return <PageLoader label="Loading companies..." />;
  if (isError)
    return (
      <ErrorState
        title="Failed to load companies"
        message={(error as Error).message}
        onRetry={() => refetch()}
      />
    );

  return (
    <div className="space-y-4">
      <PageHeader
        title="Companies"
        description="Track the companies you're targeting"
        actions={
          <>
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={globalFilter ?? ''}
                onChange={(e) => setGlobalFilter(e.target.value)}
                placeholder="Search companies…"
                className="input pl-9"
              />
            </div>
            <Button variant="outline" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" />
              Add Company
            </Button>
          </>
        }
      />

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id} className="border-b border-border bg-muted/40">
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      className="table-th select-none"
                      onClick={header.column.getCanSort() ? header.column.getToggleSortingHandler() : undefined}
                      style={{ cursor: header.column.getCanSort() ? 'pointer' : 'default' }}
                    >
                      <span className="inline-flex items-center gap-1">
                        {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                        {header.column.getCanSort() && (
                          <span className="inline-flex flex-col">
                            <ChevronUp
                              className={`-mb-1 h-3 w-3 ${header.column.getIsSorted() === 'asc' ? 'text-primary' : 'text-muted-foreground/40'}`}
                            />
                            <ChevronDown
                              className={`h-3 w-3 ${header.column.getIsSorted() === 'desc' ? 'text-primary' : 'text-muted-foreground/40'}`}
                            />
                          </span>
                        )}
                      </span>
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="px-4 py-4">
                    <EmptyState icon={Building2} title="No companies found." description="Add your first company or adjust your search." />
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <tr key={row.id} className="border-b border-border transition-colors last:border-0 hover:bg-accent/50">
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="table-td">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {companyData.pagination && (
          <div className="border-t border-border">
            <Pagination pagination={companyData.pagination} onPageChange={(p) => setPagination({ ...pagination, pageIndex: p - 1 })} />
          </div>
        )}
      </div>

      <Modal
        open={showForm}
        onClose={() => {
          setShowForm(false);
          setEditingId(null);
        }}
        title={editingId ? 'Edit Company' : 'Add Company'}
      >
        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="label">Name *</label>
            <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="Acme Corp" required />
          </div>
          <div>
            <label className="label">Domain</label>
            <Input value={formData.domain} onChange={(e) => setFormData({ ...formData, domain: e.target.value })} placeholder="acme.com" />
          </div>
          <div>
            <label className="label">Industry</label>
            <Input value={formData.industry} onChange={(e) => setFormData({ ...formData, industry: e.target.value })} placeholder="Technology" />
          </div>
          <div>
            <label className="label">Size Estimate</label>
            <Input value={formData.size_estimate} onChange={(e) => setFormData({ ...formData, size_estimate: e.target.value })} placeholder="11-50" />
          </div>
          <div>
            <label className="label">Default Email</label>
            <Input type="email" value={formData.default_email} onChange={(e) => setFormData({ ...formData, default_email: e.target.value })} placeholder="hello@acme.com" />
          </div>
          <div>
            <label className="label">Default Phone</label>
            <Input value={formData.default_phone} onChange={(e) => setFormData({ ...formData, default_phone: e.target.value })} placeholder="+1 555 000 0000" />
          </div>
          <div className="md:col-span-2">
            <label className="label">Website URL</label>
            <Input type="url" value={formData.website_url} onChange={(e) => setFormData({ ...formData, website_url: e.target.value })} placeholder="https://acme.com" />
          </div>
          <div className="md:col-span-2">
            <label className="label">About</label>
            <Textarea value={formData.about} onChange={(e) => setFormData({ ...formData, about: e.target.value })} rows={3} placeholder="Short description of the company" />
          </div>
          <div className="flex gap-2 md:col-span-2">
            <Button type="submit" loading={createMutation.isLoading || updateMutation.isLoading}>
              {editingId ? 'Update Company' : 'Create Company'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setShowForm(false);
                setEditingId(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
          setDeleteTarget(null);
        }}
        title="Delete company"
        description={`Are you sure you want to delete "${deleteTarget?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        loading={deleteMutation.isLoading}
      />
    </div>
  );
};

export default Companies;