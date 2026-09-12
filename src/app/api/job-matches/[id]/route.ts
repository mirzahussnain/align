import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/shared/lib/auth';
import { prisma } from '@/shared/lib/prisma';
import { APIError, withErrorHandler } from '@/shared/utils/api-error';
import { checkCapability } from '@/shared/entitlements/server';
import { projectAnalysisReport } from '@/shared/entitlements/report-projection';
import type { CVAnalysisResult } from '@/shared/types/cv';

export async function GET(request: NextRequest, context: RouteContext<'/api/job-matches/[id]'>) {
  return withErrorHandler(async () => {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) throw new APIError('Please sign in to view this Job Match.', 401);
    const { id } = await context.params;
    const row = await prisma.jobMatch.findFirst({ where: { id, userId: session.user.id }, include: { cvRevision: true, jobRevision: true, profileSnapshot: true, generatedCVs: { orderBy: { versionNumber: 'desc' }, select: { id: true, title: true, versionNumber: true, createdAt: true, fileKey: true } } } });
    if (!row) throw new APIError('Job Match not found.', 404);
    const [report, requirementLedger, rewriteStrategy, eligibility] = await Promise.all([
      checkCapability(session.user.id, 'view_full_job_match_report'), checkCapability(session.user.id, 'view_requirement_ledger'), checkCapability(session.user.id, 'view_rewrite_strategy'), checkCapability(session.user.id, 'view_eligibility_analysis'),
    ]);
    return NextResponse.json({
      match: projectAnalysisReport({ ...(row.resultJson as unknown as CVAnalysisResult), analysisId: row.id }, { report, requirementLedger, rewriteStrategy, eligibility }),
      cvUsed: { id: row.cvRevision.id, filename: row.cvRevision.filename, checksum: row.cvRevision.checksum, createdAt: row.cvRevision.createdAt, available: Boolean(row.cvRevision.sourceObjectKey && !row.cvRevision.sourceObjectDeletedAt) },
      profileUsed: { label: row.profileSnapshot.profileLabel, targetRole: row.profileSnapshot.targetRole, snapshotDate: row.profileSnapshot.createdAt },
      jobUsed: { id: row.jobRevision.id, title: row.jobRevision.title, company: row.jobRevision.company, location: row.jobRevision.location, description: row.jobRevision.description, source: row.jobRevision.descriptionSource, snapshotId: row.jobRevision.jobSnapshotId },
      provenance: { algorithmVersion: row.algorithmVersion, promptVersion: row.promptVersion, aiProvider: row.aiProvider, aiModel: row.aiModel },
      generatedCvs: row.generatedCVs.map((cv) => ({ ...cv, available: Boolean(cv.fileKey), fileKey: undefined })),
    });
  });
}
