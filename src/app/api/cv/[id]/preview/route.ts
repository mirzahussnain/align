import { NextResponse } from 'next/server';
import { auth } from '@/shared/lib/auth';
import { prisma } from '@/shared/lib/prisma';
import { APIError, withErrorHandler } from '@/shared/utils/api-error';
import { retryOwnedThumbnail } from '@/shared/document-preview/preview-service';
import { toCvPreviewView } from '@/shared/document-preview/preview-view';

export const runtime = 'nodejs';
export const maxDuration = 60;

async function ownedPreview(userId: string, generatedCvId: string) {
  return prisma.generatedCvPreview.findFirst({
    where: { userId, generatedCvId },
    select: {
      status: true, failureCode: true, pageCount: true,
      pdfKey: true, pageImageKeys: true,
    },
  });
}

async function sessionUser(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) throw new APIError('Please sign in to view this CV.', 401);
  return session.user.id;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withErrorHandler(async () => {
    const userId = await sessionUser(request);
    const { id } = await params;
    const preview = await ownedPreview(userId, id);
    if (!preview) throw new APIError('CV preview not found.', 404);
    return NextResponse.json(toCvPreviewView(id, preview), {
      status: preview.status === 'RENDERING' ? 202 : 200,
      headers: { 'Cache-Control': 'private, no-store, max-age=0' },
    });
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withErrorHandler(async () => {
    const userId = await sessionUser(request);
    const { id } = await params;
    const result = await retryOwnedThumbnail({ userId, generatedCvId: id });
    if (result.status === 'unavailable') throw new APIError('CV preview not found.', 404);
    if (result.status === 'in_progress') {
      return NextResponse.json({ status: 'RENDERING' }, { status: 202 });
    }
    const preview = (result.status === 'ready' ? result.preview : undefined) ??
      await ownedPreview(userId, id);
    if (!preview) throw new APIError('CV preview not found.', 404);
    return NextResponse.json(toCvPreviewView(id, preview), {
      headers: { 'Cache-Control': 'private, no-store, max-age=0' },
    });
  });
}
