import { create } from 'zustand';

export type DashboardTab = 'overview' | 'analyze' | 'profile' | 'analyses' | 'cvs' | 'billing';

interface DashboardState {
  tab: DashboardTab;
  setTab: (tab: DashboardTab) => void;
  /** The saved analysis whose full report is open, or null for the list view. */
  selectedAnalysisId: string | null;
  /** Open a stored analysis's full report (jumps to the Analyses tab). */
  openAnalysis: (id: string) => void;
  /** Return from a report back to the analyses list. */
  closeAnalysis: () => void;
  /**
   * Sidebar collapsed to icons only. On mobile the rail is always icon-only, so
   * this drives the desktop toggle; on mobile it drives the slide-over instead.
   */
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  /** Mobile slide-over visibility, kept separate so the two never fight. */
  mobileNavOpen: boolean;
  setMobileNavOpen: (open: boolean) => void;
}

/**
 * Which dashboard section is showing. Tabs switch this client-side instead of
 * navigating to a separate route, so an in-progress analysis (held in the
 * analysis store) is never torn down by a page load.
 */
export const useDashboardStore = create<DashboardState>((set) => ({
  tab: 'overview',
  // Switching tabs also dismisses the mobile slide-over — otherwise the panel
  // stays over the view the user just navigated to.
  setTab: (tab) => set({ tab, selectedAnalysisId: null, mobileNavOpen: false }),
  selectedAnalysisId: null,
  openAnalysis: (id) => set({ tab: 'analyses', selectedAnalysisId: id, mobileNavOpen: false }),
  closeAnalysis: () => set({ selectedAnalysisId: null }),
  sidebarCollapsed: false,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  mobileNavOpen: false,
  setMobileNavOpen: (open) => set({ mobileNavOpen: open }),
}));
