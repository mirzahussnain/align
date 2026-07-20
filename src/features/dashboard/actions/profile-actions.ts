'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { auth } from '@/shared/lib/auth';
import { prisma } from '@/shared/lib/prisma';
import { VisaStatus, type EmploymentType } from '../../../generated/prisma/client';
import { isVisaStatus, visaRequiresExpiry } from '@/shared/constants/visa-status';
import { EMPLOYMENT_TYPES } from '@/shared/constants/employment-type';
import { isKnownIndustry } from '@/shared/constants/sector-keywords';
import { isKnownOccupation } from '@/shared/occupations/registry';
import { isSeniorityValue } from '@/shared/constants/occupation-options';
import { entitlementsFor } from '@/shared/lib/entitlements';

async function requireUserId(): Promise<string> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new Error('Not authenticated');
  return session.user.id;
}

export interface PersonalInfoInput {
  fullName: string;
  tagline: string;
  professionalSummary: string;
  /** OccupationId, or '' for unset. Validated server-side against the registry. */
  targetOccupation: string;
  /** The user's own words for their target role, e.g. "Warehouse Administrator". */
  targetRoleTitle: string;
  /** entry | mid | senior | lead, or '' for unset. */
  targetSeniority: string;
  email: string;
  phoneDialCode: string;
  phoneNumber: string;
  phoneCountry: string;
  city: string;
  state: string;
  country: string;
  website: string;
  linkedin: string;
  github: string;
  visaStatus: string;
  visaExpiry: string;
}

/**
 * Personal info spans both tables: identity (name, contact, visa) is shared
 * across every profile, while the tagline and summary are per career track —
 * a warehouse profile and a software profile need different pitches.
 */
export async function savePersonalInfo(input: PersonalInfoInput, profileId?: string) {
  const userId = await requireUserId();

  const visaStatus =
    input.visaStatus && isVisaStatus(input.visaStatus) ? (input.visaStatus as VisaStatus) : null;
  // Only keep an expiry for a temporary status — permanent statuses never carry one.
  const visaExpiry =
    visaStatus && visaRequiresExpiry(visaStatus) && input.visaExpiry
      ? new Date(input.visaExpiry)
      : null;

  const identity = {
    fullName: input.fullName.trim(),
    email: input.email.trim() || null,
    phoneDialCode: input.phoneDialCode.trim() || null,
    phoneNumber: input.phoneNumber.trim() || null,
    phoneCountry: input.phoneCountry.trim() || null,
    city: input.city.trim() || null,
    state: input.state.trim() || null,
    country: input.country.trim() || null,
    website: input.website.trim() || null,
    linkedin: input.linkedin.trim() || null,
    github: input.github.trim() || null,
    visaStatus,
    visaExpiry,
  };

  const trackData = {
    tagline: input.tagline.trim() || null,
    professionalSummary: input.professionalSummary.trim() || null,
    // Server actions are public endpoints: the ontology fields only persist
    // when they name something the engine actually has, everything else nulls.
    targetOccupation: isKnownOccupation(input.targetOccupation) ? input.targetOccupation : null,
    targetRoleTitle: input.targetRoleTitle.trim() || null,
    targetSeniority: isSeniorityValue(input.targetSeniority) ? input.targetSeniority : null,
  };

  const resolvedProfileId = await resolveOwnedProfileId(userId, profileId);

  await prisma.$transaction([
    prisma.profileIdentity.upsert({
      where: { userId },
      create: { userId, ...identity },
      update: identity,
    }),
    prisma.profile.update({ where: { id: resolvedProfileId }, data: trackData }),
  ]);

  revalidatePath('/dashboard');
  return { ok: true as const };
}

/**
 * Stamp the user as having been through onboarding, so the dashboard layout
 * stops redirecting them back to `/onboarding`. Idempotent — safe to call on
 * "finish" or on "skip the rest".
 */
export async function completeOnboarding() {
  const userId = await requireUserId();
  await prisma.user.update({
    where: { id: userId },
    data: { onboardedAt: new Date() },
  });
  revalidatePath('/dashboard');
  return { ok: true as const };
}

/**
 * Resolve the profile a write should land in, creating the user's first one if
 * they have none.
 *
 * SECURITY: `profileId` arrives from the client, so it is only honoured after
 * confirming the row belongs to this user. Without that check, passing another
 * user's profile id would write into their profile. An unowned or unknown id
 * falls back to the caller's own default rather than throwing, so a stale id in
 * a client store degrades gracefully instead of breaking the form.
 */
async function resolveOwnedProfileId(userId: string, profileId?: string): Promise<string> {
  if (profileId) {
    const owned = await prisma.profile.findFirst({
      where: { id: profileId, userId },
      select: { id: true },
    });
    if (owned) return owned.id;
  }

  const fallback = await prisma.profile.findFirst({
    where: { userId },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    select: { id: true },
  });
  if (fallback) return fallback.id;

  const created = await prisma.profile.create({
    data: { userId, label: 'Default', isDefault: true },
    select: { id: true },
  });
  return created.id;
}

export interface ExperienceInput {
  jobTitle: string;
  company: string;
  location: string;
  /** An `EmploymentType` enum member, or '' for unset. */
  type: string;
  /** `YYYY-MM`. */
  startDate: string;
  /** `YYYY-MM`, or '' when `current` is set. */
  endDate: string;
  current: boolean;
  achievements: string[];
}

/**
 * Coerce a form-supplied employment type to something the enum column accepts.
 *
 * The `<select>` can only offer valid members, but a server action is a public
 * endpoint — anything at all can be posted to it, and an unrecognised string
 * would fail the insert for the whole transaction. Unknown values become null.
 */
function toEmploymentType(value: string): EmploymentType | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return EMPLOYMENT_TYPES.some((t) => t.value === trimmed) ? (trimmed as EmploymentType) : null;
}

/**
 * Normalise a start/end pair before it is stored.
 *
 * `current` is authoritative: it always clears the end date, so an ongoing row
 * can never keep a stale one. A row whose end precedes its start has the end
 * dropped rather than the save rejected — the inputs already constrain this,
 * so reaching here means a hand-crafted request, and a silently sane row beats
 * a 500 in the middle of a multi-row transaction.
 */
function normaliseRange(startDate: string, endDate: string, current: boolean) {
  const start = startDate?.trim() || null;
  const end = current ? null : endDate?.trim() || null;
  // ISO `YYYY-MM` compares correctly as plain strings — no parsing needed.
  if (start && end && end < start) return { start, end: null, current };
  return { start, end, current };
}

export async function saveExperience(rows: ExperienceInput[], targetProfileId?: string) {
  const userId = await requireUserId();
  const profileId = await resolveOwnedProfileId(userId, targetProfileId);

  await prisma.$transaction([
    prisma.experience.deleteMany({ where: { profileId } }),
    ...rows
      // startDate is required by the column, so a row without one would abort
      // the whole transaction. Dropping it matches how blank rows are already
      // handled rather than failing the user's entire save.
      .filter((r) => (r.jobTitle.trim() || r.company.trim()) && r.startDate?.trim())
      .map((r, i) => {
        const { start, end, current } = normaliseRange(r.startDate, r.endDate, r.current);
        return prisma.experience.create({
          data: {
            profileId,
            jobTitle: r.jobTitle.trim(),
            company: r.company.trim(),
            location: r.location.trim() || null,
            type: toEmploymentType(r.type),
            startDate: start as string,
            endDate: end,
            current,
            achievements: r.achievements.map((a) => a.trim()).filter(Boolean),
            sortOrder: i,
          },
        });
      }),
  ]);

  revalidatePath('/dashboard');
  return { ok: true as const };
}

export interface ProjectInput {
  name: string;
  stack: string;
  startDate: string;
  endDate: string;
  achievements: string[];
}

export async function saveProjects(rows: ProjectInput[], targetProfileId?: string) {
  const userId = await requireUserId();
  const profileId = await resolveOwnedProfileId(userId, targetProfileId);

  await prisma.$transaction([
    prisma.projectEntry.deleteMany({ where: { profileId } }),
    ...rows
      .filter((r) => r.name.trim())
      .map((r, i) =>
        prisma.projectEntry.create({
          data: {
            profileId,
            name: r.name.trim(),
            stack: r.stack.trim() || null,
            startDate: r.startDate.trim() || null,
            endDate: r.endDate.trim() || null,
            achievements: r.achievements.map((a) => a.trim()).filter(Boolean),
            sortOrder: i,
          },
        })
      ),
  ]);

  revalidatePath('/dashboard');
  return { ok: true as const };
}

export interface EducationInput {
  degree: string;
  university: string;
  /** `YYYY-MM`. */
  startDate: string;
  /** `YYYY-MM`, or '' when `current` is set. */
  endDate: string;
  current: boolean;
  grade: string;
  description: string;
}

export async function saveEducation(rows: EducationInput[], targetProfileId?: string) {
  const userId = await requireUserId();
  const profileId = await resolveOwnedProfileId(userId, targetProfileId);

  await prisma.$transaction([
    prisma.education.deleteMany({ where: { profileId } }),
    ...rows
      // As with experience: startDate is now a required column, so a row
      // lacking one is dropped rather than aborting the transaction.
      .filter((r) => (r.degree.trim() || r.university.trim()) && r.startDate?.trim())
      .map((r, i) => {
        const { start, end, current } = normaliseRange(r.startDate, r.endDate, r.current);
        return prisma.education.create({
          data: {
            profileId,
            degree: r.degree.trim(),
            university: r.university.trim(),
            startDate: start as string,
            endDate: end,
            current,
            grade: r.grade.trim() || null,
            description: r.description.trim() || null,
            sortOrder: i,
          },
        });
      }),
  ]);

  revalidatePath('/dashboard');
  return { ok: true as const };
}

export interface SkillGroupInput {
  category: string;
  skills: string[];
}

export async function saveSkills(rows: SkillGroupInput[], targetProfileId?: string) {
  const userId = await requireUserId();
  const profileId = await resolveOwnedProfileId(userId, targetProfileId);

  await prisma.$transaction([
    prisma.skillGroup.deleteMany({ where: { profileId } }),
    ...rows
      .filter((r) => r.category.trim() && r.skills.some((s) => s.trim()))
      .map((r, i) =>
        prisma.skillGroup.create({
          data: {
            profileId,
            category: r.category.trim(),
            skills: r.skills.map((s) => s.trim()).filter(Boolean),
            sortOrder: i,
          },
        })
      ),
  ]);

  revalidatePath('/dashboard');
  return { ok: true as const };
}

// ── Career-track profile management ──────────────────────────────────────────

async function requireUser(): Promise<{ id: string; subscriptionTier: string | null }> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new Error('Not authenticated');
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, subscriptionTier: true },
  });
  if (!user) throw new Error('Not authenticated');
  return user;
}

/**
 * Add a career track. The tier cap is enforced server-side rather than by
 * hiding the button, so the limit holds even if the client is bypassed.
 */
export async function createProfile(label: string, targetIndustry?: string, targetOccupation?: string) {
  const user = await requireUser();
  const { maxProfiles } = entitlementsFor(user.subscriptionTier);

  const trimmed = label.trim();
  if (!trimmed) return { ok: false as const, error: 'Give the profile a name.' };

  const existing = await prisma.profile.count({ where: { userId: user.id } });
  if (existing >= maxProfiles) {
    return {
      ok: false as const,
      error: `Your plan allows ${maxProfiles} profile${maxProfiles === 1 ? '' : 's'}. Upgrade to add more.`,
    };
  }

  // The [userId, label] unique index is what actually guarantees uniqueness;
  // this check exists to return a readable message instead of a Prisma error.
  const clash = await prisma.profile.findFirst({
    where: { userId: user.id, label: trimmed },
    select: { id: true },
  });
  if (clash) return { ok: false as const, error: `You already have a profile called "${trimmed}".` };

  const created = await prisma.profile.create({
    data: {
      userId: user.id,
      label: trimmed,
      targetIndustry: isKnownIndustry(targetIndustry?.trim()) ? targetIndustry!.trim() : null,
      targetOccupation: isKnownOccupation(targetOccupation) ? targetOccupation : null,
      // First profile a user ever creates becomes their default.
      isDefault: existing === 0,
    },
    select: { id: true },
  });

  revalidatePath('/dashboard');
  return { ok: true as const, profileId: created.id };
}

export async function renameProfile(profileId: string, label: string, targetIndustry?: string) {
  const userId = await requireUserId();
  const trimmed = label.trim();
  if (!trimmed) return { ok: false as const, error: 'Give the profile a name.' };

  // Scoping the update by userId is what prevents renaming someone else's profile.
  const { count } = await prisma.profile.updateMany({
    where: { id: profileId, userId },
    data: { label: trimmed, targetIndustry: targetIndustry?.trim() || null },
  });
  if (count === 0) return { ok: false as const, error: 'Profile not found.' };

  revalidatePath('/dashboard');
  return { ok: true as const };
}

/**
 * Delete a career track and everything in it. The last remaining profile can't
 * be deleted — a user with zero profiles has nowhere for profile writes to land.
 */
export async function deleteProfile(profileId: string) {
  const userId = await requireUserId();

  const profiles = await prisma.profile.findMany({
    where: { userId },
    select: { id: true, isDefault: true },
    orderBy: { createdAt: 'asc' },
  });

  const target = profiles.find((p) => p.id === profileId);
  if (!target) return { ok: false as const, error: 'Profile not found.' };
  if (profiles.length <= 1) {
    return { ok: false as const, error: 'You need at least one profile.' };
  }

  await prisma.profile.delete({ where: { id: profileId } });

  // Deleting the default would leave the user with none — promote the oldest
  // survivor so `isDefault` always resolves to exactly one profile.
  if (target.isDefault) {
    const next = profiles.find((p) => p.id !== profileId);
    if (next) {
      await prisma.profile.update({ where: { id: next.id }, data: { isDefault: true } });
    }
  }

  revalidatePath('/dashboard');
  return { ok: true as const };
}

export async function setDefaultProfile(profileId: string) {
  const userId = await requireUserId();

  const owned = await prisma.profile.findFirst({
    where: { id: profileId, userId },
    select: { id: true },
  });
  if (!owned) return { ok: false as const, error: 'Profile not found.' };

  // Clearing every flag before setting one keeps "exactly one default" true
  // even if a previous partial write left two set.
  await prisma.$transaction([
    prisma.profile.updateMany({ where: { userId }, data: { isDefault: false } }),
    prisma.profile.update({ where: { id: profileId }, data: { isDefault: true } }),
  ]);

  revalidatePath('/dashboard');
  return { ok: true as const };
}
