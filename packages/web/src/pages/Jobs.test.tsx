import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from 'react-query';
import { candidate } from '@/lib/api';
import type { CandidateJob } from '@/lib/types';
import Jobs from './Jobs';

jest.mock('@/lib/api', () => {
  const actual = jest.requireActual<typeof import('@/lib/api')>('@/lib/api');
  return {
    ...actual,
    candidate: {
      ...actual.candidate,
      jobs: jest.fn(),
      saveJob: jest.fn(),
    },
  };
});

const makeJob = (id: string): CandidateJob => ({
  id,
  title: `Role ${id}`,
  company_name: 'Acme',
  job_url: `https://example.com/jobs/${id}`,
  source_site: 'example',
  skills: ['React'],
  trust_score: 80,
  trust_band: 'high',
});

const renderPage = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <Jobs />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  (candidate.jobs as jest.Mock).mockReset().mockImplementation(async (filters: Record<string, unknown>) => ({
    data: [makeJob(`page-${Number(filters.page) || 1}`)],
    pagination: { page: Number(filters.page) || 1, limit: 20, total: 40, pages: 2 },
  }));
  (candidate.saveJob as jest.Mock).mockReset().mockResolvedValue({});
});

describe('Jobs pagination', () => {
  it('Next advances the page and Previous goes back', async () => {
    renderPage();
    await screen.findByText('Role page-1');

    await userEvent.click(screen.getByRole('button', { name: 'Next' }));

    await waitFor(() => expect(candidate.jobs).toHaveBeenCalledWith(expect.objectContaining({ page: 2 })));
    expect(await screen.findByText('Role page-2')).toBeTruthy();
    await waitFor(() => expect(document.body.textContent).toContain('Page 2 of 2'));

    await userEvent.click(screen.getByRole('button', { name: 'Previous' }));

    await waitFor(() => expect(candidate.jobs).toHaveBeenCalledWith(expect.objectContaining({ page: 1 })));
    expect(await screen.findByText('Role page-1')).toBeTruthy();
    await waitFor(() => expect(document.body.textContent).toContain('Page 1 of 2'));
  });

  it('resets to page 1 when a search term changes', async () => {
    renderPage();
    await screen.findByText('Role page-1');
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByText('Role page-2');

    await userEvent.type(screen.getByPlaceholderText('Role, company, or skill'), 'react');
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));

    await waitFor(() => expect(candidate.jobs).toHaveBeenCalledWith(expect.objectContaining({ page: 1, q: 'react' })));
  });
});
