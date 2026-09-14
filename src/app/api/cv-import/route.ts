import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/shared/lib/auth';
import { APIError } from '@/shared/utils/api-error';
import { withCvPipeline } from '@/shared/services/cv-pipeline-http';
import { openImportSession, loadImportSession } from '@/shared/services/cv-import';
import { checkCapability } from '@/shared/entitlements/server';

/**
 * Open or resume the import of a stored CV into a Career Profile.
 *
 * Free in every sense: no quota, no AI, no canonical writes. Proposals exist so
 * the user can look at them, and looking at your own CV should never cost
 * anything. The reusable-evidence allowance is reported alongside so the review
 * screen can say what confirming the OTHER_EVIDENCE proposals would use, without
 * any component hard-coding a number.
 */

const OpenSchema = z.object({
  storedCvId: z.string().min(1),
  extractionId: z.string().min(1),
  profileId: z.string().min(1),
});

export async function POST(request: Request) {
  return withCvPipeline(async () => {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) throw new APIError('Please sign in to continue.', 401);

    const parsed = OpenSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) throw new APIError('That import could not be opened.', 400);

    const [importSession, evidenceCapacity] = await Promise.all([
      openImportSession({
        userId: session.user.id,
        ...parsed.data,
        // Only ever used to detect a name mismatch worth confirming; the account
        // name itself is never overwritten from a CV.
        accountFullName: session.user.name ?? '',
      }),
      checkCapability(session.user.id, 'profile_evidence_storage'),
    ]);

    return NextResponse.json({ session: importSession, evidenceCapacity });
  });
}

export async function GET(request: Request) {
  return withCvPipeline(async () => {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) throw new APIError('Please sign in to continue.', 401);

    const sessionId = new URL(request.url).searchParams.get('sessionId');
    if (!sessionId) throw new APIError('That import could not be found.', 400);

    const [importSession, evidenceCapacity] = await Promise.all([
      loadImportSession(session.user.id, sessionId),
      checkCapability(session.user.id, 'profile_evidence_storage'),
    ]);
    return NextResponse.json({ session: importSession, evidenceCapacity });
  });
}
