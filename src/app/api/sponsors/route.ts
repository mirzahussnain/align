import { NextRequest, NextResponse } from 'next/server';
import { getSponsors } from '@/shared/services/sponsor-registry';
import { withErrorHandler, APIError } from '@/shared/utils/api-error';
import { SponsorQuerySchema } from './schema';

export async function GET(request: NextRequest) {
  return withErrorHandler(async () => {
    const { searchParams } = new URL(request.url);
    
    const parsed = SponsorQuerySchema.safeParse(Object.fromEntries(searchParams.entries()));
    if (!parsed.success) {
      throw new APIError(parsed.error.message, 400);
    }

    const { query, route, industry, page, perPage } = parsed.data;

    const sponsors = await getSponsors();

    // Filter
    const filtered = sponsors.filter((sponsor) => {
      if (
        query &&
        !sponsor.organisationName.toLowerCase().includes(query) &&
        !sponsor.townCity.toLowerCase().includes(query)
      ) {
        return false;
      }
      if (route !== 'all' && !sponsor.route.toLowerCase().includes(route)) {
        return false;
      }
      if (
        industry !== 'all' &&
        (!sponsor.industry || sponsor.industry.toLowerCase() !== industry)
      ) {
        return false;
      }
      return true;
    });

    // Paginate
    const total = filtered.length;
    const start = (page - 1) * perPage;
    const paginated = filtered.slice(start, start + perPage);

    return NextResponse.json({
      sponsors: paginated,
      total,
      page,
      perPage,
    });
  });
}
