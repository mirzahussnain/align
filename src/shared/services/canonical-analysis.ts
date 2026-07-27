// Server-only canonical analysis loader.
//
// Internal workflows — CV regeneration, profile reconciliation, evidence
// matching/approval, result recovery, repair, provenance generation — must
// operate on the COMPLETE, canonical analysis exactly as stored, never on the
// plan-projected report shape that /api/analyses/[id] returns to the browser.
// Projection deliberately strips fields for Free users; feeding a projected
// payload into generation would silently degrade a paying capability or, worse,
// omit requirement/evidence data the rewrite depends on.
//
// This module is the single trusted entry point for that read. It:
//   - verifies ownership (the row must belong to the requesting user),
//   - validates the stored blobs against their canonical schemas (never casts),
//   - returns the full jobMatchData ledger and rawResult unchanged,
//   - NEVER applies Free/Pro projection.
//
// User-facing report routes keep using report-projection.ts; this loader is for
// server-internal use only and must not be imported by any client component.
// A runtime guard enforces that (the `server-only` package is not a dependency
// here, so we assert directly rather than relying on the bundler).

import { prisma } from '@/shared/lib/prisma';
import { parseStoredAnalysisResult } from '@/shared/schemas/analysis-result';
import { parseStoredJobMatchData } from '@/shared/schemas/ai-output';
import type { CVAnalysisResult } from '@/shared/types/cv';
import type { JobMatchDataV2 } from '@/shared/types/ai';

// Server-only guard: a canonical, unprojected read must never run in the browser
// bundle. This throws at import time if that ever happens, standing in for the
// `server-only` package (not a dependency in this project).
if (typeof window !== 'undefined') {
  throw new Error('canonical-analysis is server-only and must not be imported into client code.');
}

export type CanonicalAnalysisError =
  /** No row with this id, or it is not owned by the requesting user. */
  | 'not_found'
  /** The stored rawResult blob failed canonical schema validation. */
  | 'invalid_result'
  /** A job-match analysis whose stored ledger failed schemaVersion-2 validation. */
  | 'invalid_job_match'
  /** A job-match-only workflow was asked to load an ATS-only analysis. */
  | 'wrong_mode';

export interface CanonicalAnalysis {
  id: string;
  userId: string;
  mode: string;
  profileId: string | null;
  /** Full, unprojected analysis result. */
  result: CVAnalysisResult;
  /** Original CV text captured at analysis time (empty string if absent). */
  cvText: string;
  /** Job description this analysis was run against (empty string for ATS-only). */
  jobDescription: string;
  /** Canonical JobMatchDataV2 ledger — present only for job-match analyses. */
  jobMatchData: JobMatchDataV2 | null;
}

export type CanonicalAnalysisResult =
  | { ok: true; analysis: CanonicalAnalysis }
  | { ok: false; error: CanonicalAnalysisError };

export interface LoadCanonicalAnalysisArgs {
  userId: string;
  analysisId: string;
  /** When true, the analysis must be a job-match run with a valid v2 ledger. */
  requireJobMatch?: boolean;
}

/**
 * Load a user's analysis in its complete canonical form for internal use.
 * Ownership-checked and schema-validated; NEVER plan-projected.
 */
export async function loadCanonicalAnalysis(
  args: LoadCanonicalAnalysisArgs
): Promise<CanonicalAnalysisResult> {
  const { userId, analysisId, requireJobMatch = false } = args;

  const row = await prisma.analysis.findUnique({
    where: { id: analysisId },
    select: {
      id: true,
      userId: true,
      mode: true,
      profileId: true,
      rawResult: true,
      jobDescription: true,
      jobMatchData: true,
    },
  });

  // Ownership is part of the loader's contract: an unowned row is indistinguishable
  // from a missing one to the caller, so it can never leak another user's result.
  if (!row || row.userId !== userId) return { ok: false, error: 'not_found' };

  if (requireJobMatch && row.mode !== 'job_match') {
    return { ok: false, error: 'wrong_mode' };
  }

  const stored = parseStoredAnalysisResult(row.rawResult);
  if (!stored) return { ok: false, error: 'invalid_result' };

  let jobMatchData: JobMatchDataV2 | null = null;
  if (row.mode === 'job_match') {
    jobMatchData = parseStoredJobMatchData(row.jobMatchData);
    // A job-match analysis without a valid canonical ledger is unusable for any
    // generation workflow — fail loudly rather than feed a rewrite half a ledger.
    if (requireJobMatch && !jobMatchData) return { ok: false, error: 'invalid_job_match' };
  }

  const result = stored.result;
  const cvText = result.rawText ?? '';
  const jobDescription = row.jobDescription ?? result.jobDescription ?? '';

  return {
    ok: true,
    analysis: {
      id: row.id,
      userId: row.userId,
      mode: row.mode,
      profileId: row.profileId,
      result,
      cvText,
      jobDescription,
      jobMatchData,
    },
  };
}
