import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/shared/lib/auth';
import { prisma } from '@/shared/lib/prisma';
import { applyRateLimit, analysisLimiter } from '@/shared/lib/rate-limit';
import { withErrorHandler, APIError } from '@/shared/utils/api-error';
import { AnalyzeRequestSchema } from '@/app/api/analyze/schema';
import { runAtsAnalysis } from '@/shared/services/ats-analysis-service';
import { checkCapability } from '@/shared/entitlements/server';
import { projectAnalysisReport } from '@/shared/entitlements/report-projection';

export async function POST(request: NextRequest) {
  return withErrorHandler(async () => {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) throw new APIError('Please sign in to analyse your CV.', 401);
    const limited = await applyRateLimit(analysisLimiter, session.user.id);
    if (limited) return limited;
    const form = await request.formData();
    const parsed = AnalyzeRequestSchema.safeParse({
      file: form.get('file') ?? undefined,
      storedCvId: form.get('storedCvId') || undefined,
      mode: 'ats',
      profileId: form.get('profileId') || undefined,
      targetSelection: form.get('targetSelection') || undefined,
      savedProfileId: form.get('savedProfileId') || undefined,
      targetRole: form.get('targetRole') || undefined,
      targetOccupation: form.get('targetOccupation') || undefined,
      evidenceSource: 'cv_only',
    });
    if (!parsed.success) throw new APIError(parsed.error.message, 400);
    const result = await runAtsAnalysis({
      userId: session.user.id,
      operationId: request.headers.get('x-operation-id') ?? crypto.randomUUID(),
      file: parsed.data.file,
      storedCvId: parsed.data.storedCvId,
      profileId: parsed.data.profileId,
      targetSelection: parsed.data.targetSelection,
      savedProfileId: parsed.data.savedProfileId,
      targetRole: parsed.data.targetRole,
      targetOccupation: parsed.data.targetOccupation,
    });
    const report = await checkCapability(session.user.id, 'view_full_ats_report');
    return NextResponse.json({
      ...projectAnalysisReport(result, { report }),
      viewerMode: report.plan === 'PRO' ? 'authenticated_pro' : 'authenticated_free',
    });
  });
}

export async function GET(request: NextRequest) {
  return withErrorHandler(async () => {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) throw new APIError('Please sign in to view ATS analyses.', 401);
    const analyses = await prisma.atsAnalysis.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: { id: true, overallScore: true, aiEnhanced: true, occupation: true, createdAt: true, profile: { select: { label: true } }, cvRevision: { select: { filename: true } } },
    });
    return NextResponse.json({ analyses });
  });
}
