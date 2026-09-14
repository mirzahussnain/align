import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/shared/lib/auth';
import { listSavedJobs } from '@/shared/services/job-board-api';
import { APIError, withErrorHandler } from '@/shared/utils/api-error';
const Query = z.object({ cursor: z.string().max(500).optional(), limit: z.coerce.number().int().min(1).max(50).default(20) });
export async function GET(request: NextRequest) { return withErrorHandler(async () => { const session = await auth.api.getSession({ headers: request.headers }); if (!session) throw new APIError('Please sign in to view saved jobs.', 401, undefined, 'UNAUTHENTICATED'); const parsed = Query.safeParse(Object.fromEntries(request.nextUrl.searchParams)); if (!parsed.success) throw new APIError('Invalid saved-job pagination.', 400, undefined, 'INVALID_REQUEST'); try { return NextResponse.json(await listSavedJobs(session.user.id, parsed.data)); } catch { throw new APIError('Invalid pagination cursor.', 400, { field: 'cursor' }, 'INVALID_REQUEST'); } }); }