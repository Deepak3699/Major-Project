import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface PracticeFocus {
  jobId?: string;
  role: string;
  company?: string;
  source?: 'job' | 'recommendation' | 'manual';
  matchScore?: number | null;
}

interface PracticeFocusState {
  focus: PracticeFocus | null;
  setFocus: (focus: PracticeFocus) => void;
  clearFocus: () => void;
}

/**
 * The job/role the whole practice workspace is rehearsing for. Persisted so a
 * learner picks it once on the workspace home (or from a job detail card) and
 * every room continues with the same role focus.
 */
export const usePracticeFocus = create<PracticeFocusState>()(
  persist(
    (set) => ({
      focus: null,
      setFocus: (focus) => set({ focus }),
      clearFocus: () => set({ focus: null }),
    }),
    {
      name: 'hiregen:practice-focus',
      partialize: (state) => ({ focus: state.focus }),
    },
  ),
);

export function usePracticeRole(fallback = ''): string {
  return usePracticeFocus((state) => state.focus?.role || fallback);
}
