import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { CVAnalysisResult } from '@/shared/types/cv';

interface AnalysisState {
  result: CVAnalysisResult | null;
  mode: 'ats' | 'job_match';
  setResult: (result: CVAnalysisResult) => void;
  setMode: (mode: 'ats' | 'job_match') => void;
  reset: () => void;
}

/**
 * Holds the in-progress analysis so moving between dashboard tabs doesn't throw
 * the report away. Session-scoped: a finished analysis is already saved to the
 * database for signed-in users, so this only needs to survive the current visit.
 */
export const useAnalysisStore = create<AnalysisState>()(
  persist(
    (set) => ({
      result: null,
      mode: 'ats',
      setResult: (result) => set({ result }),
      setMode: (mode) => set({ mode }),
      reset: () => set({ result: null }),
    }),
    {
      name: 'align-analysis',
      storage: createJSONStorage(() => sessionStorage),
    }
  )
);
