import { NextResponse } from 'next/server';
import { withErrorHandler, APIError } from '@/shared/utils/api-error';
import { auth } from '@/shared/lib/auth';
import { prisma } from '@/shared/lib/prisma';
import { parseStoredAnalysisResult } from '@/shared/schemas/analysis-result';

/**
 * Fetch a single stored analysis in full. The complete CVAnalysisResult lives in
 * the `rawResult` Json column, so the detail view can rehydrate the exact same
 * dashboard the user saw when the analysis first ran — no re-analysis, no AI cost.
 * Scoped to the owner so one user can't read another's report by guessing ids.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withErrorHandler(async () => {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) {
      throw new APIError('Please sign in to view this analysis.', 401);
    }

    const { id } = await params;

    const analysis = await prisma.analysis.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        mode: true,
        overallScore: true,
        rawResult: true,
        sourceFileName: true,
        createdAt: true,
      },
    });

    if (!analysis || analysis.userId !== session.user.id) {
      throw new APIError('Analysis not found.', 404);
    }

    // Stored blobs are validated, not trusted: a row written by an older
    // engine version that no longer parses gets an explicit signal the client
    // renders as "re-analyse for a current report" instead of a crash.
    const parsed = parseStoredAnalysisResult(analysis.rawResult);

    return NextResponse.json({
      id: analysis.id,
      mode: analysis.mode,
      overallScore: analysis.overallScore,
      sourceFileName: analysis.sourceFileName,
      createdAt: analysis.createdAt.toISOString(),
      result: parsed?.result ?? null,
      legacy: parsed?.legacy ?? true,
    });
  });
}
