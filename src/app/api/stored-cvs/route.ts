import { NextResponse } from 'next/server';
import { auth } from '@/shared/lib/auth';
import { APIError } from '@/shared/utils/api-error';
import { withCvPipeline } from '@/shared/services/cv-pipeline-http';
import { checkCapability } from '@/shared/entitlements/server';
import { listStoredCvs, extractStoredCvRecord } from '@/shared/services/stored-cv';
import { CvPipelineError, MAX_CV_UPLOAD_BYTES } from '@/shared/services/cv-extraction';
import { blockOnboarding } from '@/shared/services/onboarding';

/** Stored-CV listing and extraction; uploads use the intent routes. */

export async function GET(request: Request) {
  return withCvPipeline(async () => {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) throw new APIError('Please sign in to continue.', 401);

    const [storedCvs, decision] = await Promise.all([
      listStoredCvs(session.user.id),
      checkCapability(session.user.id, 'stored_source_cvs'),
    ]);
    // Usage comes from the server with the list, so no component has to hard-code
    // "3 of 3" or guess what the plan allows.
    return NextResponse.json({ storedCvs, capacity: decision, maxBytes: MAX_CV_UPLOAD_BYTES });
  });
}

/**
 * Extraction is a separate, explicitly-triggered step so a failed read can be
 * retried without re-uploading, and so the upload response is not held open for
 * the length of a parse.
 */
export async function PUT(request: Request) {
  return withCvPipeline(async () => {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) throw new APIError('Please sign in to continue.', 401);

    const body = (await request.json().catch(() => ({}))) as { storedCvId?: unknown; force?: unknown };
    if (typeof body.storedCvId !== 'string' || !body.storedCvId) {
      throw new CvPipelineError('NOT_FOUND', 404);
    }

    try {
      const extraction = await extractStoredCvRecord({
        userId: session.user.id,
        storedCvId: body.storedCvId,
        force: body.force === true,
      });
      return NextResponse.json({
        extractionId: extraction.id,
        status: extraction.status,
        parserVersion: extraction.parserVersion,
      });
    } catch (error) {
      if (error instanceof CvPipelineError) {
        await blockOnboarding(session.user.id, error.code).catch(() => undefined);
      }
      throw error;
    }
  });
}
