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
  avgScore: number | null;
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
