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
import { checkCapability } from '@/shared/entitlements/server';
import { createCanonicalEvidence, validateStructuredEvidence } from '@/shared/services/structured-evidence';
import { isProfileDate, isProfileDateBefore } from '@/shared/utils/date';
import { cleanSkillDisplayName, normaliseSkillName } from '@/shared/utils/skill-normalization';
import { searchLocalSkillTaxonomy, skillTaxonomySearchLimits } from '@/shared/services/skill-taxonomy';

async function requireUserId(): Promise<string> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new Error('Not authenticated');
  return session.user.id;
}

export interface PersonalInfoInput {
  /** This career track's own name, e.g. "Software Engineering" — never the account holder's name. */
  label: string;
  fullName: string;
  tagline: string;
  professionalSummary: string;
  /** OccupationId, or '' for unset. Validated server-side against the registry. */
  targetOccupation: string;
  /** The user's own words for their target role, e.g. "Warehouse Administrator". */
  targetRoleTitle: string;
  /** entry | mid | senior | lead, or '' for unset. */
  targetSeniority: string;
  /** Sector id, or '' for unset — feeds keyword vocabulary and the classifier's sector override. */
  targetIndustry: string;
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

  const resolvedProfileId = await resolveOwnedProfileId(userId, profileId);

  // [userId, label] is unique. A collision is rare (it needs two of the same
  // user's own tracks to end up with the same name) and shouldn't fail the
  // whole save — the rename is just skipped, leaving the existing label in
  // place, rather than the entire form erroring out over one field.
  const trimmedLabel = input.label.trim();
  const labelTaken = trimmedLabel
    ? Boolean(
        await prisma.profile.findFirst({
          where: { userId, label: trimmedLabel, NOT: { id: resolvedProfileId } },
          select: { id: true },
        })
      )
    : false;

  const trackData = {
    ...(trimmedLabel && !labelTaken ? { label: trimmedLabel } : {}),
    tagline: input.tagline.trim() || null,
    professionalSummary: input.professionalSummary.trim() || null,
    // Server actions are public endpoints: the ontology fields only persist
    // when they name something the engine actually has, everything else nulls.
    targetOccupation: isKnownOccupation(input.targetOccupation) ? input.targetOccupation : null,
    targetRoleTitle: input.targetRoleTitle.trim() || null,
    targetSeniority: isSeniorityValue(input.targetSeniority) ? input.targetSeniority : null,
    targetIndustry: isKnownIndustry(input.targetIndustry) ? input.targetIndustry : null,
  };

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
  /** `YYYY` or `YYYY-MM`. */
  startDate: string;
  /** `YYYY` or `YYYY-MM`, or '' when `current` is set. */
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
function normaliseRange(startDate: string, endDate: string, current: boolean, allowFutureEnd = false): { error: string } | { start: string | null; end: string | null; current: boolean } {
  const start = startDate?.trim() || null;
  const end = current ? null : endDate?.trim() || null;
  if ((start && !isProfileDate(start)) || (end && !isProfileDate(end))) {
    return { error: 'Use YYYY or YYYY-MM for dates.' };
  }
  const currentMonth = new Date().toISOString().slice(0, 7);
  if (start && start > currentMonth) return { error: 'Start date cannot be in the future.' };
  if (end && !allowFutureEnd && end > currentMonth) return { error: 'End date cannot be in the future.' };
  if (start && end && isProfileDateBefore(end, start)) {
    return { error: 'End date cannot be before start date.' };
  }
  return { start, end, current };
}

// Experience, project, education, and skill writes go through the record-level
// actions below (one stable id per record). The former bulk `save*` actions
// were replaced by those and carried the old strict validators; removed so a
// single canonical validation path remains per record type.

export interface EducationInput {
  degree: string;
  university: string;
  /** `YYYY-MM`, optional — a qualification without a date is still valid. */
  startDate: string;
  /** `YYYY` or `YYYY-MM`, or '' when `current` is set. */
  endDate: string;
  current: boolean;
  grade: string;
  description: string;
}

// ── Career-track profile management ──────────────────────────────────────────

export type ManagedEvidenceKind = 'training' | 'licence' | 'registration' | 'language' | 'volunteering' | 'other' | 'certification';
export interface ManagedEvidenceInput { kind: ManagedEvidenceKind; id?: string; details: unknown; }

async function requireOwnedEvidenceProfile(userId: string, profileId?: string): Promise<string> {
  if (profileId) {
    const owned = await prisma.profile.findFirst({ where: { id: profileId, userId }, select: { id: true } });
    if (!owned) throw new Error('Profile not found.');
    return owned.id;
  }
  return resolveOwnedProfileId(userId);
}
function evidenceText(details: Record<string, unknown>, key: string) { return String(details[key] ?? '').trim() || null; }
function evidenceList(details: Record<string, unknown>, key: string) { return Array.isArray(details[key]) ? details[key].map(String) : []; }

/** Profile Management writes the same canonical records HITL creates. */
export async function saveManagedEvidence(input: ManagedEvidenceInput, targetProfileId?: string) {
  const userId = await requireUserId(); const profileId = await requireOwnedEvidenceProfile(userId, targetProfileId);
  let parsed; try { parsed = validateStructuredEvidence(input.kind, input.details); } catch (error) { return { ok: false as const, error: error instanceof Error ? error.message : 'Invalid evidence details.' }; }
  if (!input.id) {
    const blocked = await evidenceCreationBlocked(userId); if (blocked) return blocked;
    try { const ref = await createCanonicalEvidence(profileId, parsed.kind, parsed.details); revalidatePath('/dashboard'); return { ok: true as const, id: ref.id }; } catch (error) { return { ok: false as const, error: error instanceof Error ? error.message : 'Unable to save evidence.' }; }
  }
  const d = parsed.details as Record<string, unknown>; const text = (key: string) => evidenceText(d, key); const list = (key: string) => evidenceList(d, key); let count = 0;
  if (parsed.kind === 'training') count = (await prisma.training.updateMany({ where: { id: input.id, profileId }, data: { course: text('course')!, provider: text('provider'), field: text('field'), status: text('status'), startDate: text('startDate'), endDate: text('endDate'), result: text('result') } })).count;
  else if (parsed.kind === 'licence') count = (await prisma.licence.updateMany({ where: { id: input.id, profileId }, data: { officialName: text('officialName')!, issuingBody: text('issuingBody'), issueDate: text('issueDate'), expiryDate: text('expiryDate'), credentialNumber: text('credentialNumber'), status: text('status'), verificationUrl: text('verificationUrl'), verificationStatus: text('verificationStatus') } })).count;
  else if (parsed.kind === 'registration') count = (await prisma.professionalRegistration.updateMany({ where: { id: input.id, profileId }, data: { officialName: text('officialName')!, issuingBody: text('issuingBody')!, issueDate: text('issueDate'), expiryDate: text('expiryDate'), registrationNumber: text('credentialNumber'), status: text('status'), verificationUrl: text('verificationUrl'), verificationStatus: text('verificationStatus') } })).count;
  else if (parsed.kind === 'language') count = (await prisma.language.updateMany({ where: { id: input.id, profileId }, data: { language: text('language')!, speaking: text('speaking'), reading: text('reading'), writing: text('writing'), professionalUseContext: text('professionalUseContext'), formalTest: text('formalTest') } })).count;
  else if (parsed.kind === 'volunteering') count = (await prisma.volunteering.updateMany({ where: { id: input.id, profileId }, data: { organisation: text('organisation')!, role: text('role')!, startDate: text('startDate'), endDate: text('endDate'), contribution: text('contribution'), skillsTools: list('skillsTools'), outcome: text('outcome') } })).count;
  else if (parsed.kind === 'other') count = (await prisma.otherEvidence.updateMany({ where: { id: input.id, profileId }, data: { title: text('title')!, context: text('context'), description: text('description')!, period: text('period'), outcome: text('outcome') } })).count;
  else if (parsed.kind === 'certification') count = (await prisma.certification.updateMany({ where: { id: input.id, profileId }, data: { name: text('officialName')!, issuer: text('issuingBody'), year: text('issueDate'), issueDate: text('issueDate'), expiryDate: text('expiryDate'), credentialNumber: text('credentialNumber'), status: text('status'), verificationUrl: text('verificationUrl'), verificationStatus: text('verificationStatus') } })).count;
  if (!count) return { ok: false as const, error: 'Evidence not found in this profile.' }; revalidatePath('/dashboard'); return { ok: true as const, id: input.id };
}

/** Never remaps prior approvals: generation re-resolves deleted ids and rejects stale ones. */
export async function deleteManagedEvidence(kind: ManagedEvidenceKind, id: string, targetProfileId?: string) {
  const userId = await requireUserId(); const profileId = await requireOwnedEvidenceProfile(userId, targetProfileId); const approvedCvCount = await prisma.generatedCV.count({ where: { profileId } }); let count = 0;
  if (kind === 'training') count = (await prisma.training.deleteMany({ where: { id, profileId } })).count;
  else if (kind === 'licence') count = (await prisma.licence.deleteMany({ where: { id, profileId } })).count;
  else if (kind === 'registration') count = (await prisma.professionalRegistration.deleteMany({ where: { id, profileId } })).count;
  else if (kind === 'language') count = (await prisma.language.deleteMany({ where: { id, profileId } })).count;
  else if (kind === 'volunteering') count = (await prisma.volunteering.deleteMany({ where: { id, profileId } })).count;
  else if (kind === 'other') count = (await prisma.otherEvidence.deleteMany({ where: { id, profileId } })).count;
  else count = (await prisma.certification.deleteMany({ where: { id, profileId } })).count;
  if (!count) return { ok: false as const, error: 'Evidence not found in this profile.' }; revalidatePath('/dashboard'); return { ok: true as const, mayHaveStaleApprovals: approvedCvCount > 0 };
}
async function requireUser(): Promise<{ id: string }> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new Error('Not authenticated');
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true },
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

  const trimmed = label.trim();
  if (!trimmed) return { ok: false as const, error: 'Give the profile a name.' };

  const decision = await checkCapability(user.id, 'additional_career_profiles');
  const existing = await prisma.profile.count({ where: { userId: user.id } });
  if (!decision.allowed) {
    return {
      ok: false as const,
      error: `Your plan allows ${decision.limit} profile${decision.limit === 1 ? '' : 's'}. Upgrade to add more.`,
      decision,
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
export interface ExperienceRecordInput extends ExperienceInput { id?: string; }
export interface ProjectRecordInput { id?: string; name: string; skillIds?: string[]; liveUrl?: string; repositoryUrl?: string; startDate: string; endDate: string; achievements: string[]; }
export interface InlineProjectSkillInput { name: string; category: string; level: string; taxonomyTermId?: string; }
export interface EducationRecordInput extends EducationInput { id?: string; }
export interface SkillRecordInput { id?: string; category: string; name: string; level: string; contextType: string; activity: string; period: string; outcome: string; taxonomyTermId?: string; }
async function evidenceDeleteWarning(profileId: string) { return (await prisma.generatedCV.count({ where: { profileId } })) > 0; }
function recordError(message: string) { return { ok: false as const, error: message }; }
async function evidenceCreationBlocked(userId: string) {
  const decision = await checkCapability(userId, 'profile_evidence_storage');
  return decision.allowed
    ? null
    : {
        ok: false as const,
        error: `Your plan allows ${decision.limit} stored evidence records. Editing and deleting existing evidence remain available.`,
        decision,
      };
}
export async function saveExperienceRecord(input: ExperienceRecordInput, targetProfileId?: string) { const userId = await requireUserId(); const profileId = await requireOwnedEvidenceProfile(userId, targetProfileId); if (!input.jobTitle.trim() || !input.company.trim() || !input.startDate.trim()) return recordError('Job title, company, and start date are required.'); const range = normaliseRange(input.startDate, input.endDate, input.current); if ('error' in range) return recordError(range.error); const { start, end, current } = range; const data = { jobTitle: input.jobTitle.trim(), company: input.company.trim(), location: input.location.trim() || null, type: toEmploymentType(input.type), startDate: start!, endDate: end, current, achievements: input.achievements.map((value) => value.trim()).filter(Boolean) }; if (input.id) { const updated = await prisma.experience.updateMany({ where: { id: input.id, profileId }, data }); if (!updated.count) return recordError('Experience record not found in this profile.'); revalidatePath('/dashboard'); return { ok: true as const, id: input.id }; } const blocked = await evidenceCreationBlocked(userId); if (blocked) return blocked; const created = await prisma.experience.create({ data: { profileId, ...data, sortOrder: await prisma.experience.count({ where: { profileId } }) }, select: { id: true } }); revalidatePath('/dashboard'); return { ok: true as const, id: created.id }; }
export async function deleteExperienceRecord(id: string, targetProfileId?: string) { const userId = await requireUserId(); const profileId = await requireOwnedEvidenceProfile(userId, targetProfileId); const warning = await evidenceDeleteWarning(profileId); const deleted = await prisma.experience.deleteMany({ where: { id, profileId } }); if (!deleted.count) return recordError('Experience record not found in this profile.'); revalidatePath('/dashboard'); return { ok: true as const, mayHaveStaleApprovals: warning }; }
function normaliseHttpUrl(value: string, label: string): string | null | { error: string } {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return { error: `${label} must use http:// or https://.` };
    return trimmed;
  } catch { return { error: `${label} must be a valid URL.` }; }
}

async function ownedProjectSkills(profileId: string, skillIds: string[]) {
  const unique = [...new Set(skillIds.filter(Boolean))];
  if (unique.length !== skillIds.filter(Boolean).length) return { error: 'A project skill can only be selected once.' } as const;
  const skills = await prisma.skill.findMany({ where: { id: { in: unique }, profileId }, select: { id: true } });
  return skills.length === unique.length ? { ids: unique } as const : { error: 'One or more selected skills do not belong to this profile.' } as const;
}

export async function saveProjectRecord(input: ProjectRecordInput, targetProfileId?: string) {
  const userId = await requireUserId(); const profileId = await requireOwnedEvidenceProfile(userId, targetProfileId);
  if (!input.name.trim() || !input.achievements.some((value) => value.trim())) return recordError('Project name and at least one project evidence or achievement line are required.');
  const range = normaliseRange(input.startDate, input.endDate, false, true); if ('error' in range) return recordError(range.error);
  const liveUrl = normaliseHttpUrl(input.liveUrl ?? '', 'Live project URL'); if (liveUrl && typeof liveUrl === 'object') return recordError(liveUrl.error);
  const repositoryUrl = normaliseHttpUrl(input.repositoryUrl ?? '', 'Repository URL'); if (repositoryUrl && typeof repositoryUrl === 'object') return recordError(repositoryUrl.error);
  const selected = await ownedProjectSkills(profileId, input.skillIds ?? []); if ('error' in selected) return recordError(String(selected.error));
  const selectedIds: string[] = selected.ids ?? [];
  const data = { name: input.name.trim(), liveUrl, repositoryUrl, startDate: range.start, endDate: range.end, achievements: input.achievements.map((value) => value.trim()).filter(Boolean) };
  if (input.id) {
    const updated = await prisma.projectEntry.updateMany({ where: { id: input.id, profileId }, data }); if (!updated.count) return recordError('Project not found in this profile.');
    await prisma.projectSkill.deleteMany({ where: { projectId: input.id } });
    if (selectedIds.length) await prisma.projectSkill.createMany({ data: selectedIds.map((skillId, sortOrder) => ({ projectId: input.id!, skillId, sortOrder })) });
    revalidatePath('/dashboard'); return { ok: true as const, id: input.id };
  }
  const blocked = await evidenceCreationBlocked(userId); if (blocked) return blocked;
  const created = await prisma.projectEntry.create({ data: { profileId, ...data, sortOrder: await prisma.projectEntry.count({ where: { profileId } }), projectSkills: { create: selectedIds.map((skillId, sortOrder) => ({ skillId, sortOrder })) } }, select: { id: true } });
  revalidatePath('/dashboard'); return { ok: true as const, id: created.id };
}

export async function createProjectSkill(input: InlineProjectSkillInput, targetProfileId?: string) {
  const userId = await requireUserId(); const profileId = await requireOwnedEvidenceProfile(userId, targetProfileId); const name = cleanSkillDisplayName(input.name);
  if (!name) return recordError('Skill name is required.');
  const blocked = await evidenceCreationBlocked(userId); if (blocked) return blocked;
  const skills = await prisma.skill.findMany({ where: { profileId }, select: { id: true, name: true } });
  const existing = skills.find((skill) => normaliseSkillName(skill.name) === normaliseSkillName(name));
  if (existing) return recordError(`This skill already exists in this profile: ${existing.name}. Select it instead.`);
  const category = input.category.trim();
  const group = category ? ((await prisma.skillGroup.findFirst({ where: { profileId, category }, select: { id: true } })) ?? await prisma.skillGroup.create({ data: { profileId, category, sortOrder: await prisma.skillGroup.count({ where: { profileId } }) }, select: { id: true } })) : null;
  const taxonomyTermId = input.taxonomyTermId?.trim() || null;
  if (taxonomyTermId && !(await prisma.skillTaxonomyTerm.findUnique({ where: { id: taxonomyTermId }, select: { id: true } }))) return recordError('Selected skill suggestion is no longer available.');
  const created = await prisma.skill.create({ data: { profileId, skillGroupId: group?.id ?? null, name, normalizedName: normaliseSkillName(name), taxonomyTermId, level: input.level.trim() || null, sortOrder: await prisma.skill.count({ where: { profileId } }) }, select: { id: true, name: true, level: true, skillGroup: { select: { category: true } } } });
  revalidatePath('/dashboard'); return { ok: true as const, skill: { id: created.id, name: created.name, level: created.level ?? '', category: created.skillGroup?.category ?? '' } };
}
export async function deleteProjectRecord(id: string, targetProfileId?: string) { const userId = await requireUserId(); const profileId = await requireOwnedEvidenceProfile(userId, targetProfileId); const warning = await evidenceDeleteWarning(profileId); const deleted = await prisma.projectEntry.deleteMany({ where: { id, profileId } }); if (!deleted.count) return recordError('Project not found in this profile.'); revalidatePath('/dashboard'); return { ok: true as const, mayHaveStaleApprovals: warning }; }
export async function saveEducationRecord(input: EducationRecordInput, targetProfileId?: string) { const userId = await requireUserId(); const profileId = await requireOwnedEvidenceProfile(userId, targetProfileId); if (!input.degree.trim() || !input.university.trim()) return recordError('Qualification and institution are required.'); const range = normaliseRange(input.startDate, input.endDate, input.current); if ('error' in range) return recordError(range.error); const { start, end, current } = range; const data = { degree: input.degree.trim(), university: input.university.trim(), startDate: start, endDate: end, current, grade: input.grade.trim() || null, description: input.description.trim() || null }; if (input.id) { const updated = await prisma.education.updateMany({ where: { id: input.id, profileId }, data }); if (!updated.count) return recordError('Education record not found in this profile.'); revalidatePath('/dashboard'); return { ok: true as const, id: input.id }; } const blocked = await evidenceCreationBlocked(userId); if (blocked) return blocked; const created = await prisma.education.create({ data: { profileId, ...data, sortOrder: await prisma.education.count({ where: { profileId } }) }, select: { id: true } }); revalidatePath('/dashboard'); return { ok: true as const, id: created.id }; }
export async function deleteEducationRecord(id: string, targetProfileId?: string) { const userId = await requireUserId(); const profileId = await requireOwnedEvidenceProfile(userId, targetProfileId); const warning = await evidenceDeleteWarning(profileId); const deleted = await prisma.education.deleteMany({ where: { id, profileId } }); if (!deleted.count) return recordError('Education record not found in this profile.'); revalidatePath('/dashboard'); return { ok: true as const, mayHaveStaleApprovals: warning }; }
export async function saveSkillRecord(input: SkillRecordInput, targetProfileId?: string) {
  const userId = await requireUserId(); const profileId = await requireOwnedEvidenceProfile(userId, targetProfileId); const name = cleanSkillDisplayName(input.name);
  if (!name) return recordError('Skill name is required.');
  const skills = await prisma.skill.findMany({ where: { profileId, ...(input.id ? { NOT: { id: input.id } } : {}) }, select: { id: true, name: true } });
  const duplicate = skills.find((skill) => normaliseSkillName(skill.name) === normaliseSkillName(name));
  if (duplicate) return recordError(`This skill already exists in this profile: ${duplicate.name}. Edit it instead.`);
  if (!input.id) { const blocked = await evidenceCreationBlocked(userId); if (blocked) return blocked; }
  const category = input.category.trim();
  const group = category ? ((await prisma.skillGroup.findFirst({ where: { profileId, category }, select: { id: true } })) ?? await prisma.skillGroup.create({ data: { profileId, category, sortOrder: await prisma.skillGroup.count({ where: { profileId } }) }, select: { id: true } })) : null;
  const taxonomyTermId = input.taxonomyTermId?.trim() || null;
  if (taxonomyTermId && !(await prisma.skillTaxonomyTerm.findUnique({ where: { id: taxonomyTermId }, select: { id: true } }))) return recordError('Selected skill suggestion is no longer available.');
  const data = { profileId, skillGroupId: group?.id ?? null, name, normalizedName: normaliseSkillName(name), taxonomyTermId, level: input.level.trim() || null, contextType: input.contextType.trim() || null, activity: input.activity.trim() || null, period: input.period.trim() || null, outcome: input.outcome.trim() || null };
  if (input.id) { const owned = await prisma.skill.findFirst({ where: { id: input.id, profileId }, select: { id: true } }); if (!owned) return recordError('Skill not found in this profile.'); await prisma.skill.update({ where: { id: input.id }, data }); revalidatePath('/dashboard'); return { ok: true as const, id: input.id }; }
  const created = await prisma.skill.create({ data: { ...data, sortOrder: await prisma.skill.count({ where: { profileId } }) }, select: { id: true } }); revalidatePath('/dashboard'); return { ok: true as const, id: created.id };
}
export async function deleteSkillRecord(id: string, targetProfileId?: string) {
  const userId = await requireUserId(); const profileId = await requireOwnedEvidenceProfile(userId, targetProfileId); const warning = await evidenceDeleteWarning(profileId);
  const owned = await prisma.skill.findFirst({ where: { id, profileId }, select: { id: true } }); if (!owned) return recordError('Skill not found in this profile.');
  const dependencies = await prisma.projectSkill.count({ where: { skillId: id } });
  if (dependencies) return recordError('Remove this skill from its linked projects before deleting it.');
  await prisma.skill.delete({ where: { id } }); revalidatePath('/dashboard'); return { ok: true as const, mayHaveStaleApprovals: warning };
}

/** Bounded local search used by the Skill creation controls; never contacts ESCO. */
export async function searchSkillTaxonomy(query: string, limit?: number) {
  await requireUserId();
  const trimmed = query.trim();
  if (trimmed.length > skillTaxonomySearchLimits.MAX_QUERY_LENGTH) return [];
  return searchLocalSkillTaxonomy(trimmed, limit);
}
