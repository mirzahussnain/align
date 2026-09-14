import { NextRequest, NextResponse } from 'next/server';
import { applyRateLimit, publicAtsLimiter } from '@/shared/lib/rate-limit';
import { APIError, withErrorHandler } from '@/shared/utils/api-error';
import {
  createPublicAtsDemo,
  getPublicAtsDemo,
  PUBLIC_ATS_COOKIE,
  publicAtsClientIp,
  publicAtsIdentifier,
  projectPublicAtsPreview,
} from '@/shared/services/public-ats-service';

export async function POST(request: NextRequest) {
  return withErrorHandler(async () => {
    const ip = publicAtsClientIp(request.headers);
    const limited = await applyRateLimit(publicAtsLimiter, publicAtsIdentifier(ip));
    if (limited) return limited;
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) throw new APIError('Choose a PDF or DOCX CV.', 400);
    const demo = await createPublicAtsDemo({
      file,
      existingToken: request.cookies.get(PUBLIC_ATS_COOKIE)?.value,
      ip,
    });
    const response = NextResponse.json({ preview: projectPublicAtsPreview(demo.result), expiresAt: demo.expiresAt.toISOString() });
    response.cookies.set(PUBLIC_ATS_COOKIE, demo.token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      expires: demo.expiresAt,
    });
    return response;
  });
}

export async function GET(request: NextRequest) {
  return withErrorHandler(async () => {
    const token = request.cookies.get(PUBLIC_ATS_COOKIE)?.value;
    if (!token) throw new APIError('No ATS demo is available in this browser.', 404);
    const demo = await getPublicAtsDemo(token);
    return NextResponse.json({ preview: projectPublicAtsPreview(demo.result), expiresAt: demo.expiresAt.toISOString() });
  });
}
