import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/shared/lib/auth';
import { APIError } from '@/shared/utils/api-error';
import { applyRateLimit, analysisLimiter } from '@/shared/lib/rate-limit';
import { withCvPipeline } from '@/shared/services/cv-pipeline-http';
import { applyCandidateDecisions, type CandidateDecision } from '@/shared/services/cv-import';
import { checkCapability } from '@/shared/entitlements/server';
import { recordProfileFirstValue } from '@/shared/services/onboarding';

/**
 * Confirm or reject reviewed import proposals.
 *
 * This is the ONLY path by which parser output becomes a canonical Career
 * Profile record, and it always requires an explicit per-candidate decision.
 *
 * A batch does not fail as a unit. Canonical career records are uncapped and all
 * land; `OTHER_EVIDENCE` beyond the reusable-evidence allowance simply stays
 * proposed and reviewable. The response says what happened to every candidate,
 * so the UI never has to infer it — and nothing is silently discarded.
 */

const DecisionSchema = z.discriminatedUnion('action', [
  z.object({
    candidateId: z.string().min(1),
    action: z.literal('confirm'),
    /** A user correction. Provenance fields are held on the row, out of reach. */
    edited: z.unknown().optional(),
  }),
  z.object({ candidateId: z.string().min(1), action: z.literal('reject') }),
]);

const ConfirmSchema = z.object({
  sessionId: z.string().min(1),
  // Bounded so one request cannot ask for an unbounded number of writes.
  decisions: z.array(DecisionSchema).min(1).max(300),
});

export async function POST(request: Request) {
  return withCvPipeline(async () => {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) throw new APIError('Please sign in to continue.', 401);

    const rateLimited = await applyRateLimit(analysisLimiter, session.user.id);
    if (rateLimited) return rateLimited;

    const parsed = ConfirmSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) throw new APIError('Those details could not be saved.', 400);

    const result = await applyCandidateDecisions({
      userId: session.user.id,
      sessionId: parsed.data.sessionId,
      decisions: parsed.data.decisions as CandidateDecision[],
    });

    // Importing real career history can be what makes a profile usable, which is
    // itself a first value for someone whose goal was to build their profile.
    // Judged from the profile's content, never from having reached this route.
    if (result.imported > 0) {
      await recordProfileFirstValue(session.user.id, result.session.profileId);
    }

    // Re-read after the writes so the meter shown next to the remaining evidence
    // proposals is the live one, not the value from before this batch.
    const evidenceCapacity = await checkCapability(session.user.id, 'profile_evidence_storage');
    return NextResponse.json({ ...result, evidenceCapacity });
  });
}
