import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/shared/lib/auth';
import { prisma } from '@/shared/lib/prisma';
import { withErrorHandler, APIError } from '@/shared/utils/api-error';
import { checkCapability } from '@/shared/entitlements/server';
import { projectAnalysisReport } from '@/shared/entitlements/report-projection';
import type { CVAnalysisResult } from '@/shared/types/cv';

export async function GET(request: NextRequest, context: RouteContext<'/api/ats-analyses/[id]'>) {
  return withErrorHandler(async () => {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) throw new APIError('Please sign in to view this ATS analysis.', 401);
    const { id } = await context.params;
    const row = await prisma.atsAnalysis.findFirst({ where: { id, userId: session.user.id }, include: { cvRevision: true, profile: { select: { label: true } } } });
    if (!row) throw new APIError('ATS analysis not found.', 404);
    const report = await checkCapability(session.user.id, 'view_full_ats_report');
    return NextResponse.json({
      analysis: {
        ...projectAnalysisReport({ ...(row.resultJson as unknown as CVAnalysisResult), analysisId: row.id }, { report }),
        viewerMode: report.plan === 'PRO' ? 'authenticated_pro' : 'authenticated_free',
      },
      cvUsed: { id: row.cvRevision.id, filename: row.cvRevision.filename, checksum: row.cvRevision.checksum, createdAt: row.cvRevision.createdAt, available: Boolean(row.cvRevision.sourceObjectKey && !row.cvRevision.sourceObjectDeletedAt) },
      profileUsed: row.profile ? { label: row.profile.label } : null,
      provenance: { scoringVersion: row.scoringVersion, aiEnhanced: row.aiEnhanced, aiProvider: row.aiProvider, aiModel: row.aiModel, promptVersion: row.promptVersion },
    });
  });
}
