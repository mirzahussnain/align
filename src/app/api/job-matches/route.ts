import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/shared/lib/auth';
import { prisma } from '@/shared/lib/prisma';
import { applyRateLimit, analysisLimiter } from '@/shared/lib/rate-limit';
import { APIError, withErrorHandler } from '@/shared/utils/api-error';
import { runJobMatch } from '@/shared/services/job-match-service';
import { checkCapability } from '@/shared/entitlements/server';
import { projectAnalysisReport } from '@/shared/entitlements/report-projection';

const Input = z.object({
  requestId: z.string().min(1),
  storedCvId: z.string().min(1).optional(),
  file: z.custom<File>((value) => value instanceof File).optional(),
}).refine((value) => Boolean(value.file) !== Boolean(value.storedCvId), 'Choose exactly one CV source.');

export async function POST(request: NextRequest) {
  return withErrorHandler(async () => {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) throw new APIError('Please sign in to run a Job Match.', 401);
    const limited = await applyRateLimit(analysisLimiter, session.user.id);
    if (limited) return limited;
    const form = await request.formData();
    const parsed = Input.safeParse({ requestId: form.get('jobMatchRequestId') || form.get('requestId'), storedCvId: form.get('storedCvId') || undefined, file: form.get('file') ?? undefined });
    if (!parsed.success) throw new APIError(parsed.error.message, 400);
    const result = await runJobMatch({ userId: session.user.id, operationId: request.headers.get('x-operation-id') ?? crypto.randomUUID(), ...parsed.data });
    const [report, requirementLedger, rewriteStrategy, eligibility] = await Promise.all([
      checkCapability(session.user.id, 'view_full_job_match_report'),
      checkCapability(session.user.id, 'view_requirement_ledger'),
      checkCapability(session.user.id, 'view_rewrite_strategy'),
      checkCapability(session.user.id, 'view_eligibility_analysis'),
    ]);
    return NextResponse.json(projectAnalysisReport(result, { report, requirementLedger, rewriteStrategy, eligibility }));
  });
}

export async function GET(request: NextRequest) {
  return withErrorHandler(async () => {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) throw new APIError('Please sign in to view Job Matches.', 401);
    const matches = await prisma.jobMatch.findMany({
      where: { userId: session.user.id }, orderBy: { createdAt: 'desc' }, take: 100,
      select: { id: true, matchScore: true, createdAt: true, jobRevision: { select: { title: true, company: true } }, cvRevision: { select: { filename: true } }, profileSnapshot: { select: { profileLabel: true, snapshotJson: true } } },
    });
    return NextResponse.json({ matches });
  });
}
