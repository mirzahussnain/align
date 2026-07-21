'use client';

import Sidebar from './Sidebar';
import ProfileCompletionBanner from './ProfileCompletionBanner';
import OverviewView from './views/OverviewView';
import AnalyzeView from './views/AnalyzeView';
import ProfileView from './views/ProfileView';
import AnalysesView from './views/AnalysesView';
import CvsView from './views/CvsView';
import BillingView from './views/BillingView';
import { useDashboardStore } from '@/shared/stores/dashboard-store';
import type { ProfileData, ProfileSummary } from '@/features/dashboard/data/load-profile';
import type { StorageUsage } from '@/shared/services/storage-quota';
import type { UsageSnapshot } from '@/shared/services/usage-meter';

export interface AnalysisRow {
  id: string;
  createdAt: string;
  mode: string;
  overallScore: number;
  sourceFileName: string | null;
  /** Role and employer extracted from the JD. Null on ATS runs and older rows. */
  jobTitle: string | null;
  jobCompany: string | null;
}

/** `AnalysisRow` plus the occupation column, used only where the hero needs it. */
export interface HeroAnalysisRow extends AnalysisRow {
  occupation: string | null;
}

/**
 * Real engine output for the hero's own analysis — never fabricated, always
 * read from that row's stored result. Null fields mean the engine didn't
 * produce that fact (e.g. legacy rows, a fully "excellent" report with no
 * weakest category, or an ATS row with no mandatory/desirable mapping).
 */
export interface HeroInsight {
  occupationLabel: string | null;
  /** ATS-mode facts (also present on job-match rows, since the rule engine always scores the 8 base categories). */
  weakestCategoryLabel: string | null;
  strongestCategoryLabel: string | null;
  credentialsStatus: 'ready' | 'attention' | null;
  /** Job-match-mode facts, from the structured mandatory/desirable requirement mapping — never a raw keyword-miss count. */
  essentialMatched: number | null;
  essentialTotal: number | null;
  primaryGap: string | null;
  domainStatus: 'aligned' | 'partial' | 'mismatch' | null;
}

/**
 * ATS and job-match scores answer different questions and must never be
 * averaged together — this carries them as separate figures for the overview.
 */
export interface ReadinessSplit {
  atsCount: number;
  jobMatchCount: number;
  avgAtsScore: number | null;
  avgJobMatchScore: number | null;
  latestAtsScore: number | null;
  bestJobMatchScore: number | null;
}

export interface CvRow {
  id: string;
  createdAt: string;
  template: string;
  analysisId: string | null;
  /**
   * Headline for the card, taken from the rewritten CV's own tagline (falling
   * back to the holder's name). Reading the template name — "Architect
   * Template" — told the user what renderer ran, not what the document was for.
   */
  title: string | null;
  /** Source CV filename and role, for the provenance pills. */
  sourceFileName: string | null;
  jobTitle: string | null;
  jobCompany: string | null;
  /** Match score of the analysis it was built from. */
  matchScore: number | null;
  /** Career track it was filed under. */
  profileLabel: string | null;
}

export interface DashboardData {
  analyses: AnalysisRow[];
  totalAnalyses: number;
  cvs: CvRow[];
  /** Content of the currently selected career track. */
  profile: ProfileData;
  /** Every career track the user holds, for the switcher. */
  profiles: ProfileSummary[];
  /** Tier cap, so the switcher can disable "New profile" at the limit. */
  maxProfiles: number;
  /** Whether the plan includes profile-vs-CV reasoning during a rewrite. */
  profileReasoning: boolean;
  /** Reasoning runs left this month; null when the plan is unmetered. */
  reasoningRemaining: number | null;
  /** Live quota usage for the billing screen's meters. */
  storage: StorageUsage;
  /** This month's AI consumption, for the billing screen's meters. */
  usage: UsageSnapshot;
  /** Whether the profile is 100% complete — gates "Generate CV from profile". */
  profileComplete: boolean;
  /** Profile completeness as a 0–100 percentage, for the incomplete-profile banner. */
  profileCompleteness: number;
  /** This tier's monthly AI-analysis cap; null when unmetered. Pairs with usage.aiAnalyses. */
  aiAnalysesLimit: number | null;
  /** Latest job-match analysis, or latest ATS analysis if no job match exists. Drives the hero card. */
  heroAnalysis: HeroAnalysisRow | null;
  /** Most recent analysis of the SAME mode as `heroAnalysis`, for an honest delta — never cross-mode. */
  heroPrevious: HeroAnalysisRow | null;
  /** Real engine output for `heroAnalysis`, read from its stored result. */
  heroInsight: HeroInsight | null;
  readinessSplit: ReadinessSplit;
}

interface DashboardShellProps {
  user: { name: string; email: string; image?: string | null };
  tier: string;
  data: DashboardData;
}

export default function DashboardShell({ user, tier, data }: DashboardShellProps) {
  const tab = useDashboardStore((s) => s.tab);

  return (
    <div className="flex min-h-screen bg-neutral-50 text-neutral-900">
      <Sidebar
        user={user}
        tier={tier}
        profiles={data.profiles}
        activeProfileId={data.profile.profileId}
        maxProfiles={data.maxProfiles}
      />
      <div className="min-w-0 flex-1">
        <ProfileCompletionBanner
          percent={data.profileCompleteness}
          label={data.profile.label}
          onProfileTab={tab === 'profile'}
        />
        {tab === 'overview' && <OverviewView user={user} data={data} />}
        {tab === 'analyze' && <AnalyzeView activeProfileId={data.profile.profileId} />}
        {tab === 'profile' && (
          <ProfileView
            key={data.profile.profileId}
            initial={data.profile}
            name={user.name}
            email={user.email}
            image={user.image}
          />
        )}
        {tab === 'analyses' && <AnalysesView analyses={data.analyses} />}
        {tab === 'cvs' && (
          <CvsView
            cvs={data.cvs}
            analyses={data.analyses}
            profileComplete={data.profileComplete}
            profileReasoning={data.profileReasoning}
            activeProfileId={data.profile.profileId}
            activeProfileLabel={data.profile.label}
            reasoningRemaining={data.reasoningRemaining}
          />
        )}
        {tab === 'billing' && <BillingView tier={tier} storage={data.storage} />}
      </div>
    </div>
  );
}
