import { prisma } from '@/shared/lib/prisma';

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
    fullName: string;
    tagline: string;
    professionalSummary: string;
    /** OccupationId or '' — which evaluation profile scores this track. */
    targetOccupation: string;
    targetRoleTitle: string;
    /** entry | mid | senior | lead, or ''. */
    targetSeniority: string;
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
   * Dates below are the raw stored `YYYY-MM` values, not display strings — the
   * forms bind them straight to a month input. Rendering (e.g. "Jan 2022 –
   * Present") happens at the point of use via shared/utils/date.ts.
   */
  experience: {
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
    name: string;
    stack: string;
    startDate: string;
    endDate: string;
    achievements: string[];
  }[];
  education: {
    degree: string;
    university: string;
    startDate: string;
    endDate: string;
    current: boolean;
    grade: string;
    description: string;
  }[];
  skills: {
    category: string;
    skills: string[];
  }[];
}

// Completeness helpers live in a Prisma-free module so client components can
// import them without pulling the `pg` adapter into the browser bundle.
export { profileCompleteness, isProfileComplete } from './profile-completeness';

/**
 * Resolve which profile to read for a user. An explicit `profileId` is only
 * honoured when it actually belongs to that user — otherwise a caller could
 * pass someone else's id and read their profile. Falls back to the default
 * profile, then to the oldest, so a user mid-migration always resolves to one.
 */
async function resolveProfile(userId: string, profileId?: string) {
  const include = {
    experience: { orderBy: { sortOrder: 'asc' } },
    projects: { orderBy: { sortOrder: 'asc' } },
    education: { orderBy: { sortOrder: 'asc' } },
    skillGroups: { orderBy: { sortOrder: 'asc' } },
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

  return {
    profileId: profile?.id ?? '',
    label: profile?.label ?? 'Default',
    targetIndustry: profile?.targetIndustry ?? '',
    personal: {
      fullName: identity?.fullName ?? '',
      tagline: profile?.tagline ?? '',
      professionalSummary: profile?.professionalSummary ?? '',
      targetOccupation: profile?.targetOccupation ?? '',
      targetRoleTitle: profile?.targetRoleTitle ?? '',
      targetSeniority: profile?.targetSeniority ?? '',
      email: identity?.email ?? '',
      phoneDialCode: identity?.phoneDialCode ?? '',
      phoneNumber: identity?.phoneNumber ?? '',
      phoneCountry: identity?.phoneCountry ?? '',
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
        name: p.name,
        stack: p.stack ?? '',
        startDate: p.startDate ?? '',
        endDate: p.endDate ?? '',
        achievements: toStrings(p.achievements),
      })) ?? [],
    education:
      profile?.education.map((ed) => ({
        degree: ed.degree,
        university: ed.university,
        startDate: ed.startDate ?? '',
        endDate: ed.endDate ?? '',
        current: ed.current,
        grade: ed.grade ?? '',
        description: ed.description ?? '',
      })) ?? [],
    skills:
      profile?.skillGroups.map((s) => ({
        category: s.category,
        skills: s.skills,
      })) ?? [],
  };
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
        professionalSummary: true,
        _count: {
          select: { experience: true, projects: true, education: true, skillGroups: true },
        },
      },
    }),
  ]);

  return profiles.map((p) => {
    // Mirrors profileCompleteness()'s checks — fullName is shared identity,
    // the summary/target are per-profile, and the content sections are counted.
    const checks = [
      Boolean(identity?.fullName),
      Boolean(p.professionalSummary),
      Boolean(p.targetOccupation),
      p._count.experience > 0,
      p._count.projects > 0,
      p._count.education > 0,
      p._count.skillGroups > 0,
    ];

    return {
      id: p.id,
      label: p.label,
      isDefault: p.isDefault,
      targetIndustry: p.targetIndustry,
      completeness: Math.round((checks.filter(Boolean).length / checks.length) * 100),
    };
  });
}
