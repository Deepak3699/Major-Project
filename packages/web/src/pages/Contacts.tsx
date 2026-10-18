import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth';
import { contacts as contactsApi, HRContact } from '@/lib/api';
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
import { Avatar } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { PageHeader } from '@/components/ui/page-header';
import { PageLoader } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Pagination } from '@/components/ui/pagination';
import { useToast } from '@/components/ui/toast';
import { Plus, Search, RefreshCw, ChevronUp, ChevronDown, Trash2, Users, Pencil, Link2, Mail, Phone, ShieldCheck, ScanSearch } from 'lucide-react';
import { initials, formatDate } from '@/lib/format';

const PAGE_SIZE = 10;

const EMPTY_FORM = {
  full_name: '',
  linkedin_url: '',
  personal_email: '',
  personal_mobile: '',
  current_company_id: '',
  confidence_score: 0,
};

const confidenceColor = (score: number) =>
  score >= 80 ? 'bg-success' : score >= 50 ? 'bg-warning' : 'bg-destructive';

const Contacts: React.FC = () => {
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
  const [deleteTarget, setDeleteTarget] = useState<HRContact | null>(null);

  const isAdmin = user?.role === 'admin';

  const { data, isLoading, isError, error, refetch } = useQuery(
    ['contacts', pagination.pageIndex + 1, PAGE_SIZE, globalFilter],
    () => contactsApi.list({ page: pagination.pageIndex + 1, limit: PAGE_SIZE, search: globalFilter || undefined }),
  );

  const createMutation = useMutation((data: Partial<HRContact>) => contactsApi.create(data), {
    onSuccess: () => {
      queryClient.invalidateQueries('contacts');
      setShowForm(false);
      setFormData(EMPTY_FORM);
      toast({ title: 'Contact created', variant: 'success' });
    },
    onError: (err) => toast({ title: 'Failed to create contact', description: (err as Error).message, variant: 'error' }),
  });

  const updateMutation = useMutation(
    ({ id, data }: { id: string; data: Partial<HRContact> }) => contactsApi.update(id, data),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('contacts');
        setEditingId(null);
        setShowForm(false);
        setFormData(EMPTY_FORM);
        toast({ title: 'Contact updated', variant: 'success' });
      },
      onError: (err) => toast({ title: 'Failed to update contact', description: (err as Error).message, variant: 'error' }),
    },
  );

  const deleteMutation = useMutation((id: string) => contactsApi.remove(id), {
    onSuccess: () => {
      queryClient.invalidateQueries('contacts');
      toast({ title: 'Contact deleted', variant: 'success' });
    },
    onError: (err) => toast({ title: 'Failed to delete contact', description: (err as Error).message, variant: 'error' }),
  });

  const discoverMutation = useMutation(() => contactsApi.discover(), {
    onSuccess: (result) => {
      toast({ title: 'HR contact scan queued', description: `Checking up to ${result.limit} job listing and official careers pages. Search-discovered profiles stay in admin review until verified.`, variant: 'success' });
    },
    onError: (err) => toast({ title: 'Could not start contact discovery', description: (err as Error).message, variant: 'error' }),
  });

  const verifyMutation = useMutation((id: string) => contactsApi.verify(id), {
    onSuccess: () => {
      toast({ title: 'Verification queued', description: 'Email and phone status will update after the checker responds.', variant: 'success' });
      window.setTimeout(() => queryClient.invalidateQueries('contacts'), 2500);
      window.setTimeout(() => queryClient.invalidateQueries('contacts'), 8000);
    },
    onError: (err) => toast({ title: 'Could not verify contact', description: (err as Error).message, variant: 'error' }),
  });

  const contactData = (data as any) ?? { data: [], pagination: { page: 1, limit: 50, total: 0, pages: 0 } };
  const contacts: HRContact[] = contactData.data || [];

  const columnHelper = createColumnHelper<HRContact>();

  const columns = useMemo(
    () => [
      columnHelper.accessor('full_name', {
        header: 'Name',
        cell: (info) => {
          const name = info.getValue();
          return (
            <div className="flex items-center gap-2.5">
              <Avatar name={name || '?'} size="sm" />
              <span className="font-medium text-foreground">{name || '—'}</span>
            </div>
          );
        },
      }),
      columnHelper.accessor('personal_email', {
        header: 'Email',
        cell: (info) => {
          const v = info.getValue();
          return v ? (
            <span className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground">
              <Mail className="h-3.5 w-3.5" />
              {v}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          );
        },
      }),
      columnHelper.accessor('personal_mobile', {
        header: 'Mobile',
        cell: (info) => {
          const v = info.getValue();
          return v ? (
            <span className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground">
              <Phone className="h-3.5 w-3.5" />
              {v}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          );
        },
      }),
      columnHelper.accessor('linkedin_url', {
        header: 'LinkedIn',
        cell: (info) => {
          const url = info.getValue();
          return url ? (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[13px] text-info hover:underline"
            >
              <Link2 className="h-3.5 w-3.5" />
              Profile
            </a>
          ) : (
            <span className="text-muted-foreground">—</span>
          );
        },
      }),
      columnHelper.accessor('company_name', {
        header: 'Company',
        cell: (info) => <span className="text-[13px] text-muted-foreground">{info.getValue() || '—'}</span>,
      }),
      columnHelper.display({
        id: 'source',
        header: 'Source',
        cell: ({ row }) => row.original.contact_url ? <a href={row.original.contact_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-info hover:underline"><Link2 className="h-3.5 w-3.5" />{row.original.contact_source === 'direct_extracted' ? 'Public job page' : 'View source'}</a> : <span className="text-xs text-muted-foreground">Not recorded</span>,
      }),
      columnHelper.accessor('confidence_score', {
        header: 'Confidence',
        cell: (info) => {
          const score = info.getValue();
          return (
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                <div className={`h-1.5 rounded-full ${confidenceColor(score)}`} style={{ width: `${score}%` }} />
              </div>
              <span className="text-[13px] font-medium tabular-nums text-muted-foreground">{score}%</span>
            </div>
          );
        },
      }),
      columnHelper.display({
        id: 'verification',
        header: 'Verification',
        cell: ({ row }) => {
          const result = row.original.verification;
          if (!result?.checked_at) return <span className="text-xs text-muted-foreground">Not checked</span>;
          const states = [
            { label: 'Email', value: result.email_status },
            { label: 'Phone', value: result.phone_status },
          ].filter((entry) => entry.value && entry.value !== 'not_provided');
          return <div className="space-y-1.5" title={`Last checked ${formatDate(result.checked_at)}`}><div className="flex flex-wrap gap-1">{states.map(({ label, value }) => {
            const good = value === 'valid' || value === 'catch_all' || value === 'registered';
            const bad = value === 'invalid' || value === 'disposable' || value === 'not_registered';
            return <span key={label} className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${good ? 'border-success/20 bg-success-soft text-success' : bad ? 'border-destructive/20 bg-destructive-soft text-destructive' : 'border-warning/20 bg-warning-soft text-warning'}`}><ShieldCheck className="h-3 w-3" />{label}: {value?.replace(/_/g, ' ')}</span>;
          })}</div><span className="block text-[10px] text-muted-foreground">Checked {formatDate(result.checked_at)}</span></div>;
        },
      }),
      columnHelper.accessor('created_at', {
        header: 'Added',
        cell: (info) => <span className="text-[13px] text-muted-foreground">{formatDate(info.getValue())}</span>,
      }),
      columnHelper.display({
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => {
          const contact = row.original;
          return (
            <div className="flex items-center gap-1.5 whitespace-nowrap">
              <Button
                variant="ghost"
                size="icon-sm"
                title="Edit contact"
                onClick={() => {
                  setEditingId(contact.id);
                  setFormData({
                    full_name: contact.full_name || '',
                    linkedin_url: contact.linkedin_url || '',
                    personal_email: contact.personal_email || '',
                    personal_mobile: contact.personal_mobile || '',
                    current_company_id: contact.current_company_id || '',
                    confidence_score: contact.confidence_score,
                  });
                  setShowForm(true);
                }}
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                title="Verify email and phone"
                disabled={verifyMutation.isLoading || (!contact.personal_email && !contact.personal_mobile)}
                onClick={() => verifyMutation.mutate(contact.id)}
              >
                <ShieldCheck className="h-4 w-4" />
              </Button>
              {isAdmin ? (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  title="Delete contact"
                  className="text-destructive hover:bg-destructive-soft"
                  onClick={() => setDeleteTarget(contact)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              ) : null}
            </div>
          );
        },
      }),
    ],
    [isAdmin, verifyMutation.isLoading],
  );

  const table = useReactTable({
    data: contacts,
    columns,
    state: { sorting, globalFilter, pagination },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    manualPagination: true,
    pageCount: contactData.pagination?.pages ?? 0,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
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

  // Early returns must come after every hook (see Companies note) — otherwise
  // the hook count changes between loading/data renders and the page crashes.
  if (isLoading) return <PageLoader label="Loading contacts..." />;
  if (isError)
    return <ErrorState title="Failed to load contacts" message={(error as Error).message} onRetry={() => refetch()} />;

  return (
    <div className="space-y-4">
      <PageHeader
        title="HR Contacts"
        description="Discover contacts published on job pages, review their source, and check email or phone reachability."
        actions={
          <>
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={globalFilter ?? ''}
                onChange={(e) => setGlobalFilter(e.target.value)}
                placeholder="Search contacts…"
                className="input pl-9"
              />
            </div>
            <Button variant="outline" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
            {isAdmin && <Button variant="outline" onClick={() => discoverMutation.mutate()} loading={discoverMutation.isLoading}>
              <ScanSearch className="h-4 w-4" />
              Find HR contacts
            </Button>}
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" />
              Add Contact
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
                    <EmptyState icon={Users} title="No contacts found." description="Add your first HR contact or adjust your search." />
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

        {contactData.pagination && (
          <div className="border-t border-border">
            <Pagination pagination={contactData.pagination} onPageChange={(p) => setPagination({ ...pagination, pageIndex: p - 1 })} />
          </div>
        )}
      </div>

      <Modal
        open={showForm}
        onClose={() => {
          setShowForm(false);
          setEditingId(null);
        }}
        title={editingId ? 'Edit Contact' : 'Add Contact'}
      >
        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="label">Full Name</label>
            <Input value={formData.full_name} onChange={(e) => setFormData({ ...formData, full_name: e.target.value })} placeholder="Jane Doe" />
          </div>
          <div>
            <label className="label">Personal Email</label>
            <Input type="email" value={formData.personal_email} onChange={(e) => setFormData({ ...formData, personal_email: e.target.value })} placeholder="jane@example.com" />
          </div>
          <div>
            <label className="label">Personal Mobile</label>
            <Input value={formData.personal_mobile} onChange={(e) => setFormData({ ...formData, personal_mobile: e.target.value })} placeholder="+1 555 000 0000" />
          </div>
          <div className="md:col-span-2">
            <label className="label">LinkedIn URL</label>
            <Input type="url" value={formData.linkedin_url} onChange={(e) => setFormData({ ...formData, linkedin_url: e.target.value })} placeholder="https://linkedin.com/in/janedoe" />
          </div>
          <div>
            <label className="label">Company ID</label>
            <Input value={formData.current_company_id} onChange={(e) => setFormData({ ...formData, current_company_id: e.target.value })} placeholder="Company UUID" />
          </div>
          <div>
            <label className="label">Confidence Score (0–100)</label>
            <Input
              type="number"
              min={0}
              max={100}
              value={formData.confidence_score}
              onChange={(e) => setFormData({ ...formData, confidence_score: parseInt(e.target.value) || 0 })}
            />
          </div>
          <div className="flex gap-2 md:col-span-2">
            <Button type="submit" loading={createMutation.isLoading || updateMutation.isLoading}>
              {editingId ? 'Update Contact' : 'Create Contact'}
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
        title="Delete contact"
        description={`Are you sure you want to delete "${deleteTarget?.full_name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        loading={deleteMutation.isLoading}
      />
    </div>
  );
};

export default Contacts;
