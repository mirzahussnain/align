import { NextResponse } from 'next/server';
import { withErrorHandler, APIError } from '@/shared/utils/api-error';
import { auth } from '@/shared/lib/auth';
import { prisma } from '@/shared/lib/prisma';
import { storage, keyFor } from '@/shared/lib/storage';
import { UPLOAD_POLICY } from '@/shared/policies';

const ALLOWED_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

/**
 * Upload a profile picture to the public `avatars` bucket and point User.image
 * at its CDN URL. Avatars are public-read, so we store the direct public URL
 * rather than a presigned link — no round-trip when the dashboard renders it.
 */
export async function POST(request: Request) {
  return withErrorHandler(async () => {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) {
      throw new APIError('Please sign in to update your avatar.', 401);
    }

    const formData = await request.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      throw new APIError('No image file provided.', 400);
    }

    const ext = ALLOWED_TYPES[file.type];
    if (!ext) {
      throw new APIError('Unsupported image type. Use PNG, JPEG, or WebP.', 400);
    }

    if (file.size > UPLOAD_POLICY.avatar.maxBytes) {
      throw new APIError('Image too large. Max 5MB.', 400);
    }

    const userId = session.user.id;
    const buffer = Buffer.from(await file.arrayBuffer());

    // Fixed file name per user so a new upload overwrites the old object instead
    // of orphaning it in the bucket.
    const key = keyFor.avatar(userId, `avatar.${ext}`);
    await storage.upload({ bucket: 'avatars', key, body: buffer, contentType: file.type });

    // Cache-bust: the object key is stable per user, so without a version query
    // the CDN/browser would keep serving the previous picture after a re-upload.
    const image = `${storage.publicUrl(key)}?v=${Date.now()}`;
    await prisma.user.update({ where: { id: userId }, data: { image } });

    return NextResponse.json({ image });
  });
}
