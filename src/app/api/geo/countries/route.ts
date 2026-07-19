import { NextResponse } from 'next/server';
import { fetchCountries } from '@/shared/services/countries';
import { withErrorHandler } from '@/shared/utils/api-error';

// Reference data — cache the rendered response for a day.
export const revalidate = 86400;

export async function GET() {
  return withErrorHandler(async () => {
    const countries = await fetchCountries();
    return NextResponse.json({ countries });
  });
}
