import { NextRequest, NextResponse } from 'next/server';
import { fetchStates } from '@/shared/services/countries';
import { withErrorHandler, APIError } from '@/shared/utils/api-error';

export const revalidate = 86400;

export async function GET(request: NextRequest) {
  return withErrorHandler(async () => {
    const country = new URL(request.url).searchParams.get('country')?.trim();
    if (!country) throw new APIError('A country is required', 400);
    const states = await fetchStates(country);
    return NextResponse.json({ states });
  });
}
