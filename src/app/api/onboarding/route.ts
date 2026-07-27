import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/shared/lib/auth';
import { APIError } from '@/shared/utils/api-error';
import { withCvPipeline } from '@/shared/services/cv-pipeline-http';
import {
  advanceOnboarding,
  chooseGoal,
  dismissOnboarding,
  getOnboardingState,
} from '@/shared/services/onboarding';
import { OnboardingGoal, OnboardingStage } from '@/generated/prisma/client';

/**
 * The onboarding state machine's HTTP surface.
 *
 * The client proposes; the server decides. Every action re-reads persisted state
 * and re-checks the move, so a stage cannot be set by hand and the ids attached
 * to it cannot belong to somebody else. Nothing about plans or quotas is read or
 * written here — capability decisions live where the capability is used.
 */

const ActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('choose_goal'), goal: z.enum(OnboardingGoal) }),
  z.object({
    action: z.literal('advance'),
    stage: z.enum(OnboardingStage),
    manualPath: z.boolean().optional(),
    selectedProfileId: z.string().min(1).optional(),
    storedCvId: z.string().min(1).optional(),
    extractionId: z.string().min(1).optional(),
    importSessionId: z.string().min(1).optional(),
  }),
  z.object({ action: z.literal('dismiss') }),
]);

async function requireUserId(request: Request): Promise<string> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) throw new APIError('Please sign in to continue.', 401);
  return session.user.id;
}

export async function GET(request: Request) {
  return withCvPipeline(async () => {
    const userId = await requireUserId(request);
    return NextResponse.json(await getOnboardingState(userId));
  });
}

export async function POST(request: Request) {
  return withCvPipeline(async () => {
    const userId = await requireUserId(request);
    const parsed = ActionSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) throw new APIError('That step is not available.', 400);

    switch (parsed.data.action) {
      case 'choose_goal':
        return NextResponse.json(await chooseGoal(userId, parsed.data.goal));
      case 'advance': {
        const { action: _action, ...input } = parsed.data;
        void _action;
        return NextResponse.json(await advanceOnboarding(userId, input));
      }
      case 'dismiss':
        return NextResponse.json(await dismissOnboarding(userId));
    }
  });
}
