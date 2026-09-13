import type { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/shared/lib/prisma';
import { getUserPlan } from '@/shared/entitlements/server';
import { getPlanEntitlement, type CapabilityDecision } from '@/shared/entitlements/registry';
import { APIError } from '@/shared/utils/api-error';

const CAPABILITY = 'saved_jobs' as const;
const JOB_INCLUDE = { jobSnapshot: { include: { providerReferences: true } } } as const;

export interface SaveJobInput {
  userId: string;
  jobSnapshotId: string;
  profileId?: string;
}

export type SavedJobMutationResult = {
  created: boolean;
  savedJob: Prisma.SavedJobGetPayload<{ include: typeof JOB_INCLUDE }>;
};

function limitDecision(plan: 'FREE' | 'PRO', limit: number, used: number): CapabilityDecision {
  return {
    capability: CAPABILITY,
    plan,
    mode: 'resource_limit',
    allowed: false,
    limit,
    used,
    remaining: 0,
    reason: 'resource_limit_reached',
    ...(plan === 'FREE' ? { upgradeTarget: 'PRO' as const } : {}),
  };
}

function limitError(decision: CapabilityDecision): APIError {
  return new APIError(
    'You have reached the saved-job limit for your current plan.',
    403,
    { code: 'SAVED_JOB_LIMIT_REACHED', ...decision },
    'SAVED_JOB_LIMIT_REACHED'
  );
}

export async function saveJobForUser(input: SaveJobInput): Promise<SavedJobMutationResult> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      'SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))',
      input.userId,
      CAPABILITY
    );

    const snapshot = await tx.jobSnapshot.findFirst({
      where: {
        id: input.jobSnapshotId,
        OR: [{ importedByUserId: null }, { importedByUserId: input.userId }],
      },
      select: { id: true },
    });
    if (!snapshot) {
      throw new APIError('Vacancy reference is invalid.', 404, undefined, 'INVALID_JOB_REFERENCE');
    }

    if (input.profileId) {
      const profile = await tx.profile.findFirst({
        where: { id: input.profileId, userId: input.userId },
        select: { id: true },
      });
      if (!profile) throw new APIError('Career Track not found.', 404, undefined, 'NOT_FOUND');
    }

    const existing = await tx.savedJob.findUnique({
      where: {
        userId_jobSnapshotId: {
          userId: input.userId,
          jobSnapshotId: input.jobSnapshotId,
        },
      },
      include: JOB_INCLUDE,
    });
    if (existing) {
      const savedJob =
        input.profileId && input.profileId !== existing.profileId
          ? await tx.savedJob.update({
              where: { id: existing.id },
              data: { profileId: input.profileId },
              include: JOB_INCLUDE,
            })
          : existing;
      return { created: false, savedJob };
    }

    const plan = await getUserPlan(input.userId);
    const entitlement = getPlanEntitlement(plan, CAPABILITY);
    if (entitlement.mode === 'resource_limit') {
      const used = await tx.savedJob.count({ where: { userId: input.userId } });
      if (used >= entitlement.limit) throw limitError(limitDecision(plan, entitlement.limit, used));
    }

    const savedJob = await tx.savedJob.create({
      data: {
        userId: input.userId,
        jobSnapshotId: input.jobSnapshotId,
        profileId: input.profileId,
      },
      include: JOB_INCLUDE,
    });
    return { created: true, savedJob };
  });
}

export type UnsaveJobInput =
  | { userId: string; savedJobId: string; jobSnapshotId?: never }
  | { userId: string; jobSnapshotId: string; savedJobId?: never };

export async function unsaveJobForUser(input: UnsaveJobInput): Promise<{ removed: boolean }> {
  const result = await prisma.savedJob.deleteMany({
    where: {
      userId: input.userId,
      ...('savedJobId' in input ? { id: input.savedJobId } : { jobSnapshotId: input.jobSnapshotId }),
    },
  });
  return { removed: result.count > 0 };
}
