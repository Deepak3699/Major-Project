import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from 'react-query';
import { ToastProvider } from '@/components/ui/toast';
import { credits, creditsAdmin } from '@/lib/api';
import type { CreditLedgerEntry, CreditsOverview } from '@/lib/types';
import Credits from './Credits';
import AdminCredits from './AdminCredits';

jest.mock('@/lib/api', () => {
  const actual = jest.requireActual<typeof import('@/lib/api')>('@/lib/api');
  return {
    ...actual,
    credits: {
      ...actual.credits,
      overview: jest.fn(),
      ledger: jest.fn(),
    },
    creditsAdmin: {
      ...actual.creditsAdmin,
      wallets: jest.fn(),
      ledger: jest.fn(),
      adjust: jest.fn(),
    },
  };
});

const OVERVIEW: CreditsOverview = {
  wallet: {
    user_id: 'u1',
    balance: 2,
    lifetime_granted: 2,
    lifetime_used: 0,
    signup_granted: true,
    plan: {
      code: 'FREE',
      name: 'Free',
      price_paise: 0,
      currency: 'INR',
      credits_included: 2,
      features: ['Discover jobs'],
      status: 'active',
    },
  },
  plan: {
    code: 'FREE',
    name: 'Free',
    price_paise: 0,
    currency: 'INR',
    credits_included: 2,
    features: ['Discover jobs'],
    status: 'active',
  },
  plans: [
    { code: 'FREE', name: 'Free', price_paise: 0, currency: 'INR', credits_included: 2, features: ['Discover jobs'] },
    { code: 'CLASSIC', name: 'Classic', price_paise: 19900, currency: 'INR', credits_included: null, features: [] },
    { code: 'CLASSIC_PLUS', name: 'Classic Plus', price_paise: 49900, currency: 'INR', credits_included: null, features: [] },
    { code: 'BRO', name: 'BRO', price_paise: 79900, currency: 'INR', credits_included: null, features: [] },
  ],
  payments: { enabled: false, provider: null, reason: 'No payment provider is configured.' },
  free_initial_credits: 2,
  free_plan_code: 'FREE',
};

const GRANT: CreditLedgerEntry = {
  id: 'l1',
  delta: 2,
  balance_after: 2,
  kind: 'signup_grant',
  reason: 'Welcome grant — 2 initial preparation credits',
  ref_type: null,
  ref_id: null,
  created_at: '2026-01-05T10:00:00.000Z',
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
  (credits.overview as jest.Mock).mockReset().mockResolvedValue(OVERVIEW);
  (credits.ledger as jest.Mock).mockReset().mockResolvedValue({
    data: [GRANT],
    pagination: { limit: 20, offset: 0, total: 1 },
  });
  (creditsAdmin.wallets as jest.Mock).mockReset().mockResolvedValue({
    data: [{
      user_id: 'u1',
      email: 'cand@example.com',
      role: 'user',
      balance: 2,
      lifetime_granted: 2,
      lifetime_used: 0,
      updated_at: '2026-01-05T10:00:00.000Z',
      plan_code: 'FREE',
      plan_status: 'active',
      plan_name: 'Free',
      last_activity_at: '2026-01-05T10:00:00.000Z',
    }],
    pagination: { limit: 25, offset: 0, total: 1 },
  });
  (creditsAdmin.ledger as jest.Mock).mockReset().mockResolvedValue({
    data: [{ ...GRANT, user_id: 'u1', user_email: 'cand@example.com' }],
    pagination: { limit: 25, offset: 0, total: 1 },
  });
  (creditsAdmin.adjust as jest.Mock).mockReset();
});

describe('Credits page', () => {
  it('shows the server balance, plan catalog and honest billing state', async () => {
    renderPage(<Credits />);
    expect(await screen.findByText('Welcome grant')).toBeTruthy();
    expect(screen.getByText('Billing not configured')).toBeTruthy();
    expect(screen.getByText('₹799')).toBeTruthy();
    expect(screen.getByText('2-credit welcome grant applied')).toBeTruthy();
    expect(screen.getByText('No payment provider is configured.')).toBeTruthy();
  });

  it('renders an empty ledger state without crashing', async () => {
    (credits.ledger as jest.Mock).mockResolvedValue({
      data: [],
      pagination: { limit: 20, offset: 0, total: 0 },
    });
    renderPage(<Credits />);
    expect(await screen.findByText('No transactions yet')).toBeTruthy();
  });

  it('renders the error state when the overview fails', async () => {
    (credits.overview as jest.Mock).mockRejectedValue(new Error('Network unavailable'));
    renderPage(<Credits />);
    await waitFor(() => expect(screen.getByText('Credits could not be loaded')).toBeTruthy());
    expect(screen.getByText('Network unavailable')).toBeTruthy();
  });
});

describe('AdminCredits page', () => {
  it('lists wallets and opens the audited adjustment dialog', async () => {
    renderPage(<AdminCredits />);
    expect((await screen.findAllByText('cand@example.com')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Welcome grant').length).toBeGreaterThan(0);

    await userEvent.click(screen.getByRole('button', { name: 'Adjust' }));
    expect(await screen.findByText('Adjust credits')).toBeTruthy();
    expect(screen.getByText(/never go below zero/i)).toBeTruthy();
    expect(screen.getByText(/will not double-apply/i)).toBeTruthy();
  });
});
