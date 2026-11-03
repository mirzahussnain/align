import { NextResponse } from 'next/server';
import { auth } from '@/shared/lib/auth';
import { prisma } from '@/shared/lib/prisma';
import { storage } from '@/shared/lib/storage';
import { APIError, withErrorHandler } from '@/shared/utils/api-error';

export const runtime = 'nodejs';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; page: string }> },
) {
  return withErrorHandler(async () => {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) throw new APIError('Please sign in to view this CV.', 401);
    const { id, page: rawPage } = await params;
    const page = Number(rawPage);
    if (!Number.isInteger(page) || page < 1 || page > 2) {
      throw new APIError('Preview page not found.', 404);
    }
    const preview = await prisma.generatedCvPreview.findFirst({
      where: { userId: session.user.id, generatedCvId: id, status: 'READY' },
      select: { pageCount: true, pageImageKeys: true },
    });
    if (!preview || preview.pageCount !== preview.pageImageKeys.length || page > preview.pageCount) {
      throw new APIError('Preview page not found.', 404);
    }
    const key = preview.pageImageKeys[page - 1];
    if (!key) throw new APIError('Preview page not found.', 404);
    const bytes = await storage.download('rewrites', key);
    return new NextResponse(Uint8Array.from(bytes), {
      headers: {
        'Content-Type': 'image/png',
        'Content-Disposition': `inline; filename="cv-preview-page-${page}.png"`,
        'Cache-Control': 'private, no-store, max-age=0',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  });
}
