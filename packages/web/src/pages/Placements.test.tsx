import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from 'react-query';
import { ToastProvider } from '@/components/ui/toast';
import { candidate, engagementAdmin } from '@/lib/api';
import type { PlacementOutcome } from '@/lib/types';
import Placements from './Placements';
import AdminPlacements from './AdminPlacements';

jest.mock('@/lib/api', () => {
  const actual = jest.requireActual<typeof import('@/lib/api')>('@/lib/api');
  return {
    ...actual,
    candidate: {
      ...actual.candidate,
      applications: jest.fn(),
      placements: jest.fn(),
      reportPlacement: jest.fn(),
    },
    engagementAdmin: {
      ...actual.engagementAdmin,
      placements: jest.fn(),
    },
  };
});

const PLACEMENT: PlacementOutcome = {
  id: 'p1',
  application_id: null,
  job_posting_id: null,
  company_name: 'Acme',
  role_title: 'Frontend Engineer',
  outcome: 'joined',
  joined_on: '2026-02-01',
  notes: 'Joined the platform team.',
  created_at: '2026-02-02T10:00:00.000Z',
  updated_at: '2026-02-02T10:00:00.000Z',
};

const renderPage = (ui: React.ReactElement) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <MemoryRouter>{ui}</MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  (candidate.applications as jest.Mock).mockReset().mockResolvedValue({
    data: [{
      id: 'a1',
      job_title: 'Frontend Engineer',
      company_name: 'Acme',
      status: 'APPLIED',
    }],
    pagination: { limit: 10, offset: 0, total: 1 },
  });
  (candidate.placements as jest.Mock).mockReset().mockResolvedValue({
    data: [PLACEMENT],
    pagination: { limit: 20, offset: 0, total: 1 },
  });
  (candidate.reportPlacement as jest.Mock).mockReset().mockResolvedValue({ placement: PLACEMENT });
  (engagementAdmin.placements as jest.Mock).mockReset().mockResolvedValue({
    data: [{ ...PLACEMENT, user_id: 'u1', user_email: 'cand@example.com' }],
    pagination: { limit: 25, offset: 0, total: 1 },
  });
});

describe('Placements page', () => {
  it('renders the voluntary report form and existing outcomes', async () => {
    renderPage(<Placements />);
    expect(await screen.findByText('Joined')).toBeTruthy();
    expect(screen.getByText(/Sharing a placement is optional/i)).toBeTruthy();
    expect(screen.getByText('Acme')).toBeTruthy();
    expect(screen.getByText('Frontend Engineer')).toBeTruthy();
  });

  it('shows an honest empty state without reports', async () => {
    (candidate.placements as jest.Mock).mockResolvedValue({
      data: [],
      pagination: { limit: 20, offset: 0, total: 0 },
    });
    renderPage(<Placements />);
    expect(await screen.findByText('No placements reported')).toBeTruthy();
    expect(screen.getByText(/Reporting is always optional/i)).toBeTruthy();
  });

  it('renders the error state when placements fail', async () => {
    (candidate.placements as jest.Mock).mockRejectedValue(new Error('Network unavailable'));
    renderPage(<Placements />);
    await waitFor(() => expect(screen.getByText('Network unavailable')).toBeTruthy());
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
  });

  it('submits a manual placement report', async () => {
    (candidate.placements as jest.Mock).mockResolvedValue({
      data: [],
      pagination: { limit: 20, offset: 0, total: 0 },
    });
    renderPage(<Placements />);
    await userEvent.type(await screen.findByLabelText('Company'), 'Globex');
    await userEvent.type(screen.getByLabelText('Role'), 'Backend Engineer');
    await userEvent.click(screen.getByRole('button', { name: /Save placement/i }));
    await waitFor(() => expect(candidate.reportPlacement).toHaveBeenCalledWith(expect.objectContaining({
      company_name: 'Globex',
      role_title: 'Backend Engineer',
      outcome: 'joined',
    })));
  });
});

describe('AdminPlacements page', () => {
  it('lists voluntary reports with candidate email', async () => {
    renderPage(<AdminPlacements />);
    expect(await screen.findByText('cand@example.com')).toBeTruthy();
    expect(screen.getByText('Acme')).toBeTruthy();
    expect(screen.getByText(/Read-only/i)).toBeTruthy();
  });

  it('renders an empty state for an unmatched search', async () => {
    (engagementAdmin.placements as jest.Mock).mockResolvedValue({
      data: [],
      pagination: { limit: 25, offset: 0, total: 0 },
    });
    renderPage(<AdminPlacements />);
    expect(await screen.findByText('No placement reports')).toBeTruthy();
  });
});
