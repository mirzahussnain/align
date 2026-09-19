'use client';

import { useEffect } from 'react';
import DashboardRouteShell from './DashboardRouteShell';
import ProfileCompletionBanner from './ProfileCompletionBanner';
import OverviewView from './views/OverviewView';
import AnalyzeView from './views/AnalyzeView';
import JobMatchView from './views/JobMatchView';
import ProfileView from './views/ProfileView';
import DomainHistoryView from './views/DomainHistoryView';
import CvsView from './views/CvsView';
import { useDashboardStore, type DashboardTab } from '@/shared/stores/dashboard-store';
import type { ProfileData, ProfileSummary } from '@/features/dashboard/data/load-profile';
import type { UsageSnapshot } from '@/shared/services/usage-meter';
import type { EntitlementSnapshot } from '@/shared/entitlements/server';

export interface AtsAnalysisRow {
  id: string;
  createdAt: string;
  overallScore: number;
  sourceFileName: string;
  occupation: string | null;
  aiEnhanced: boolean;
}

export interface JobMatchRow {
  id: string;
  createdAt: string;
  matchScore: number;
  sourceFileName: string;
  jobTitle: string;
  jobCompany: string;
  profileLabel: string;
}

export interface AnalysisRow {
  id: string;
  createdAt: string;
  mode: 'job_match';
  overallScore: number;
  sourceFileName: string;
  jobTitle: string;
  jobCompany: string;
}

export interface CvRow {
  id: string;
  createdAt: string;
  template: string;
  title: string | null;
  jobMatchId: string | null;
  versionNumber: number;
  sourceFileName: string | null;
  jobTitle: string | null;
  jobCompany: string | null;
  matchScore: number | null;
  profileLabel: string | null;
}

export interface DashboardData {
  atsAnalyses: AtsAnalysisRow[];
  jobMatches: JobMatchRow[];
  cvs: CvRow[];
  profile: ProfileData;
  profiles: ProfileSummary[];
  maxProfiles: number;
  profileReasoning: boolean;
  reasoningRemaining: number | null;
  profileComplete: boolean;
  usage: UsageSnapshot;
  profileCompleteness: number;
  aiAnalysesLimit: number | null;
}

export default function DashboardShell({
  user,
  tier,
  entitlementSnapshot,
  data,
  initialTab,
  initialAnalysisId,
}: {
  user: { name: string; email: string; image?: string | null };
  tier: string;
  entitlementSnapshot: EntitlementSnapshot;
  data: DashboardData;
  initialTab?: DashboardTab;
  initialAnalysisId?: string;
}) {
  const tab = useDashboardStore((state) => state.tab);
  const setTab = useDashboardStore((state) => state.setTab);
  const openAtsAnalysis = useDashboardStore((state) => state.openAtsAnalysis);
  const openJobMatch = useDashboardStore((state) => state.openJobMatch);

  useEffect(() => {
    if (initialAnalysisId && initialTab === 'ats') openAtsAnalysis(initialAnalysisId);
    else if (initialAnalysisId && initialTab === 'job_matches') openJobMatch(initialAnalysisId);
    else if (initialTab) setTab(initialTab);
  }, [initialAnalysisId, initialTab, openAtsAnalysis, openJobMatch, setTab]);

  const rewriteSources: AnalysisRow[] = data.jobMatches.map((row) => ({
    id: row.id,
    createdAt: row.createdAt,
    mode: 'job_match',
    overallScore: row.matchScore,
    sourceFileName: row.sourceFileName,
    jobTitle: row.jobTitle,
    jobCompany: row.jobCompany,
  }));

  return (
    <DashboardRouteShell
      user={user}
      tier={tier}
      entitlementSnapshot={entitlementSnapshot}
      profiles={data.profiles}
      activeProfileId={data.profile.profileId}
      maxProfiles={data.maxProfiles}
    >
      <div className="min-w-0 flex-1">
        <ProfileCompletionBanner percent={data.profileCompleteness} label={data.profile.label} onProfileTab={tab === 'profile'} />
        {tab === 'overview' && <OverviewView user={user} data={data} />}
        {tab === 'analyze' && <AnalyzeView activeProfileId={data.profile.profileId} />}
        {tab === 'job_match' && <JobMatchView />}
        {tab === 'profile' && <ProfileView key={data.profile.profileId} initial={data.profile} name={user.name} email={user.email} image={user.image} />}
        {tab === 'ats' && <DomainHistoryView domain="ats" atsAnalyses={data.atsAnalyses} jobMatches={[]} />}
        {tab === 'job_matches' && <DomainHistoryView domain="job_match" atsAnalyses={[]} jobMatches={data.jobMatches} />}
        {tab === 'cvs' && (
          <CvsView
            cvs={data.cvs}
            analyses={rewriteSources}
            profileComplete={data.profileComplete}
            profileReasoning={data.profileReasoning}
            activeProfileId={data.profile.profileId}
            activeProfileLabel={data.profile.label}
            reasoningRemaining={data.reasoningRemaining}
          />
        )}
      </div>
    </DashboardRouteShell>
  );
}
