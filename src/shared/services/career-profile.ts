import type { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/shared/lib/prisma';
import { isKnownIndustry } from '@/shared/constants/sector-keywords';
import { isKnownOccupation } from '@/shared/occupations/registry';
import { getUserPlan } from '@/shared/entitlements/server';
import { getPlanEntitlement, type CapabilityDecision } from '@/shared/entitlements/registry';
import { APIError } from '@/shared/utils/api-error';

const CAPABILITY = 'additional_career_profiles' as const;

async function withProfileLock<T>(
  userId: string,
  work: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      'SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))',
      userId,
      CAPABILITY
    );
    return work(tx);
  });
}

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
    'You have reached the Career Profile limit for your current plan.',
    403,
    { code: 'PROFILE_LIMIT_REACHED', ...decision },
    'PROFILE_LIMIT_REACHED'
  );
}

export interface CreateProfileInput {
  userId: string;
  label: string;
  targetIndustry?: string;
  targetOccupation?: string;
  ensureUniqueLabel?: boolean;
}

export async function createProfileWithinPlanLimit(input: CreateProfileInput) {
  const baseLabel = input.label.trim();
  if (!baseLabel) throw new APIError('Give the profile a name.', 400, undefined, 'INVALID_REQUEST');

  return withProfileLock(input.userId, async (tx) => {
    const plan = await getUserPlan(input.userId);
    const entitlement = getPlanEntitlement(plan, CAPABILITY);
    const used = await tx.profile.count({ where: { userId: input.userId } });
    if (entitlement.mode === 'resource_limit' && used >= entitlement.limit) {
      throw limitError(limitDecision(plan, entitlement.limit, used));
    }

    const profiles = await tx.profile.findMany({
      where: { userId: input.userId },
      select: { label: true },
    });
    const taken = new Set(profiles.map((profile) => profile.label));
    let label = baseLabel;
    if (input.ensureUniqueLabel) {
      for (let suffix = 2; taken.has(label); suffix += 1) label = `${baseLabel} ${suffix}`;
    } else if (taken.has(label)) {
      throw new APIError(`You already have a profile called "${label}".`, 409, undefined, 'PROFILE_LABEL_EXISTS');
    }

    return tx.profile.create({
      data: {
        userId: input.userId,
        label,
        targetIndustry: isKnownIndustry(input.targetIndustry?.trim())
          ? input.targetIndustry!.trim()
          : null,
        targetOccupation: isKnownOccupation(input.targetOccupation)
          ? input.targetOccupation
          : null,
        isDefault: used === 0,
      },
      select: { id: true, label: true, isDefault: true },
    });
  });
}

export async function setDefaultProfileForUser(
  userId: string,
  profileId: string
): Promise<{ updated: boolean }> {
  return withProfileLock(userId, async (tx) => {
    const owned = await tx.profile.findFirst({
      where: { id: profileId, userId },
      select: { id: true },
    });
    if (!owned) return { updated: false };
    await tx.profile.updateMany({ where: { userId }, data: { isDefault: false } });
    await tx.profile.update({ where: { id: profileId }, data: { isDefault: true } });
    return { updated: true };
  });
}

export async function deleteProfileForUser(
  userId: string,
  profileId: string
): Promise<{ deleted: boolean; reason: 'not_found' | 'last_profile' | null }> {
  return withProfileLock(userId, async (tx) => {
    const profiles = await tx.profile.findMany({
      where: { userId },
      select: { id: true, isDefault: true },
      orderBy: { createdAt: 'asc' },
    });
    const target = profiles.find((profile) => profile.id === profileId);
    if (!target) return { deleted: false, reason: 'not_found' };
    if (profiles.length === 1) return { deleted: false, reason: 'last_profile' };

    await tx.profile.delete({ where: { id: profileId } });
    const survivors = profiles.filter((profile) => profile.id !== profileId);
    const defaults = survivors.filter((profile) => profile.isDefault);
    if (target.isDefault || defaults.length !== 1) {
      const next = defaults[0] ?? survivors[0];
      await tx.profile.updateMany({ where: { userId }, data: { isDefault: false } });
      await tx.profile.update({ where: { id: next.id }, data: { isDefault: true } });
    }
    return { deleted: true, reason: null };
  });
}
