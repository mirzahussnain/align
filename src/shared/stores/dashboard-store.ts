import { create } from 'zustand';

export type DashboardTab = 'overview' | 'analyze' | 'job_match' | 'profile' | 'ats' | 'job_matches' | 'cvs';
export type AnalysisDomain = 'ats' | 'job_match';

interface DashboardState {
  tab: DashboardTab;
  setTab: (tab: DashboardTab) => void;
  selectedAnalysisId: string | null;
  selectedAnalysisDomain: AnalysisDomain | null;
  openAtsAnalysis: (id: string) => void;
  openJobMatch: (id: string) => void;
  openAnalysis: (id: string) => void;
  closeAnalysis: () => void;
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  mobileNavOpen: boolean;
  setMobileNavOpen: (open: boolean) => void;
}

export const useDashboardStore = create<DashboardState>((set) => ({
  tab: 'overview',
  setTab: (tab) => set({ tab, selectedAnalysisId: null, selectedAnalysisDomain: null, mobileNavOpen: false }),
  selectedAnalysisId: null,
  selectedAnalysisDomain: null,
  openAtsAnalysis: (id) => set({ tab: 'ats', selectedAnalysisId: id, selectedAnalysisDomain: 'ats', mobileNavOpen: false }),
  openJobMatch: (id) => set({ tab: 'job_matches', selectedAnalysisId: id, selectedAnalysisDomain: 'job_match', mobileNavOpen: false }),
  // Compatibility for existing job-board deep links; analyses opened there are Job Matches.
  openAnalysis: (id) => set({ tab: 'job_matches', selectedAnalysisId: id, selectedAnalysisDomain: 'job_match', mobileNavOpen: false }),
  closeAnalysis: () => set({ selectedAnalysisId: null, selectedAnalysisDomain: null }),
  sidebarCollapsed: false,
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  mobileNavOpen: false,
  setMobileNavOpen: (open) => set({ mobileNavOpen: open }),
}));
