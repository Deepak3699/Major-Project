import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from 'react-query';
import Leads from './Leads';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

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
  admin: {
    getRuns: jest.fn(),
    getUsers: jest.fn(),
    sourceHealth: jest.fn(),
    armyStatus: jest.fn(),
  },
  dashboard: {
    stats: jest.fn(),
    credits: jest.fn(),
  },
}));

const mockedApi = require('@/lib/api');

const renderWithProviders = (ui: React.ReactElement) => {
  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>{ui}</BrowserRouter>
    </QueryClientProvider>
  );
};

describe('Leads', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    queryClient.clear();
  });

  it('renders loading state', () => {
    mockedApi.leads.list.mockReturnValue(
      new Promise(() => {})
    );
    renderWithProviders(<Leads />);
    expect(screen.getByText('Loading leads...')).toBeTruthy();
  });

  it('renders empty state when no leads', async () => {
    mockedApi.leads.list.mockResolvedValue({
      data: [],
      pagination: { page: 1, limit: 50, total: 0, pages: 0 },
    });
    renderWithProviders(<Leads />);
    await waitFor(() => expect(screen.getByText('No leads found.')).toBeTruthy());
  });

  it('renders leads table with data', async () => {
    mockedApi.leads.list.mockResolvedValue({
      data: [{
        id: '1',
        lead_score: 85,
        score_band: 'hot',
        pipeline_stage: 'verified',
        company_name: 'Test Corp',
        job_title: 'Junior Developer',
        hr_name: 'Jane Doe',
        hr_email: 'jane@test.com',
        hr_linkedin_url: 'https://linkedin.com/in/janedoe',
        email_status: 'valid',
        whatsapp_status: 'registered',
        source_site: 'naukri',
        created_at: '2024-01-01T00:00:00Z',
      }],
      pagination: { page: 1, limit: 50, total: 1, pages: 1 },
    });
    renderWithProviders(<Leads />);
    await waitFor(() => expect(screen.getByText('Test Corp')).toBeTruthy());
  });
});
