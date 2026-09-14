import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/shared/lib/auth';
import { getCompanyDetailsView } from '@/shared/services/job-board-api';
import { APIError, withErrorHandler } from '@/shared/utils/api-error';
export async function GET(request: NextRequest, context: { params: Promise<{ companyRecordId: string }> }) { return withErrorHandler(async () => { const { companyRecordId } = await context.params; const session = await auth.api.getSession({ headers: request.headers }); const company = await getCompanyDetailsView(companyRecordId, session?.user.id); if (!company) throw new APIError('Company not found.', 404, undefined, 'NOT_FOUND'); return NextResponse.json(company); }); }