import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from 'react-query';
import Duplicates from './Duplicates';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

jest.mock('@/lib/api', () => ({
  leads: {
    list: jest.fn(),
    enrich: jest.fn(),
    verify: jest.fn(),
    draft: jest.fn(),
    send: jest.fn(),
    timeline: jest.fn(),
    bulkDraft: jest.fn(),
    setDoNotContact: jest.fn(),
    assign: jest.fn(),
    getDuplicates: jest.fn(),
    mergeDuplicate: jest.fn(),
  },
  dashboard: {
    stats: jest.fn(),
    credits: jest.fn(),
  },
  admin: {
    getRuns: jest.fn(),
    sourceHealth: jest.fn(),
  },
}));

jest.mock('@/hooks/useSSE', () => ({
  useSSE: jest.fn(() => ({})),
}));

jest.mock('@/stores/auth', () => ({
  useAuthStore: jest.fn(() => ({
    user: { id: '1', email: 'test@test.com', role: 'admin' },
    isAuthenticated: true,
    logout: jest.fn(),
    token: 'fake-token',
  })),
}));

const mockedApi = require('@/lib/api');

const renderWithProviders = (ui: React.ReactElement) => {
  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>{ui}</BrowserRouter>
    </QueryClientProvider>
  );
};

describe('Duplicates', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    queryClient.clear();
  });

  it('renders empty state when no duplicates', async () => {
    mockedApi.leads.getDuplicates.mockResolvedValue({ duplicates: [] });
    renderWithProviders(<Duplicates />);
    await waitFor(() => expect(screen.getByText('No duplicate candidates found.')).toBeTruthy());
  });

  it('renders duplicate candidates with merge actions', async () => {
    mockedApi.leads.getDuplicates.mockResolvedValue({
      duplicates: [{
        lead_id: 'dup-1',
        lead_score: 85,
        pipeline_stage: 'discovered',
        created_at: '2024-01-01T00:00:00Z',
        company_name: 'Test Corp',
        job_title: 'Developer',
        duplicate_of_id: 'dup-2',
        dup_score: 80,
        dup_stage: 'verified',
        dup_company_name: 'Test Corp Ltd',
        dup_job_title: 'Sr Developer',
        similarity: 0.85,
      }],
    });
    renderWithProviders(<Duplicates />);
    await waitFor(() => expect(screen.getByText('Test Corp')).toBeTruthy());
    expect(screen.getByText('Merge into this')).toBeTruthy();
  });

  it('renders error state with retry', async () => {
    mockedApi.leads.getDuplicates.mockRejectedValue(new Error('Network error'));
    renderWithProviders(<Duplicates />);
    await waitFor(() => {
      expect(screen.queryByText('Failed to load duplicates')).toBeTruthy();
    });
    expect(screen.getByText('Retry')).toBeTruthy();
  });

  it('asks for confirmation before merging, then calls mergeDuplicate', async () => {
    mockedApi.leads.getDuplicates.mockResolvedValue({
      duplicates: [{
        lead_id: 'dup-1',
        lead_score: 85,
        pipeline_stage: 'discovered',
        created_at: '2024-01-01T00:00:00Z',
        company_name: 'Test Corp',
        job_title: 'Developer',
        duplicate_of_id: 'dup-2',
        dup_score: 80,
        dup_stage: 'verified',
        dup_company_name: 'Test Corp Ltd',
        dup_job_title: 'Sr Developer',
        similarity: 0.85,
      }],
    });
    mockedApi.leads.mergeDuplicate.mockResolvedValue({ success: true });
    renderWithProviders(<Duplicates />);
    await waitFor(() => expect(screen.getByText('Merge into this')).toBeTruthy());
    fireEvent.click(screen.getByText('Merge into this'));
    // Destructive action requires confirmation first — no call yet.
    await waitFor(() => expect(screen.getByText('Merge these leads?')).toBeTruthy());
    expect(mockedApi.leads.mergeDuplicate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Merge leads'));
    await waitFor(() => {
      expect(mockedApi.leads.mergeDuplicate).toHaveBeenCalledWith('dup-1', 'dup-2');
    });
  });
});
