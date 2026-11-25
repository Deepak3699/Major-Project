import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from 'react-query';
import { ToastProvider } from '@/components/ui/toast';
import { candidate, practice } from '@/lib/api';
import type {
  LearningTrackView,
  PracticePresentationFeedback,
  PracticeQuestion,
  PracticeSessionReport,
  PracticeSessionSummary,
  PracticeSubscription,
} from '@/lib/types';
import Practice from './Practice';
import PracticeSession from './PracticeSession';
import Learning from './Learning';
import { FALLBACK_AVATARS } from '@/components/interview/roster';

jest.mock('@/lib/api', () => {
  const actual = jest.requireActual<typeof import('@/lib/api')>('@/lib/api');
  return {
    ...actual,
    practice: {
      ...actual.practice,
      subscription: jest.fn(),
      sessions: jest.fn(),
      session: jest.fn(),
      learning: jest.fn(),
      avatars: jest.fn(),
    },
    candidate: {
      ...actual.candidate,
      profile: jest.fn(),
      jobs: jest.fn(),
      applications: jest.fn(),
    },
  };
});

const MOCK_SUBSCRIPTION: PracticeSubscription = {
  plan: 'free',
  status: 'active',
  source: 'default',
  used_this_month: 1,
  monthly_limit: 3,
  unlimited: false,
  requested_upgrade: false,
};

const MOCK_SESSION_COMPLETED: PracticeSessionSummary = {
  id: 's1',
  role_focus: 'Frontend Engineer',
  difficulty: 'standard',
  question_count: 5,
  status: 'completed',
  model: 'gemini',
  overall_score: 7.4,
  verdict: 'solid',
  summary: 'Good structure, weak specifics.',
  started_at: '2026-01-05T10:00:00.000Z',
  completed_at: '2026-01-05T10:25:00.000Z',
  answered_count: 5,
};

const MOCK_SESSION_IN_PROGRESS: PracticeSessionSummary = {
  id: 's2',
  role_focus: 'Frontend Engineer',
  difficulty: 'standard',
  question_count: 4,
  status: 'in_progress',
  model: 'template',
  overall_score: null,
  verdict: '',
  summary: '',
  started_at: '2026-01-06T10:00:00.000Z',
  completed_at: null,
  answered_count: 1,
};

const MOCK_REPORT: PracticeSessionReport = {
  dimensions: [
    { key: 'clarity', label: 'Clarity', score: 82, note: 'Answers were easy to follow.' },
    { key: 'depth', label: 'Depth', score: 68, note: 'Add one more layer of detail.' },
    { key: 'structure', label: 'Structure', score: 74, note: 'Situation and action landed.' },
    { key: 'confidence', label: 'Confidence', score: 71, note: 'Some hedging around numbers.' },
    { key: 'communication', label: 'Communication', score: 76, note: 'Pacing worked on camera.' },
  ],
  strengths: ['Used a concrete sprint example'],
  mistakes: [
    {
      question: 'Tell me about a disagreement.',
      answer_excerpt: 'Once, in a sprint review…',
      score: 7,
      mistake: 'The answer never said how the disagreement ended.',
      fix: 'Close every behavioural answer with the outcome.',
      model_answer: 'Situation, your action, the resolution and the measurable result.',
    },
  ],
  next_steps: ['Rewrite the weakest answer out loud.', 'Drill depth with one number per answer.', 'Run another round with the camera on.'],
  model: 'template',
};

const MOCK_PRESENTATION: PracticePresentationFeedback = {
  available: true,
  score: 78,
  summary: 'Camera presence was steady and well lit.',
  dress: 'A solid shirt read well on camera.',
  grooming: 'Hair stayed clear of the eyes.',
  expression: 'Composed, with a small smile at the close.',
  posture: 'Shoulders stayed still.',
  eye_contact: 'You held the frame well.',
  lighting: 'Lighting was even.',
  tips: ['Keep the light in front of you.', 'Look into the lens on the opening line.', 'Keep hands below the collarbone.'],
  model: 'template',
};

const MOCK_QUESTIONS: PracticeQuestion[] = [
  {
    id: 'q1',
    idx: 0,
    category: 'intro',
    topic: 'About you',
    question: 'Walk me through your background.',
    answer: '',
    feedback: null,
    score: null,
    answered_at: null,
  },
  {
    id: 'q2',
    idx: 1,
    category: 'behavioral',
    topic: 'Conflict',
    question: 'Tell me about a disagreement.',
    answer: 'Once, in a sprint review…',
    answer_language: 'english',
    feedback: { score: 7, strengths: ['Gave context'], improvements: ['Add outcome'] },
    score: 7,
    answered_at: '2026-01-06T10:05:00.000Z',
  },
];

const MOCK_TRACK: LearningTrackView = {
  id: 't1',
  role_focus: 'core',
  model: 'template',
  created_at: '2026-01-05T09:00:00.000Z',
  updated_at: '2026-01-05T09:00:00.000Z',
  modules: [
    {
      title: 'Harden your fundamentals',
      why: 'You will be asked about data structures early.',
      level: 'beginner',
      topics: [
        {
          title: 'Arrays and hashing',
          what_to_learn: 'Two-pointer and prefix sums.',
          resources: [{ type: 'article', name: 'MDN guide', url: 'https://example.com' }],
        },
      ],
      practice_exercise: 'Solve three easy array problems.',
      index: 0,
      done: false,
    },
    {
      title: 'System design basics',
      why: 'Senior loops expect trade-off talk.',
      level: 'advanced',
      topics: [],
      practice_exercise: '',
      index: 1,
      done: true,
    },
  ],
  progress: { done: 1, total: 2 },
};

const renderTrio = (ui: React.ReactElement, initialPath?: string) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const app = (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <MemoryRouter initialEntries={[initialPath ?? '/practice']}>
          {initialPath ? (
            <Routes>
              <Route path="/practice/session/:id" element={ui} />
              <Route path="*" element={ui} />
            </Routes>
          ) : (
            ui
          )}
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
  return render(app);
};

beforeEach(() => {
  (practice.subscription as jest.Mock).mockClear().mockResolvedValue({ subscription: MOCK_SUBSCRIPTION });
  (practice.sessions as jest.Mock).mockClear().mockResolvedValue({ sessions: [] });
  (practice.session as jest.Mock).mockClear().mockResolvedValue({ session: MOCK_SESSION_IN_PROGRESS, questions: [] });
  (practice.learning as jest.Mock).mockClear().mockResolvedValue({ track: null, role_focus: 'core' });
  (practice.avatars as jest.Mock).mockClear().mockResolvedValue({
    avatars: FALLBACK_AVATARS,
    recommended: {
      avatar_id: 'rohan',
      name: 'Rohan Kapoor',
      reason: 'Rohan Kapoor is the closest fit for Frontend Engineer — matched on react.',
      score: 12,
    },
    job: null,
    role_focus: 'Frontend Engineer',
  });
  (candidate.jobs as jest.Mock).mockClear().mockResolvedValue({ data: [], pagination: { page: 1, limit: 50, total: 0, pages: 0 } });
  (candidate.applications as jest.Mock).mockClear().mockResolvedValue({ data: [] });
  (candidate.profile as jest.Mock).mockClear().mockResolvedValue({
    profile: { id: 'p1', preferred_roles: ['Frontend Engineer'] },
    completion: 40,
  });
});

describe('Practice page smoke', () => {
  it('renders empty state for a brand-new user', async () => {
    renderTrio(<Practice />);
    await waitFor(() => expect(practice.sessions).toHaveBeenCalled());
    expect(await screen.findByRole('button', { name: /^start with /i })).toBeTruthy();
  });

  it('renders session history rows', async () => {
    (practice.sessions as jest.Mock).mockResolvedValue({
      sessions: [MOCK_SESSION_COMPLETED, MOCK_SESSION_IN_PROGRESS],
    });
    renderTrio(<Practice />);
    expect(await screen.findByText('Scored')).toBeTruthy();
  });

  it('renders with exhausted free quota', async () => {
    (practice.subscription as jest.Mock).mockResolvedValue({
      subscription: { ...MOCK_SUBSCRIPTION, used_this_month: 3 },
    });
    renderTrio(<Practice />);
    await waitFor(() => expect(practice.subscription).toHaveBeenCalled());
    await screen.findByText('Scored').catch(() => undefined);
  });

  it('renders the interviewer roster and the job-aware recommendation', async () => {
    renderTrio(<Practice />);
    expect(await screen.findByText('Rohan Kapoor')).toBeTruthy();
    expect(await screen.findByText(/closest fit for Frontend Engineer/i)).toBeTruthy();
    expect(screen.getByText('Vikram Rao')).toBeTruthy();
    expect(screen.getByText('Neha Iyer')).toBeTruthy();
  });

  it('renders pro plan with unlimited flag', async () => {
    (practice.subscription as jest.Mock).mockResolvedValue({
      subscription: { ...MOCK_SUBSCRIPTION, plan: 'pro', unlimited: true, monthly_limit: null },
    });
    renderTrio(<Practice />);
    await waitFor(() => expect(practice.subscription).toHaveBeenCalled());
  });

  it('swipes the deck and updates the start action', async () => {
    renderTrio(<Practice />);
    expect(await screen.findByRole('button', { name: /^start with rohan/i })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /next interviewer/i }));
    expect(await screen.findByRole('button', { name: /^start with aria/i })).toBeTruthy();
  });
});

describe('PracticeSession page smoke', () => {
  it('renders an in-progress session with questions and the camera prompt', async () => {
    (practice.session as jest.Mock).mockResolvedValue({ session: MOCK_SESSION_IN_PROGRESS, questions: MOCK_QUESTIONS });
    renderTrio(<PracticeSession />, '/practice/session/s2');
    expect(await screen.findByText(/walk me through your background/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /enable camera/i })).toBeTruthy();
  });

  it('renders the end-of-round report, mistakes and camera review', async () => {
    (practice.session as jest.Mock).mockResolvedValue({
      session: { ...MOCK_SESSION_COMPLETED, report: MOCK_REPORT, presentation: MOCK_PRESENTATION },
      questions: MOCK_QUESTIONS,
    });
    renderTrio(<PracticeSession />, '/practice/session/s1');
    expect(await screen.findByText('Five dimensions of the round')).toBeTruthy();
    expect(screen.getByText('What cost you marks')).toBeTruthy();
    expect(screen.getByText('The answer never said how the disagreement ended.')).toBeTruthy();
    expect(screen.getByText('Camera review')).toBeTruthy();
    expect(screen.getByText('A solid shirt read well on camera.')).toBeTruthy();
    expect(screen.getByText('Your next three moves')).toBeTruthy();
  });

  it('renders a completed session summary', async () => {
    (practice.session as jest.Mock).mockResolvedValue({ session: MOCK_SESSION_COMPLETED, questions: MOCK_QUESTIONS });
    renderTrio(<PracticeSession />, '/practice/session/s1');
    expect(await screen.findByText(/good structure/i)).toBeTruthy();
  });

  it('renders empty questions list without crashing', async () => {
    (practice.session as jest.Mock).mockResolvedValue({
      session: { ...MOCK_SESSION_IN_PROGRESS, answered_count: 0 },
      questions: [],
    });
    renderTrio(<PracticeSession />, '/practice/session/s2');
    await waitFor(() => expect(practice.session).toHaveBeenCalled());
  });

  it('renders every question answered (finalize state)', async () => {
    const answered = MOCK_QUESTIONS.map((q) => ({
      ...q,
      answer: 'My answer.',
      feedback: { score: 7, strengths: ['x'], improvements: ['y'] },
      score: 7,
      answered_at: '2026-01-06T10:05:00.000Z',
    }));
    (practice.session as jest.Mock).mockResolvedValue({
      session: { ...MOCK_SESSION_IN_PROGRESS, question_count: 2, answered_count: 2 },
      questions: answered,
    });
    renderTrio(<PracticeSession />, '/practice/session/s2');
    await waitFor(() => expect(practice.session).toHaveBeenCalled());
  });
});

describe('Learning page smoke', () => {
  it('renders generate empty state when no track exists', async () => {
    renderTrio(<Learning />);
    await waitFor(() => expect(practice.learning).toHaveBeenCalled());
    await screen.findByRole('button', { name: /build the plan/i });
  });

  it('renders modules when a track exists', async () => {
    (practice.learning as jest.Mock).mockResolvedValue({ track: MOCK_TRACK, role_focus: 'core' });
    renderTrio(<Learning />);
    expect(await screen.findByText('Harden your fundamentals')).toBeTruthy();
    expect(screen.getByText('System design basics')).toBeTruthy();
    expect(screen.getByText('Module 1')).toBeTruthy();
  });

  it('renders track with zero modules without crashing', async () => {
    (practice.learning as jest.Mock).mockResolvedValue({
      track: { ...MOCK_TRACK, modules: [], progress: { done: 0, total: 0 } },
      role_focus: 'core',
    });
    renderTrio(<Learning />);
    await waitFor(() => expect(practice.learning).toHaveBeenCalled());
  });
});
