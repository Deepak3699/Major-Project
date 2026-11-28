import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { RecommendedCarousel } from './RecommendedCarousel';
import type { CandidateJob } from '@/lib/types';

const jobs: CandidateJob[] = Array.from({ length: 5 }, (_, index) => ({
  id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
  title: `Role ${index + 1}`,
  company_name: 'Acme',
  location: 'Remote - India',
  trust_score: 80,
  match_score: 80 + index,
  matched_skills: ['python'],
  missing_skills: [],
  match_reasons: [],
  score_breakdown: {},
})) as CandidateJob[];

function renderCarousel() {
  return render(
    <MemoryRouter>
      <RecommendedCarousel jobs={jobs} />
    </MemoryRouter>,
  );
}

describe('RecommendedCarousel', () => {
  it('presents the full rail with five position controls', () => {
    renderCarousel();
    expect(screen.getByRole('region', { name: 'Recommended jobs' })).toBeTruthy();
    expect(screen.getAllByRole('tab')).toHaveLength(5);
    // jsdom reports a zero-width viewport, so only the active slide is exposed
    // to the accessibility tree; real browsers expose five cards on desktop.
    expect(screen.getAllByRole('link').length).toBeGreaterThanOrEqual(1);
  });

  it('lets the reader pause and resume rotation', () => {
    renderCarousel();
    fireEvent.click(screen.getByRole('button', { name: 'Pause automatic rotation' }));
    expect(screen.getByRole('button', { name: 'Resume automatic rotation' })).toBeTruthy();
  });

  it('shows an honest empty state until a profile exists', () => {
    render(
      <MemoryRouter>
        <RecommendedCarousel jobs={[]} needsProfile />
      </MemoryRouter>,
    );
    expect(screen.getByText(/Unlock recommendations tailored to you/i)).toBeTruthy();
  });
});
