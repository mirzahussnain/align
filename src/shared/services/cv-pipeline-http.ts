import { NextResponse } from 'next/server';
import { APIError } from '@/shared/utils/api-error';
import { EntitlementRequiredError, entitlementErrorBody } from '@/shared/entitlements/server';
import { CvPipelineError } from './cv-extraction/errors';

/**
 * One translation point between the CV pipeline's internal failures and what a
 * client is allowed to see.
 *
 * Everything below the API boundary throws typed errors carrying a stable code.
 * Here — and only here — those become responses. Nothing else formats an error
 * for a user, which is what keeps a Prisma constraint name, a mammoth part path
 * or an S3 bucket name from ever reaching a browser.
 */
export function cvPipelineResponse(error: unknown): NextResponse | null {
  if (error instanceof EntitlementRequiredError) {
    // Entitlement failures keep their existing shape so the upgrade UI, which
    // already understands ENTITLEMENT_REQUIRED, works unchanged here.
    return NextResponse.json(entitlementErrorBody(error.decision), {
      status: error.decision.reason === 'quota_exhausted' ? 429 : 403,
    });
  }
  if (error instanceof CvPipelineError) {
    return NextResponse.json(
      { error: error.message, code: error.code, ...(error.details ?? {}) },
      { status: error.status }
    );
  }
  return null;
}

/**
 * Wrap a pipeline handler so typed failures become responses and anything else
 * falls through to the generic 500 handler.
 */
export async function withCvPipeline(handler: () => Promise<NextResponse>): Promise<NextResponse> {
  try {
    return await handler();
  } catch (error) {
    const response = cvPipelineResponse(error);
    if (response) return response;
    if (error instanceof APIError) {
      return NextResponse.json(error.responseBody ?? { error: error.message }, { status: error.statusCode });
    }
    // Deliberately opaque: an unexpected failure here has already been logged
    // with its real detail, and the client gets nothing it could act on anyway.
    console.error('[cv-pipeline] Unhandled error:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'An unexpected internal server error occurred.' }, { status: 500 });
  }
}
