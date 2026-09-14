/**
 * Loads CONFIRMED structured candidate facts for the practical comparison.
 *
 * The whole value of this module is what it refuses to do. It reads named
 * columns the user filled in themselves — ProfileIdentity, ProfilePracticalFacts,
 * Licence, ProfessionalRegistration — and nothing else. It never opens an
 * Experience summary, a professional summary, a stored CV or an extraction, and
 * it never asks a model to infer a fact. A driving licence mentioned in a job
 * description on someone's CV is not a recorded driving licence.
 *
 * Ownership is enforced at the query, not after it: every read is filtered by
 * `userId`, so another user's profile id simply returns nothing.
 */
import { prisma } from '@/shared/lib/prisma';
import type { ConfirmedCandidateFacts } from '@/shared/types/practical-compatibility';

/**
 * Human labels for the structured visa enum. Descriptive only — the label is
 * shown back to the user as "this is what your profile says", never used to
 * decide entitlement.
 */
export const VISA_STATUS_LABELS: Record<string, string> = {
  BRITISH_CITIZEN: 'British citizen',
  IRISH_CITIZEN: 'Irish citizen',
  SETTLED: 'Settled status / indefinite leave to remain',
  PRE_SETTLED: 'Pre-settled status',
  SKILLED_WORKER: 'Skilled Worker visa',
  HEALTH_CARE_WORKER: 'Health and Care Worker visa',
  GRADUATE: 'Graduate Route',
  STUDENT: 'Student visa',
  DEPENDANT: 'Dependant visa',
  GLOBAL_TALENT: 'Global Talent visa',
  HIGH_POTENTIAL: 'High Potential Individual visa',
  YOUTH_MOBILITY: 'Youth Mobility Scheme',
  OTHER_SPONSORSHIP: 'Other sponsored route',
};

/**
 * The ONLY statuses this code will derive work-permission facts from.
 *
 * These four are unrestricted and not time-limited, which makes "holds a current
 * right to work" and "does not currently require sponsorship" statements of
 * record rather than immigration judgements. Every other status is left UNKNOWN
 * unless the user has answered the sponsorship questions explicitly — deriving
 * "a Skilled Worker changing employer needs a new certificate of sponsorship"
 * would be applying the Immigration Rules, which this product does not do.
 */
const UNRESTRICTED_STATUSES = new Set(['BRITISH_CITIZEN', 'IRISH_CITIZEN', 'SETTLED']);

/** Statuses that confer a current right to work without being unrestricted. */
const CURRENT_RIGHT_TO_WORK_STATUSES = new Set(['PRE_SETTLED']);

function registrationStatus(value: string | null | undefined): 'ACTIVE' | 'PENDING' | 'EXPIRED' | 'UNKNOWN' {
  if (!value) return 'UNKNOWN';
  if (/active|current|valid|registered/i.test(value)) return 'ACTIVE';
  if (/pending|applied|in progress/i.test(value)) return 'PENDING';
  if (/expired|lapsed|suspended|removed/i.test(value)) return 'EXPIRED';
  return 'UNKNOWN';
}

/**
 * Driving-licence evidence from the structured Licence list.
 *
 * `true` only for a licence row whose lifecycle status is not recorded as
 * expired or revoked. There is no `false` branch: the ABSENCE of a licence row
 * is not a statement that the candidate has none — that answer lives on
 * ProfilePracticalFacts.drivingLicenceHeld, where the user gave it deliberately.
 */
function drivingLicenceFromLicences(
  licences: ReadonlyArray<{ officialName: string; status: string | null }>,
): boolean | undefined {
  const licence = licences.find((item) => /driving licen[cs]e/i.test(item.officialName));
  if (!licence) return undefined;
  return /expired|revoked|suspended|not held/i.test(licence.status ?? '') ? false : true;
}

export async function buildConfirmedCandidateFacts(
  userId: string,
  profileId: string,
  client: typeof prisma = prisma,
): Promise<ConfirmedCandidateFacts | null> {
  const [identity, practical, profile] = await Promise.all([
    client.profileIdentity.findUnique({
      where: { userId },
      select: { city: true, state: true, country: true, visaStatus: true, visaExpiry: true },
    }),
    client.profilePracticalFacts.findUnique({ where: { userId } }),
    client.profile.findFirst({
      where: { id: profileId, userId },
      select: {
        id: true,
        licences: { select: { officialName: true, status: true } },
        professionalRegistrations: { select: { issuingBody: true, status: true } },
      },
    }),
  ]);
  // Ownership: an id belonging to someone else does not match `userId` and so
  // never produces a comparison.
  if (!profile) return null;

  const visaStatus = identity?.visaStatus ? String(identity.visaStatus) : undefined;
  const unrestricted = visaStatus ? UNRESTRICTED_STATUSES.has(visaStatus) : undefined;
  const currentRightToWork = visaStatus
    ? UNRESTRICTED_STATUSES.has(visaStatus) || CURRENT_RIGHT_TO_WORK_STATUSES.has(visaStatus)
      ? true
      : undefined
    : undefined;

  // Explicit user answers always win over anything derived from the enum.
  const requiresSponsorshipNow =
    practical?.requiresSponsorshipNow ?? (unrestricted === true ? false : undefined);
  const mayRequireSponsorshipLater =
    practical?.mayRequireSponsorshipLater ?? (unrestricted === true ? false : undefined);

  const optional = <T,>(value: T | null | undefined): T | undefined => value ?? undefined;

  return {
    ...(visaStatus ? { visaStatus, visaStatusLabel: VISA_STATUS_LABELS[visaStatus] ?? visaStatus } : {}),
    ...(identity?.visaExpiry ? { visaExpiry: identity.visaExpiry.toISOString() } : {}),
    ...(unrestricted !== undefined ? { hasUnrestrictedWorkPermission: unrestricted } : {}),
    ...(currentRightToWork !== undefined ? { hasCurrentRightToWork: currentRightToWork } : {}),
    ...(requiresSponsorshipNow !== undefined ? { requiresSponsorshipNow } : {}),
    ...(mayRequireSponsorshipLater !== undefined ? { mayRequireSponsorshipLater } : {}),

    ...(identity?.city ? { homeCity: identity.city } : {}),
    ...(identity?.state ? { homeRegion: identity.state } : {}),
    ...(identity?.country ? { homeCountry: identity.country } : {}),
    ...(practical?.openToRelocation !== null && practical?.openToRelocation !== undefined
      ? { openToRelocation: practical.openToRelocation }
      : {}),
    ...(practical?.relocationLocations?.length ? { relocationLocations: practical.relocationLocations } : {}),
    ...(practical?.maxCommuteMinutes != null ? { maxCommuteMinutes: practical.maxCommuteMinutes } : {}),
    ...(practical?.workPatternPreference ? { workPatternPreference: practical.workPatternPreference } : {}),
    ...(practical?.maxOnsiteDaysPerWeek != null ? { maxOnsiteDaysPerWeek: practical.maxOnsiteDaysPerWeek } : {}),

    // The explicit answer wins; the structured licence list is the fallback.
    ...(optional(practical?.drivingLicenceHeld) !== undefined
      ? { drivingLicenceHeld: practical!.drivingLicenceHeld! }
      : drivingLicenceFromLicences(profile.licences) !== undefined
        ? { drivingLicenceHeld: drivingLicenceFromLicences(profile.licences)! }
        : {}),
    ...(optional(practical?.ownVehicleAvailable) !== undefined ? { ownVehicleAvailable: practical!.ownVehicleAvailable! } : {}),
    ...(optional(practical?.willingToTravel) !== undefined ? { willingToTravel: practical!.willingToTravel! } : {}),

    ...(practical?.dbsCheckLevel ? { dbsCheckLevel: practical.dbsCheckLevel } : {}),
    ...(optional(practical?.dbsUpdateService) !== undefined ? { dbsUpdateService: practical!.dbsUpdateService! } : {}),
    ...(practical?.securityClearance ? { securityClearance: practical.securityClearance } : {}),
    ...(practical?.ukResidencyStartDate ? { ukResidencyStartDate: practical.ukResidencyStartDate.toISOString() } : {}),

    professionalRegistrations: profile.professionalRegistrations.map((registration) => ({
      body: registration.issuingBody,
      status: registrationStatus(registration.status),
    })),

    ...(optional(practical?.availableForNightShifts) !== undefined ? { availableForNightShifts: practical!.availableForNightShifts! } : {}),
    ...(optional(practical?.availableForWeekendShifts) !== undefined ? { availableForWeekendShifts: practical!.availableForWeekendShifts! } : {}),
    ...(optional(practical?.availableForRotatingShifts) !== undefined ? { availableForRotatingShifts: practical!.availableForRotatingShifts! } : {}),
    ...(practical?.earliestStartDate ? { earliestStartDate: practical.earliestStartDate.toISOString() } : {}),
  };
}
