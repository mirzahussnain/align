import { NextRequest, NextResponse } from 'next/server';
import { getSponsorRegisterMetadata, getSponsors } from '@/shared/services/sponsor-registry';
import { withErrorHandler, APIError } from '@/shared/utils/api-error';
import { SponsorQuerySchema } from './schema';
import { applyRateLimit, sponsorsLimiter } from '@/shared/lib/rate-limit';
import { filterSponsors, summarizeSponsorRegister } from '@/shared/utils/sponsor';

export async function GET(request: NextRequest) {
  return withErrorHandler(async () => {
    const ip = request.headers.get('x-forwarded-for') ?? 'anonymous';
    const rateLimitResponse = await applyRateLimit(sponsorsLimiter, ip);
    if (rateLimitResponse) return rateLimitResponse;

    const { searchParams } = new URL(request.url);
    
    const parsed = SponsorQuerySchema.safeParse(Object.fromEntries(searchParams.entries()));
    if (!parsed.success) {
      throw new APIError(parsed.error.message, 400);
    }

    const { query, route, industry, page, perPage } = parsed.data;

    const [sponsors, register] = await Promise.all([
      getSponsors(),
      getSponsorRegisterMetadata(),
    ]);
    const summary = summarizeSponsorRegister(sponsors);
    const filtered = filterSponsors(sponsors, { query, route, industry });

    // Paginate
    const total = filtered.length;
    const start = (page - 1) * perPage;
    const paginated = filtered.slice(start, start + perPage);

    return NextResponse.json({
      sponsors: paginated,
      total,
      page,
      perPage,
      register,
      summary,
    });
  });
}
