// Server-only canonical Job Match loader for regeneration and evidence flows.
import { prisma } from '@/shared/lib/prisma';
import { parseStoredAnalysisResult } from '@/shared/schemas/analysis-result';
import { parseStoredJobMatchData } from '@/shared/schemas/ai-output';
import type { CVAnalysisResult } from '@/shared/types/cv';
import type { JobMatchDataV2 } from '@/shared/types/ai';

if (typeof window !== 'undefined') throw new Error('canonical-analysis is server-only.');

export type CanonicalAnalysisError = 'not_found' | 'invalid_result' | 'invalid_job_match' | 'wrong_mode';
export interface CanonicalAnalysis {
  id: string;
  userId: string;
  mode: 'job_match';
  profileId: string | null;
  result: CVAnalysisResult;
  cvText: string;
  jobDescription: string;
  jobMatchData: JobMatchDataV2;
  cvRevisionId: string;
  jobRevisionId: string;
  profileSnapshotId: string;
}
export type CanonicalAnalysisResult = { ok: true; analysis: CanonicalAnalysis } | { ok: false; error: CanonicalAnalysisError };
export interface LoadCanonicalAnalysisArgs { userId: string; analysisId: string; requireJobMatch?: boolean }

export async function loadCanonicalAnalysis(args: LoadCanonicalAnalysisArgs): Promise<CanonicalAnalysisResult> {
  const row = await prisma.jobMatch.findFirst({
    where: { id: args.analysisId, userId: args.userId },
    include: { cvRevision: true, jobRevision: true, profileSnapshot: true },
  });
  if (!row) return { ok: false, error: 'not_found' };
  const stored = parseStoredAnalysisResult(row.resultJson);
  if (!stored?.result) return { ok: false, error: 'invalid_result' };
  const raw = row.resultJson as Record<string, unknown>;
  const jobMatchData = parseStoredJobMatchData(raw.jobMatchData);
  if (!jobMatchData) return { ok: false, error: 'invalid_job_match' };
  const result = stored.result as CVAnalysisResult;
  result.jobMatchData = jobMatchData;
  return {
    ok: true,
    analysis: {
      id: row.id,
      userId: row.userId,
      mode: 'job_match',
      profileId: row.profileSnapshot.sourceProfileId,
      result,
      cvText: row.cvRevision.extractedText,
      jobDescription: row.jobRevision.description,
      jobMatchData,
      cvRevisionId: row.cvRevisionId,
      jobRevisionId: row.jobRevisionId,
      profileSnapshotId: row.profileSnapshotId,
    },
  };
}
