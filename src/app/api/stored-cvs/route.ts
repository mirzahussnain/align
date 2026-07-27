import { NextResponse } from 'next/server';
import { auth } from '@/shared/lib/auth';
import { APIError } from '@/shared/utils/api-error';
import { applyRateLimit, analysisLimiter } from '@/shared/lib/rate-limit';
import { withCvPipeline } from '@/shared/services/cv-pipeline-http';
import { getUserPlan, checkCapability } from '@/shared/entitlements/server';
import {
  listStoredCvs,
  storeUploadedCv,
  extractStoredCvRecord,
  sweepExpiredStoredCvs,
} from '@/shared/services/stored-cv';
import { CvPipelineError, MAX_CV_UPLOAD_BYTES } from '@/shared/services/cv-extraction';
import { blockOnboarding } from '@/shared/services/onboarding';

/**
 * Upload and list stored source CVs.
 *
 * The upload order is the security-relevant part and is enforced in
 * `storeUploadedCv`: authenticate, validate the bytes, resolve the resource
 * entitlement, take the slot under a lock, and only then send anything to object
 * storage. A user at their limit never starts a partial upload, and a file whose
 * signature does not match its name never reaches an extractor.
 */

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

export async function POST(request: Request) {
  return withCvPipeline(async () => {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) throw new APIError('Please sign in to upload your CV.', 401);

    const rateLimited = await applyRateLimit(analysisLimiter, session.user.id);
    if (rateLimited) return rateLimited;

    const formData = await request.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) throw new CvPipelineError('UNSUPPORTED_FORMAT');
    // Bounded before reading the body into memory.
    if (file.size > MAX_CV_UPLOAD_BYTES) throw new CvPipelineError('FILE_TOO_LARGE', 413);

    const plan = await getUserPlan(session.user.id);
    let outcome;
    try {
      outcome = await storeUploadedCv({
        userId: session.user.id,
        plan,
        filename: file.name,
        bytes: Buffer.from(await file.arrayBuffer()),
      });
    } catch (error) {
      // A blocked upload parks onboarding rather than losing it: the user can
      // remove an older CV or upgrade and carry on from the same stage.
      if (error instanceof CvPipelineError && error.code === 'STORED_CV_LIMIT_REACHED') {
        await blockOnboarding(session.user.id, error.code).catch(() => undefined);
      }
      throw error;
    }

    // Retention housekeeping, best-effort and never allowed to fail the upload.
    void sweepExpiredStoredCvs(session.user.id).catch(() => undefined);

    return NextResponse.json(
      { duplicate: outcome.kind === 'duplicate', storedCv: outcome.storedCv },
      { status: outcome.kind === 'duplicate' ? 200 : 201 }
    );
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
