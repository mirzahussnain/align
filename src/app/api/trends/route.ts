import { type NextRequest, NextResponse } from 'next/server';

import { applyRateLimit, trendsLimiter } from '@/shared/lib/rate-limit';
import { resolveCareerMarketSnapshot } from '@/shared/services/career-market';

export async function GET(request: NextRequest) {
  const limited = await applyRateLimit(
    trendsLimiter,
    request.headers.get('x-forwarded-for') ?? 'anonymous-market',
  );
  if (limited) return limited;

  const searchParams = new URL(request.url).searchParams;
  const role = searchParams.get('role')?.trim() ?? '';
  const location = searchParams.get('location')?.trim() || 'UK';
  if (role.length < 2 || role.length > 100 || location.length > 100) {
    return NextResponse.json({ error: { code: 'INVALID_MARKET_QUERY' } }, { status: 400 });
  }

  try {
    const result = await resolveCareerMarketSnapshot({ role, location });
    return NextResponse.json({
      ...result,
      methodology: {
        scope: 'BOUNDED_SAMPLE',
        statement: "Sampled current vacancies from Align's integrated sources, not the complete UK labour market.",
        salaryMethod: 'Disclosure rate uses any stated salary; distribution uses only normalized annual GBP values.',
        sponsorshipMethod: 'Employer register context does not confirm sponsorship for a vacancy or candidate.',
      },
    }, { status: result.freshness === 'PENDING' ? 202 : 200 });
  } catch {
    return NextResponse.json({ error: { code: 'MARKET_SAMPLE_UNAVAILABLE' } }, { status: 503 });
  }
}
