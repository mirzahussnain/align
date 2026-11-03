import { NextResponse } from 'next/server';
import { auth } from '@/shared/lib/auth';
import { prisma } from '@/shared/lib/prisma';
import { storage } from '@/shared/lib/storage';
import { assertCapability } from '@/shared/entitlements/server';
import { APIError, withErrorHandler } from '@/shared/utils/api-error';

export const runtime = 'nodejs';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withErrorHandler(async () => {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) throw new APIError('Please sign in to download this CV.', 401);
    const { id } = await params;
    const preview = await prisma.generatedCvPreview.findFirst({
      where: { userId: session.user.id, generatedCvId: id },
      select: { pageCount: true, pdfKey: true, pdfSize: true },
    });
    if (
      !preview?.pdfKey ||
      !preview.pdfSize ||
      (preview.pageCount !== 1 && preview.pageCount !== 2)
    ) {
      throw new APIError('Verified PDF not found.', 404);
    }
    await assertCapability(session.user.id, 'download_generated_cv');
    const bytes = await storage.download('rewrites', preview.pdfKey);
    if (bytes.length < 5 || bytes.subarray(0, 5).toString('ascii') !== '%PDF-') {
      throw new APIError('Verified PDF not found.', 404);
    }
    return new NextResponse(Uint8Array.from(bytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="CV.pdf"',
        'Cache-Control': 'private, no-store, max-age=0',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  });
}
