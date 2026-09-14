import { prisma } from '@/shared/lib/prisma';
import { repairStoredPhone } from '@/shared/utils/phone';

/** One career track in the switcher — no content, just enough to list and pick. */
export interface ProfileSummary {
  id: string;
  label: string;
  isDefault: boolean;
  targetIndustry: string | null;
  /** 0–100, so the switcher can show which tracks still need filling in. */
  completeness: number;
}

export interface ProfileData {
  /** Which profile this content came from; empty when the user has none yet. */
  profileId: string;
  label: string;
  targetIndustry: string;
  personal: {
    /** This career track's own name — mirrors the top-level `label`, editable via the same form. */
    label: string;
    fullName: string;
    tagline: string;
    professionalSummary: string;
    /** OccupationId or '' — which evaluation profile scores this track. */
    targetOccupation: string;
    targetRoleTitle: string;
    /** entry | mid | senior | lead, or ''. */
    targetSeniority: string;
    /** Sector id, or '' — feeds keyword vocabulary and the classifier's sector override. */
    targetIndustry: string;
    email: string;
    phoneDialCode: string;
    phoneNumber: string;
    /** ISO2 of the chosen dial-code country, so the right flag survives reloads. */
    phoneCountry: string;
    city: string;
    state: string;
    country: string;
    website: string;
    linkedin: string;
    github: string;
    /** VisaStatus enum value, or '' when unset. */
    visaStatus: string;
    /** ISO date (YYYY-MM-DD), or '' when unset / not applicable. */
    visaExpiry: string;
  };
  /**
   * Dates below are the raw stored `YYYY` or `YYYY-MM` values, not display strings — the
   * forms bind them straight to a month input. Rendering (e.g. "Jan 2022 –
   * Present") happens at the point of use via shared/utils/date.ts.
   */
  experience: {
    /** Stable database identity used only for server-validated evidence links. */
    id: string;
    jobTitle: string;
    company: string;
    location: string;
    /** `EmploymentType` enum member, or '' when unset. */
    type: string;
    startDate: string;
    endDate: string;
    current: boolean;
    achievements: string[];
  }[];
  projects: {
    id: string;
    name: string;
    skillIds?: string[];
    skills?: { id: string; name: string; level: string; category: string }[];
    liveUrl?: string;
    repositoryUrl?: string;
    startDate: string;
    endDate: string;
    achievements: string[];
  }[];
  education: {
    id: string;
    degree: string;
    university: string;
    startDate: string;
    endDate: string;
    current: boolean;
    grade: string;
    description: string;
  }[];
  skills: {
    id: string;
    category: string;
    /** Form-compatible names, retained so profile editing is unchanged. */
    skills: string[];
    /** Individual database rows used for evidence references. */
    skillItems: {
      id: string;
      name: string;
      level?: string;
      contextType?: string;
      activity?: string;
      period?: string;
      outcome?: string;
      taxonomyTermId?: string;
      taxonomy?: { id: string; externalUri: string; source: string; sourceVersion: string; preferredLabel: string } | null;
    }[];
  }[];
  certifications: {
    id: string;
    name: string;
    issuer: string;
    year: string;
    issueDate?: string;
    expiryDate?: string;
    credentialNumber?: string;
    status?: string;
    verificationUrl?: string;
    verificationStatus?: string;
  }[];
  trainings: { id: string; course: string; provider: string; field: string; status: string; startDate: string; endDate: string; result: string }[];
  licences: { id: string; officialName: string; issuingBody: string; issueDate: string; expiryDate: string; credentialNumber: string; status: string; verificationUrl: string; verificationStatus: string }[];
  professionalRegistrations: { id: string; officialName: string; issuingBody: string; issueDate: string; expiryDate: string; registrationNumber: string; status: string; verificationUrl: string; verificationStatus: string }[];
  languages: { id: string; language: string; speaking: string; reading: string; writing: string; professionalUseContext: string; formalTest: string }[];
  volunteering: { id: string; organisation: string; role: string; startDate: string; endDate: string; contribution: string; skillsTools: string[]; outcome: string }[];
  otherEvidence: { id: string; title: string; context: string; description: string; period: string; outcome: string }[];
}

// Completeness helpers live in a Prisma-free module so client components can
// import them without pulling the `pg` adapter into the browser bundle.
export { profileCompleteness, isProfileComplete } from './profile-completeness';
import { evaluateProfileCompleteness } from './profile-completeness';

/**
 * Resolve which profile to read for a user. An explicit `profileId` is only
 * honoured when it actually belongs to that user — otherwise a caller could
 * pass someone else's id and read their profile. Falls back to the default
 * profile, then to the oldest, so a user mid-migration always resolves to one.
 */
async function resolveProfile(userId: string, profileId?: string) {
  const include = {
    experience: { orderBy: { sortOrder: 'asc' } },
    projects: { orderBy: { sortOrder: 'asc' }, include: { projectSkills: { orderBy: { sortOrder: 'asc' }, include: { skill: { include: { skillGroup: true, taxonomyTerm: true } } } } } },
    education: { orderBy: { sortOrder: 'asc' } },
    skillGroups: {
      orderBy: { sortOrder: 'asc' },
      include: { skills: { orderBy: { sortOrder: 'asc' }, include: { taxonomyTerm: true } } },
    },
    skills: { orderBy: { sortOrder: 'asc' }, include: { skillGroup: true, taxonomyTerm: true } },
    certifications: { orderBy: { name: 'asc' } },
    trainings: { orderBy: { course: 'asc' } },
    licences: { orderBy: { officialName: 'asc' } },
    professionalRegistrations: { orderBy: { officialName: 'asc' } },
    languages: { orderBy: { language: 'asc' } },
    volunteering: { orderBy: { organisation: 'asc' } },
    otherEvidence: { orderBy: { title: 'asc' } },
  } as const;

  if (profileId) {
    const owned = await prisma.profile.findFirst({ where: { id: profileId, userId }, include });
    if (owned) return owned;
  }

  return prisma.profile.findFirst({
    where: { userId },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    include,
  });
}

/**
 * Just the id of the profile a request should be filed under, without loading
 * its contents. Same ownership rule as `resolveProfile`: an id belonging to
 * someone else is ignored rather than trusted.
 *
 * Returns null only when the user somehow holds no profile at all, which the
 * callers treat as "file it unscoped" rather than as an error.
 */
export async function resolveProfileId(
  userId: string,
  profileId?: string
): Promise<string | null> {
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
  return fallback?.id ?? null;
}

/**
 * Load one career-track profile, normalised into plain form-ready shapes.
 * Identity fields (name, contact, visa) are shared across every profile and
 * come from ProfileIdentity; only the content varies per track.
 *
 * Omitting `profileId` loads the user's default profile, which is what every
 * pre-multi-profile caller wants.
 */
export async function loadProfileData(userId: string, profileId?: string): Promise<ProfileData> {
  const [identity, profile] = await Promise.all([
    prisma.profileIdentity.findUnique({ where: { userId } }),
    resolveProfile(userId, profileId),
  ]);

  const toStrings = (value: unknown): string[] =>
    Array.isArray(value) ? value.map((v) => String(v)) : [];

  const phone = repairStoredPhone({
    phoneDialCode: identity?.phoneDialCode,
    phoneNumber: identity?.phoneNumber,
    phoneCountry: identity?.phoneCountry,
  });

  return {
    profileId: profile?.id ?? '',
    label: profile?.label ?? 'Default',
    targetIndustry: profile?.targetIndustry ?? '',
    personal: {
      label: profile?.label ?? 'Default',
      fullName: identity?.fullName ?? '',
      tagline: profile?.tagline ?? '',
      professionalSummary: profile?.professionalSummary ?? '',
      targetOccupation: profile?.targetOccupation ?? '',
      targetRoleTitle: profile?.targetRoleTitle ?? '',
      targetSeniority: profile?.targetSeniority ?? '',
      targetIndustry: profile?.targetIndustry ?? '',
      email: identity?.email ?? '',
      // Re-split on the way out as well as on the way in. Rows written before the
      // three-column contract existed hold the whole international number in
      // `phoneNumber`, which renders as an empty dial-code picker beside
      // "+44 7737-853800" — a defect the user sees whether or not they ever save
      // again. This repairs the VIEW only; the row is rewritten the next time the
      // form is saved, so nothing is silently mutated underneath them.
      ...phone,
      city: identity?.city ?? '',
      state: identity?.state ?? '',
      country: identity?.country ?? '',
      website: identity?.website ?? '',
      linkedin: identity?.linkedin ?? '',
      github: identity?.github ?? '',
      visaStatus: identity?.visaStatus ?? '',
      visaExpiry: identity?.visaExpiry ? identity.visaExpiry.toISOString().slice(0, 10) : '',
    },
    experience:
      profile?.experience.map((e) => ({
        id: e.id,
        jobTitle: e.jobTitle,
        company: e.company,
        location: e.location ?? '',
        type: e.type ?? '',
        startDate: e.startDate,
        endDate: e.endDate ?? '',
        current: e.current,
        achievements: toStrings(e.achievements),
      })) ?? [],
    projects:
      profile?.projects.map((p) => ({
        id: p.id,
        name: p.name,
        skillIds: p.projectSkills.map((link) => link.skillId),
        skills: p.projectSkills.map((link) => ({ id: link.skill.id, name: link.skill.name, level: link.skill.level ?? '', category: link.skill.skillGroup?.category ?? '' })),
        liveUrl: p.liveUrl ?? '',
        repositoryUrl: p.repositoryUrl ?? '',
        startDate: p.startDate ?? '',
        endDate: p.endDate ?? '',
        achievements: toStrings(p.achievements),
      })) ?? [],
    education:
      profile?.education.map((ed) => ({
        id: ed.id,
        degree: ed.degree,
        university: ed.university,
        startDate: ed.startDate ?? '',
        endDate: ed.endDate ?? '',
        current: ed.current,
        grade: ed.grade ?? '',
        description: ed.description ?? '',
      })) ?? [],
    skills: [
      ...(profile?.skillGroups.map((group) => ({
        id: group.id,
        category: group.category,
        skills: group.skills.map((skill) => skill.name),
        skillItems: group.skills.map((skill) => ({
          id: skill.id,
          name: skill.name,
          level: skill.level ?? '',
          contextType: skill.contextType ?? '',
          activity: skill.activity ?? '',
          period: skill.period ?? '',
          outcome: skill.outcome ?? '',
          taxonomyTermId: skill.taxonomyTermId ?? '', taxonomy: skill.taxonomyTerm ? { id: skill.taxonomyTerm.id, externalUri: skill.taxonomyTerm.externalUri, source: skill.taxonomyTerm.source, sourceVersion: skill.taxonomyTerm.sourceVersion, preferredLabel: skill.taxonomyTerm.preferredLabel } : null,
        })),
      })) ?? []),
      ...((profile?.skills ?? []).some((skill) => !skill.skillGroupId) ? [{
        id: 'ungrouped',
        category: 'Additional Skills',
        skills: (profile?.skills ?? []).filter((skill) => !skill.skillGroupId).map((skill) => skill.name),
        skillItems: (profile?.skills ?? []).filter((skill) => !skill.skillGroupId).map((skill) => ({
          id: skill.id,
          name: skill.name,
          level: skill.level ?? '',
          contextType: skill.contextType ?? '',
          activity: skill.activity ?? '',
          period: skill.period ?? '',
          outcome: skill.outcome ?? '',
          taxonomyTermId: skill.taxonomyTermId ?? '', taxonomy: skill.taxonomyTerm ? { id: skill.taxonomyTerm.id, externalUri: skill.taxonomyTerm.externalUri, source: skill.taxonomyTerm.source, sourceVersion: skill.taxonomyTerm.sourceVersion, preferredLabel: skill.taxonomyTerm.preferredLabel } : null,
        })),
      }] : []),
    ],
    certifications:
      profile?.certifications.map((certification) => ({
        id: certification.id,
        name: certification.name,
        issuer: certification.issuer ?? '',
        year: certification.year ?? '',
        issueDate: certification.issueDate ?? '',
        expiryDate: certification.expiryDate ?? '',
        credentialNumber: certification.credentialNumber ?? '',
        status: certification.status ?? '',
        verificationUrl: certification.verificationUrl ?? '',
        verificationStatus: certification.verificationStatus ?? '',
      })) ?? [],
    trainings: profile?.trainings?.map((item) => ({ id: item.id, course: item.course, provider: item.provider ?? '', field: item.field ?? '', status: item.status ?? '', startDate: item.startDate ?? '', endDate: item.endDate ?? '', result: item.result ?? '' })) ?? [],
    licences: profile?.licences?.map((item) => ({ id: item.id, officialName: item.officialName, issuingBody: item.issuingBody ?? '', issueDate: item.issueDate ?? '', expiryDate: item.expiryDate ?? '', credentialNumber: item.credentialNumber ?? '', status: item.status ?? '', verificationUrl: item.verificationUrl ?? '', verificationStatus: item.verificationStatus ?? '' })) ?? [],
    professionalRegistrations: profile?.professionalRegistrations?.map((item) => ({ id: item.id, officialName: item.officialName, issuingBody: item.issuingBody, issueDate: item.issueDate ?? '', expiryDate: item.expiryDate ?? '', registrationNumber: item.registrationNumber ?? '', status: item.status ?? '', verificationUrl: item.verificationUrl ?? '', verificationStatus: item.verificationStatus ?? '' })) ?? [],
    languages: profile?.languages?.map((item) => ({ id: item.id, language: item.language, speaking: item.speaking ?? '', reading: item.reading ?? '', writing: item.writing ?? '', professionalUseContext: item.professionalUseContext ?? '', formalTest: item.formalTest ?? '' })) ?? [],
    volunteering: profile?.volunteering?.map((item) => ({ id: item.id, organisation: item.organisation, role: item.role, startDate: item.startDate ?? '', endDate: item.endDate ?? '', contribution: item.contribution ?? '', skillsTools: item.skillsTools, outcome: item.outcome ?? '' })) ?? [],
    otherEvidence: profile?.otherEvidence?.map((item) => ({ id: item.id, title: item.title, context: item.context ?? '', description: item.description, period: item.period ?? '', outcome: item.outcome ?? '' })) ?? [],
  };
}

/**
 * Strict evidence loader. Unlike the form-oriented loader's legacy fallback,
 * an explicit unowned or deleted profile is rejected instead of silently
 * substituting the user's default profile.
 */
export async function loadOwnedProfileData(
  userId: string,
  profileId?: string
): Promise<ProfileData | null> {
  if (profileId) {
    const owned = await prisma.profile.findFirst({
      where: { id: profileId, userId },
      select: { id: true },
    });
    if (!owned) return null;
  }

  const profile = await loadProfileData(userId, profileId);
  if (profileId && profile.profileId !== profileId) return null;
  return profile.profileId ? profile : null;
}

/**
 * Every career-track profile a user holds, for the switcher. Completeness is
 * computed from counts rather than by loading each profile in full, so listing
 * five profiles stays a single query.
 */
export async function listProfiles(userId: string): Promise<ProfileSummary[]> {
  const [identity, profiles] = await Promise.all([
    prisma.profileIdentity.findUnique({ where: { userId }, select: { fullName: true } }),
    prisma.profile.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        label: true,
        isDefault: true,
        targetIndustry: true,
        targetOccupation: true,
        targetRoleTitle: true,
        professionalSummary: true,
        _count: {
          select: { experience: true, projects: true, education: true, skillGroups: true },
        },
      },
    }),
  ]);

  return profiles.map((p) => {
    // Answered from `_count` aggregates rather than loaded rows — the switcher
    // shows every track, and loading each one's full content to count it would
    // be gratuitous. fullName is shared identity; the rest is per-profile.
    const { percentage } = evaluateProfileCompleteness({
      targetOccupation: p.targetOccupation ?? '',
      fullName: Boolean(identity?.fullName),
      careerDirection: Boolean(p.targetRoleTitle?.trim()),
      professionalSummary: Boolean(p.professionalSummary),
      experience: p._count.experience,
      education: p._count.education,
      skills: p._count.skillGroups,
      projects: p._count.projects,
    });

    return {
      id: p.id,
      label: p.label,
      isDefault: p.isDefault,
      targetIndustry: p.targetIndustry,
      completeness: percentage,
    };
  });
}

/**
 * A career track's declared TARGET only — the fields that decide what a CV is
 * analysed against, without loading any of the track's content. Used by the
 * post-upload target picker and by the analyze route to resolve a chosen
 * Profile target server-side (never trusting a client-supplied occupation).
 */
export interface ProfileTarget {
  profileId: string;
  label: string;
  isDefault: boolean;
  /** OccupationId or '' — the structured scoring lens the track declares. */
  targetOccupation: string;
  targetRoleTitle: string;
  targetSeniority: string;
  targetIndustry: string;
}

const PROFILE_TARGET_SELECT = {
  id: true,
  label: true,
  isDefault: true,
  targetOccupation: true,
  targetRoleTitle: true,
  targetSeniority: true,
  targetIndustry: true,
} as const;

function toProfileTarget(p: {
  id: string;
  label: string;
  isDefault: boolean;
  targetOccupation: string | null;
  targetRoleTitle: string | null;
  targetSeniority: string | null;
  targetIndustry: string | null;
}): ProfileTarget {
  return {
    profileId: p.id,
    label: p.label,
    isDefault: p.isDefault,
    targetOccupation: p.targetOccupation ?? '',
    targetRoleTitle: p.targetRoleTitle ?? '',
    targetSeniority: p.targetSeniority ?? '',
    targetIndustry: p.targetIndustry ?? '',
  };
}

/** Every career-track target a user holds, for the post-upload target picker. */
export async function listProfileTargets(userId: string): Promise<ProfileTarget[]> {
  const profiles = await prisma.profile.findMany({
    where: { userId },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    select: PROFILE_TARGET_SELECT,
  });
  return profiles.map(toProfileTarget);
}

/**
 * One owned profile's declared target, or null when the id is not owned. Used
 * to resolve a "choose another saved Profile" target authoritatively: an
 * unowned id resolves to null so the caller can reject it rather than trust it.
 */
export async function loadProfileTarget(
  userId: string,
  profileId: string
): Promise<ProfileTarget | null> {
  const profile = await prisma.profile.findFirst({
    where: { id: profileId, userId },
    select: PROFILE_TARGET_SELECT,
  });
  return profile ? toProfileTarget(profile) : null;
}
