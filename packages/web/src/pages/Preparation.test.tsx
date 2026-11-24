import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from 'react-query';
import { ToastProvider } from '@/components/ui/toast';
import { candidate, preparation } from '@/lib/api';
import type { CandidateJob, PreparationArtifact } from '@/lib/types';
import Preparation from './Preparation';

jest.mock('@/lib/api', () => {
  const actual = jest.requireActual<typeof import('@/lib/api')>('@/lib/api');
  return {
    ...actual,
    candidate: {
      ...actual.candidate,
      jobs: jest.fn(),
    },
    preparation: {
      ...actual.preparation,
      artifacts: jest.fn(),
      artifact: jest.fn(),
      generate: jest.fn(),
    },
  };
});

const JOB_ID = '11111111-1111-4111-8111-111111111111';
const ARTIFACT_ID = '22222222-2222-4222-8222-222222222222';

const JOB: CandidateJob = {
  id: JOB_ID,
  title: 'Frontend Engineer',
  description: 'Build accessible React interfaces with a focus on design systems.',
  job_url: 'https://jobs.example.invalid/frontend',
  source_site: 'example',
  skills: ['React', 'Accessibility'],
  company_name: 'Acme',
  trust_score: 92,
  trust_band: 'very_high',
};

const ARTIFACT: PreparationArtifact = {
  id: ARTIFACT_ID,
  user_id: 'u1',
  job_id: JOB_ID,
  module: 'interview_prep',
  status: 'ready',
  payload: {
    role: 'Frontend Engineer',
    answer_framework: ['Situation', 'Contribution', 'Result'],
    questions: [{ category: 'intro', question: 'Introduce yourself', framework: 'Background' }],
    evidence_notes: ['No verified recent-development source is available.'],
    disclaimer: 'Preparation aid only.',
  },
  sources: [{
    title: 'Job posting (example)',
    url: 'https://jobs.example.invalid/frontend',
    retrieved_at: '2026-02-01T10:00:00.000Z',
    status: 'ingested',
  }],
  model: 'template',
  credits_charged: 0,
  error: '',
  created_at: '2026-02-02T10:00:00.000Z',
  updated_at: '2026-02-02T10:00:00.000Z',
};

const renderPage = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <MemoryRouter initialEntries={[`/preparation?job=${JOB_ID}`]}>
          <Preparation />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  (candidate.jobs as jest.Mock).mockReset().mockResolvedValue({
    data: [JOB],
    pagination: { page: 1, limit: 100, total: 1, pages: 1 },
  });
  (preparation.artifacts as jest.Mock).mockReset().mockResolvedValue({
    data: [ARTIFACT],
    pagination: { limit: 50, offset: 0, total: 1 },
  });
  (preparation.artifact as jest.Mock).mockReset().mockResolvedValue({ artifact: ARTIFACT });
  (preparation.generate as jest.Mock).mockReset().mockResolvedValue({ artifact: ARTIFACT, already_processed: false });
});

describe('Preparation page', () => {
  it('renders job-specific artifact sections and cited sources', async () => {
    renderPage();
    expect(await screen.findByText('Answer framework')).toBeTruthy();
    expect(screen.getByText('Introduce yourself')).toBeTruthy();
    expect(screen.getByText('Job posting (example)')).toBeTruthy();
    expect(screen.getByText(/No verified recent-development source/)).toBeTruthy();
    expect(screen.getByText(/Preparation aid only/)).toBeTruthy();
  });

  it('shows an empty state when no artifacts exist', async () => {
    (preparation.artifacts as jest.Mock).mockResolvedValue({
      data: [],
      pagination: { limit: 50, offset: 0, total: 0 },
    });
    renderPage();
    expect(await screen.findByText('No preparation yet')).toBeTruthy();
  });

  it('renders the error state with retry', async () => {
    (preparation.artifacts as jest.Mock).mockRejectedValue(new Error('Network unavailable'));
    renderPage();
    await waitFor(() => expect(screen.getByText('Network unavailable')).toBeTruthy());
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
  });

  it('generates preparation for the selected job and module', async () => {
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: /Group discussion/i }));
    await userEvent.click(screen.getByRole('button', { name: /Generate/i }));
    await waitFor(() => expect(preparation.generate).toHaveBeenCalledWith(
      JOB_ID,
      'group_discussion',
      expect.stringContaining(`prep:${JOB_ID}:group_discussion:`),
    ));
  });
});
