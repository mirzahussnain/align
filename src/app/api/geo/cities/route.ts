import { NextRequest, NextResponse } from 'next/server';
import { fetchCities } from '@/shared/services/countries';
import { withErrorHandler, APIError } from '@/shared/utils/api-error';

export const revalidate = 86400;

export async function GET(request: NextRequest) {
  return withErrorHandler(async () => {
    const params = new URL(request.url).searchParams;
    const country = params.get('country')?.trim();
    const state = params.get('state')?.trim() || undefined;
    if (!country) throw new APIError('A country is required', 400);
    const cities = await fetchCities(country, state);
    return NextResponse.json({ cities });
  });
}
