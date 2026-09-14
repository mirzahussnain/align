import { NextResponse } from 'next/server';
import { auth } from '@/shared/lib/auth';
import { APIError } from '@/shared/utils/api-error';
import { withCvPipeline } from '@/shared/services/cv-pipeline-http';
import { deleteStoredCv, storedCvDownloadUrl } from '@/shared/services/stored-cv';

/**
 * Read a signed link to, or delete, one stored CV.
 *
 * Both operations are ownership-scoped in the service. Deletion is a SOFT delete
 * that removes the binary and frees the resource slot while keeping the row, its
 * extractions and every confirmed import candidate — those are the provenance
 * for canonical profile records the user still holds.
 */

async function requireUserId(request: Request): Promise<string> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) throw new APIError('Please sign in to continue.', 401);
  return session.user.id;
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return withCvPipeline(async () => {
    const userId = await requireUserId(request);
    const { id } = await context.params;
    // Short-lived and single-purpose. The bucket is private, and a link that
    // outlives the page it was rendered on is a link that can be forwarded.
    return NextResponse.json({ url: await storedCvDownloadUrl(userId, id) });
  });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  return withCvPipeline(async () => {
    const userId = await requireUserId(request);
    const { id } = await context.params;
    await deleteStoredCv(userId, id);
    return NextResponse.json({ ok: true });
  });
}
