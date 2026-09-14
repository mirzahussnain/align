import { NextResponse } from 'next/server';
import { withErrorHandler, APIError } from '@/shared/utils/api-error';
import { auth } from '@/shared/lib/auth';
import { prisma } from '@/shared/lib/prisma';
import { storage } from '@/shared/lib/storage';
import { assertCapability } from '@/shared/entitlements/server';

/**
 * Presign the archived DOCX for a generated CV and redirect straight to it.
 * The `rewrites` bucket is private, so the browser can't reach the object
 * directly — this hands out a short-lived signed URL scoped to the owner.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withErrorHandler(async () => {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) {
      throw new APIError('Please sign in to download this CV.', 401);
    }

    const { id } = await params;

    const cv = await prisma.generatedCV.findUnique({
      where: { id },
      select: { userId: true, fileKey: true },
    });

    if (!cv || cv.userId !== session.user.id) {
      throw new APIError('CV not found.', 404);
    }

    if (!cv.fileKey) {
      throw new APIError('This CV has no archived file to download.', 404);
    }

    await assertCapability(session.user.id, 'download_generated_cv');
    const url = await storage.createSignedUrl('rewrites', cv.fileKey, 300);
    return NextResponse.redirect(url, 302);
  });
}
