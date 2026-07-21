import { NextResponse } from 'next/server';
import { withErrorHandler, APIError } from '@/shared/utils/api-error';
import { auth } from '@/shared/lib/auth';
import { prisma } from '@/shared/lib/prisma';
import { parseStoredAnalysisResult } from '@/shared/schemas/analysis-result';
import { parseStoredJobMatchData } from '@/shared/schemas/ai-output';

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
        jobMatchData: true,
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

    // Stamp the row id onto the result so the stored-report rewrite flow has the
    // same `result.analysisId` the fresh flow gets from /api/analyze — the
    // regenerate endpoint keys off it. The id is never written into the blob,
    // so it can only be attached here at read time.
    const canonicalJobMatch =
      analysis.mode === 'job_match' ? parseStoredJobMatchData(analysis.jobMatchData) : null;
    if (analysis.mode === 'job_match' && !canonicalJobMatch) {
      throw new APIError(
        'Stored job-match data failed integrity validation: schemaVersion 2 is required.',
        409
      );
    }
    const result = parsed?.result
      ? {
          ...parsed.result,
          ...(canonicalJobMatch ? { jobMatchData: canonicalJobMatch } : {}),
          analysisId: analysis.id,
        }
      : null;

    return NextResponse.json({
      id: analysis.id,
      mode: analysis.mode,
      overallScore: analysis.overallScore,
      sourceFileName: analysis.sourceFileName,
      createdAt: analysis.createdAt.toISOString(),
      result,
      legacy: parsed?.legacy ?? true,
    });
  });
}
