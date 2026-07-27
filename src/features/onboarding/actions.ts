'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { auth } from '@/shared/lib/auth';
import { prisma } from '@/shared/lib/prisma';
import { VisaStatus } from '@/generated/prisma/client';
import { isVisaStatus, visaRequiresExpiry } from '@/shared/constants/visa-status';
import { isKnownIndustry } from '@/shared/constants/sector-keywords';
import { isKnownOccupation } from '@/shared/occupations/registry';
import { isSeniorityValue } from '@/shared/constants/occupation-options';
import { checkCapability } from '@/shared/entitlements/server';
import { suggestCareerTrackLabel } from '@/shared/occupations/track-label';

/**
 * Server actions for the goal-led onboarding journey.
 *
 * Narrower than the Profile Management actions on purpose: onboarding writes a
 * small, well-defined slice (a draft profile, its direction, and the eligibility
 * basics an early action needs) and should not be able to touch anything else.
 */

async function requireUserId(): Promise<string> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new Error('Not authenticated');
  return session.user.id;
}

/**
 * Create a Career Profile with the minimum the database actually requires.
 *
 * A draft needs an owner and nothing else — the label has a default and every
 * other column is nullable. Demanding a complete profile before one can exist is
 * what forced the old wizard to make six fields mandatory before a new user
 * could do anything, and it is not a real constraint.
 *
 * The plan's profile limit IS real and is checked here rather than by hiding the
 * button, so it holds even when the client is bypassed.
 */
export async function createDraftCareerProfile(suggestedLabel?: string) {
  const userId = await requireUserId();

  const existing = await prisma.profile.count({ where: { userId } });
  const decision = await checkCapability(userId, 'additional_career_profiles');
  if (!decision.allowed) {
    return {
      ok: false as const,
      error: `Your plan includes ${decision.limit} Career Profile${decision.limit === 1 ? '' : 's'}.`,
      decision,
    };
  }

  // `[userId, label]` is unique, so a default name is suffixed rather than
  // allowed to collide — a failed insert here would strand the whole journey.
  const base = suggestedLabel?.trim() || 'My Career Profile';
  const taken = new Set(
    (await prisma.profile.findMany({ where: { userId }, select: { label: true } })).map((row) => row.label)
  );
  let label = base;
  for (let suffix = 2; taken.has(label); suffix += 1) label = `${base} ${suffix}`;

  const created = await prisma.profile.create({
    data: { userId, label, isDefault: existing === 0 },
    select: { id: true, label: true },
  });

  revalidatePath('/dashboard');
  return { ok: true as const, profileId: created.id, label: created.label };
}

export interface CareerDirectionInput {
  profileId: string;
  /** The user's own words for the role they are targeting. Required. */
  targetRoleTitle: string;
  /** This track's name. Suggested from the role when left blank. */
  label: string;
  /** Shared identity — collected once, not per profile. */
  fullName: string;
  targetOccupation?: string;
  targetSeniority?: string;
  targetIndustry?: string;
  tagline?: string;
}

/**
 * Save what a Career Profile is FOR, plus the one shared identity field a CV
 * cannot do without.
 *
 * Only two things are required: a name and a target role. Everything else on
 * this screen is optional and can be filled in later — and inferred values are
 * only persisted when the user has confirmed them, which is why they arrive as
 * ordinary form fields rather than being written behind the scenes.
 */
export async function saveCareerDirection(input: CareerDirectionInput) {
  const userId = await requireUserId();

  const fullName = input.fullName.trim();
  const targetRoleTitle = input.targetRoleTitle.trim();
  if (!fullName) return { ok: false as const, error: 'Enter your name.' };
  if (!targetRoleTitle) return { ok: false as const, error: 'Enter the role you are targeting.' };

  const owned = await prisma.profile.findFirst({
    where: { id: input.profileId, userId },
    select: { id: true },
  });
  if (!owned) return { ok: false as const, error: 'Profile not found.' };

  const suggested =
    input.label.trim() ||
    suggestCareerTrackLabel({
      occupation: input.targetOccupation ?? '',
      targetRoleTitle,
      industry: input.targetIndustry ?? '',
    });
  const clash = suggested
    ? await prisma.profile.findFirst({
        where: { userId, label: suggested, NOT: { id: owned.id } },
        select: { id: true },
      })
    : null;

  await prisma.$transaction([
    // Identity is shared across every Career Profile, so the name is written
    // once here rather than duplicated into each track.
    prisma.profileIdentity.upsert({
      where: { userId },
      create: { userId, fullName },
      update: { fullName },
    }),
    prisma.profile.update({
      where: { id: owned.id },
      data: {
        ...(suggested && !clash ? { label: suggested } : {}),
        targetRoleTitle,
        // Ontology values only persist when they name something the engine has;
        // anything else is discarded rather than stored as a broken reference.
        targetOccupation: isKnownOccupation(input.targetOccupation) ? input.targetOccupation! : null,
        targetSeniority: isSeniorityValue(input.targetSeniority ?? '') ? input.targetSeniority! : null,
        targetIndustry: isKnownIndustry(input.targetIndustry?.trim() ?? '')
          ? input.targetIndustry!.trim()
          : null,
        tagline: input.tagline?.trim() || null,
      },
    }),
  ]);

  revalidatePath('/dashboard');
  return { ok: true as const };
}

export interface EligibilityBasicsInput {
  country: string;
  city: string;
  visaStatus: string;
  visaExpiry: string;
}

/**
 * The smallest set of eligibility facts an early action can genuinely use.
 *
 * Deliberately not everything the product could ask: security clearance,
 * five-year residency history, driving licences and occupation-specific
 * regulatory detail are all collected at the point a job actually requires them,
 * because asking for them at sign-up is how a first run becomes a form-filling
 * exercise nobody finishes.
 *
 * The one conditional rule is kept: a time-limited visa status without its
 * expiry is an incomplete fact, so it is rejected rather than half-stored.
 */
export async function saveEligibilityBasics(input: EligibilityBasicsInput) {
  const userId = await requireUserId();

  const visaStatus = isVisaStatus(input.visaStatus) ? (input.visaStatus as VisaStatus) : null;
  if (input.visaStatus && !visaStatus) {
    return { ok: false as const, error: 'Choose a work authorisation status from the list.' };
  }
  if (visaStatus && visaRequiresExpiry(visaStatus) && !input.visaExpiry.trim()) {
    return { ok: false as const, error: 'Add the expiry date for this visa status.' };
  }

  const identity = {
    country: input.country.trim() || null,
    city: input.city.trim() || null,
    visaStatus,
    // A permanent status never carries an expiry, so one is never stored for it.
    visaExpiry:
      visaStatus && visaRequiresExpiry(visaStatus) && input.visaExpiry
        ? new Date(input.visaExpiry)
        : null,
  };

  await prisma.profileIdentity.upsert({
    where: { userId },
    // `fullName` is NOT NULL and this screen does not collect it; an empty
    // string is only ever used to create a row that the career-direction step
    // has not already made, and it never overwrites a name that exists.
    create: { userId, fullName: '', ...identity },
    update: identity,
  });

  revalidatePath('/dashboard');
  return { ok: true as const };
}
