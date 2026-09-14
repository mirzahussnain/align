/**
 * Deterministic candidate ↔ vacancy practical comparison.
 *
 * Pure. No database, no network, no LLM, no CV prose. It takes the Phase 6
 * deterministic vacancy requirements plus confirmed structured profile facts and
 * emits one item per comparison. The whole file is the answer to "why is this
 * not just a prompt?": every statement it makes is reproducible, auditable and
 * attributable to a specific stored value.
 *
 * THE THREE STATES THAT MATTER, and the trap each one avoids:
 *
 *   CONFIRMED  — both sides are known and agree.
 *   CONFLICT   — both sides are known and disagree. Requires an EXPLICIT
 *                negative profile value; never an absent one.
 *   UNKNOWN    — the vacancy states a requirement and the profile does not
 *                record the answer. This is the common case and it must stay
 *                visibly distinct from CONFLICT, because "we don't know" is not
 *                a reason to discourage someone from applying.
 *
 * There is deliberately no overall verdict and no percentage. See
 * `practical-compatibility.ts` types for why.
 */
import type {
  VacancyRequirementEvidence,
} from '@/shared/types/job-intelligence';
import {
  PRACTICAL_COMPATIBILITY_DISCLAIMER,
  type ConfirmedCandidateFacts,
  type LocationCompatibility,
  type PracticalCompatibilityCategory,
  type PracticalCompatibilityItem,
  type PracticalCompatibilityViewModel,
} from '@/shared/types/practical-compatibility';

export type VacancyPracticalContext = {
  city?: string | null;
  region?: string | null;
  country?: string | null;
  locationText?: string | null;
  workStyle?: string | null;
  /** Phase 6 vacancy sponsorship wording. Employer register evidence is NOT read here. */
  sponsorshipSignal?:
    | 'AVAILABLE'
    | 'MAY_BE_CONSIDERED'
    | 'NOT_AVAILABLE'
    | 'RIGHT_TO_WORK_REQUIRED'
    | 'NOT_MENTIONED'
    | null;
  sponsorshipEvidence?: string;
};

const normalisePlace = (value: string | null | undefined) =>
  (value ?? '')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('en-GB')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

const REQUIREMENT_STRENGTH_LABEL: Record<string, string> = {
  REQUIRED: 'required',
  PREFERRED: 'preferred',
  MENTIONED: 'mentioned',
  NOT_DETECTED: 'not detected',
};

/** Short, quotable statement of what the vacancy said. Never reworded content. */
function vacancyStatement(requirement: VacancyRequirementEvidence): string {
  const strength = REQUIREMENT_STRENGTH_LABEL[requirement.requirement] ?? 'mentioned';
  return requirement.value
    ? `${requirement.value} (${strength})`
    : `${strength.charAt(0).toUpperCase()}${strength.slice(1)} by the vacancy`;
}

type Builder = {
  add: (item: PracticalCompatibilityItem) => void;
  has: (category: PracticalCompatibilityCategory) => boolean;
};

function makeBuilder(): Builder & { items: PracticalCompatibilityItem[] } {
  const items: PracticalCompatibilityItem[] = [];
  const seen = new Set<string>();
  return {
    items,
    add(item) {
      // One item per (category, requirement text). The extractor can legitimately
      // fire the same rule on several sentences; the user needs one row.
      const key = `${item.category}|${item.vacancyRequirement ?? ''}`;
      if (seen.has(key)) return;
      seen.add(key);
      items.push(item);
    },
    has(category) {
      return items.some((item) => item.category === category);
    },
  };
}

/**
 * Location, decided only from confirmed values.
 *
 * There is no straight-line-distance fallback: this repository has no travel-time
 * data, and treating "45km apart" as an answer would be a guess dressed as a
 * measurement in exactly the places (rural, cross-city, poor transport links)
 * where it is most wrong.
 */
export function assessLocationCompatibility(
  facts: ConfirmedCandidateFacts,
  vacancy: VacancyPracticalContext,
): { state: LocationCompatibility; explanation: string; profileFact?: string; vacancyFact?: string } {
  const vacancyCity = normalisePlace(vacancy.city);
  const vacancyRegion = normalisePlace(vacancy.region);
  const vacancyLabel = vacancy.locationText ?? vacancy.city ?? vacancy.region ?? undefined;
  const homeCity = normalisePlace(facts.homeCity);
  const homeRegion = normalisePlace(facts.homeRegion);

  if (vacancy.workStyle === 'REMOTE' && facts.workPatternPreference !== 'ONSITE') {
    return {
      state: 'COMPATIBLE',
      explanation: 'The vacancy is advertised as remote, so a specific home location is not required.',
      ...(vacancyLabel ? { vacancyFact: `${vacancyLabel} (remote)` } : { vacancyFact: 'Remote' }),
    };
  }
  if (!homeCity && !homeRegion) {
    return {
      state: 'UNKNOWN',
      explanation: 'Location compatibility cannot be confirmed from your profile, because no home location is recorded.',
      ...(vacancyLabel ? { vacancyFact: vacancyLabel } : {}),
    };
  }
  if (!vacancyCity && !vacancyRegion) {
    return {
      state: 'UNKNOWN',
      explanation: 'Location compatibility cannot be confirmed, because the vacancy does not state a specific location.',
      profileFact: facts.homeCity ?? facts.homeRegion,
    };
  }
  if (homeCity && vacancyCity && homeCity === vacancyCity) {
    return {
      state: 'COMPATIBLE',
      explanation: 'The vacancy location matches the home location recorded in your profile.',
      profileFact: facts.homeCity!,
      vacancyFact: vacancyLabel,
    };
  }
  if (homeRegion && vacancyRegion && homeRegion === vacancyRegion) {
    return {
      state: 'POSSIBLY_COMPATIBLE',
      explanation: 'The vacancy is in the region recorded in your profile, but not the same recorded town or city.',
      profileFact: facts.homeRegion!,
      vacancyFact: vacancyLabel,
    };
  }
  const relocationTargets = (facts.relocationLocations ?? []).map(normalisePlace).filter(Boolean);
  if (facts.openToRelocation === true) {
    const named = relocationTargets.length > 0;
    const covered = !named || relocationTargets.some((target) => target === vacancyCity || target === vacancyRegion);
    if (covered) {
      return {
        state: 'POSSIBLY_COMPATIBLE',
        explanation: named
          ? 'The vacancy location is among the places you have recorded as open to relocation.'
          : 'Your profile records that you are open to relocation, without naming specific places.',
        profileFact: named ? facts.relocationLocations!.join(', ') : 'Open to relocation',
        vacancyFact: vacancyLabel,
      };
    }
    return {
      state: 'CONFLICT',
      explanation: 'The vacancy location is outside the places you have recorded as open to relocation.',
      profileFact: facts.relocationLocations!.join(', '),
      vacancyFact: vacancyLabel,
    };
  }
  if (facts.openToRelocation === false) {
    return {
      state: 'CONFLICT',
      explanation: 'The vacancy is not at your recorded home location and your profile records that you are not open to relocation.',
      profileFact: facts.homeCity ?? facts.homeRegion,
      vacancyFact: vacancyLabel,
    };
  }
  return {
    state: 'UNKNOWN',
    explanation: 'The vacancy is not at your recorded home location, and your profile does not record whether you are open to relocation.',
    profileFact: facts.homeCity ?? facts.homeRegion,
    vacancyFact: vacancyLabel,
  };
}

const LOCATION_STATE: Record<LocationCompatibility, PracticalCompatibilityItem['state']> = {
  COMPATIBLE: 'CONFIRMED',
  POSSIBLY_COMPATIBLE: 'UNKNOWN',
  CONFLICT: 'CONFLICT',
  UNKNOWN: 'UNKNOWN',
};

const DBS_RANK = { NONE: 0, BASIC: 1, STANDARD: 2, ENHANCED: 3 } as const;
const CLEARANCE_RANK = { NONE: 0, BPSS: 1, CTC: 2, SC: 3, DV: 4 } as const;

function dbsItem(requirement: VacancyRequirementEvidence, facts: ConfirmedCandidateFacts): PracticalCompatibilityItem {
  const wanted = (requirement.value ?? '').toUpperCase();
  const base = {
    category: 'DBS' as const,
    vacancyRequirement: vacancyStatement(requirement),
    source: 'BOTH' as const,
  };
  if (!facts.dbsCheckLevel) {
    return { ...base, state: 'UNKNOWN', source: 'VACANCY', explanation: 'The vacancy mentions a DBS check. Your DBS status is not recorded in your profile.' };
  }
  const held = DBS_RANK[facts.dbsCheckLevel];
  const needed = wanted in DBS_RANK ? DBS_RANK[wanted as keyof typeof DBS_RANK] : undefined;
  const heldLabel = facts.dbsCheckLevel === 'NONE'
    ? 'No DBS check recorded as held'
    : `${facts.dbsCheckLevel} DBS${facts.dbsUpdateService ? ' (on the Update Service)' : ''}`;
  if (needed === undefined) {
    return {
      ...base,
      state: facts.dbsCheckLevel === 'NONE' ? 'UNKNOWN' : 'CONFIRMED',
      confirmedProfileFact: heldLabel,
      explanation: facts.dbsCheckLevel === 'NONE'
        ? 'The vacancy mentions a DBS check and your profile records that you do not currently hold one. Employers usually arrange this.'
        : 'The vacancy mentions a DBS check and your profile records one.',
    };
  }
  if (held >= needed && held > 0) {
    return { ...base, state: 'CONFIRMED', confirmedProfileFact: heldLabel, explanation: `The vacancy states a ${wanted} DBS check and your profile records a ${facts.dbsCheckLevel} check.` };
  }
  return {
    ...base,
    state: 'CONFLICT',
    confirmedProfileFact: heldLabel,
    explanation: `The vacancy states a ${wanted} DBS check and your profile records ${facts.dbsCheckLevel === 'NONE' ? 'no DBS check' : `only a ${facts.dbsCheckLevel} check`}.`,
  };
}

function clearanceItem(requirement: VacancyRequirementEvidence, facts: ConfirmedCandidateFacts): PracticalCompatibilityItem {
  const wanted = (requirement.value ?? '').toUpperCase().replace(/^ELIGIBLE TO OBTAIN\s+/, '');
  const base = { category: 'SECURITY_CLEARANCE' as const, vacancyRequirement: vacancyStatement(requirement), source: 'BOTH' as const };
  if (!facts.securityClearance) {
    return { ...base, state: 'UNKNOWN', source: 'VACANCY', explanation: 'The vacancy mentions security clearance. Your clearance status is not recorded in your profile.' };
  }
  const heldLabel = facts.securityClearance === 'NONE' ? 'No security clearance recorded as held' : `${facts.securityClearance} clearance`;
  const needed = wanted in CLEARANCE_RANK ? CLEARANCE_RANK[wanted as keyof typeof CLEARANCE_RANK] : undefined;
  // "Eligible to obtain" is a MENTIONED-strength requirement, not a demand to
  // already hold clearance, so an absent clearance is not a conflict.
  if (requirement.requirement !== 'REQUIRED' || needed === undefined) {
    return {
      ...base,
      state: facts.securityClearance === 'NONE' ? 'UNKNOWN' : 'CONFIRMED',
      confirmedProfileFact: heldLabel,
      explanation: facts.securityClearance === 'NONE'
        ? 'The vacancy mentions security clearance and your profile records that you do not currently hold any.'
        : 'The vacancy mentions security clearance and your profile records one.',
    };
  }
  if (CLEARANCE_RANK[facts.securityClearance] >= needed && CLEARANCE_RANK[facts.securityClearance] > 0) {
    return { ...base, state: 'CONFIRMED', confirmedProfileFact: heldLabel, explanation: `The vacancy states ${wanted} clearance and your profile records ${facts.securityClearance}.` };
  }
  return {
    ...base,
    state: 'CONFLICT',
    confirmedProfileFact: heldLabel,
    explanation: `The vacancy states that ${wanted} clearance must already be held, and your profile records ${facts.securityClearance === 'NONE' ? 'none' : facts.securityClearance}.`,
  };
}

/** Years of continuous UK residency the vacancy asks for, if it names a number. */
function requiredResidencyYears(text: string): number | undefined {
  const words: Record<string, number> = { three: 3, four: 4, five: 5, six: 6, ten: 10 };
  const match = text.match(/\b(three|four|five|six|ten|\d{1,2})\s*years?\b/i);
  if (!match) return undefined;
  const token = match[1].toLowerCase();
  const value = words[token] ?? Number(token);
  return Number.isFinite(value) && value > 0 && value <= 20 ? value : undefined;
}

function residencyItem(requirement: VacancyRequirementEvidence, facts: ConfirmedCandidateFacts, now: Date): PracticalCompatibilityItem {
  const base = { category: 'UK_RESIDENCY' as const, vacancyRequirement: vacancyStatement(requirement), source: 'BOTH' as const };
  const years = requiredResidencyYears(requirement.value ?? requirement.evidenceText);
  if (!facts.ukResidencyStartDate) {
    return { ...base, state: 'UNKNOWN', source: 'VACANCY', explanation: 'The vacancy states a UK residency requirement. Your UK residency history is not recorded in your profile.' };
  }
  const start = new Date(facts.ukResidencyStartDate);
  if (Number.isNaN(start.getTime())) {
    return { ...base, state: 'UNKNOWN', source: 'VACANCY', explanation: 'The vacancy states a UK residency requirement and the recorded residency start date could not be read.' };
  }
  const elapsedYears = (now.getTime() - start.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  const recorded = `UK residency recorded from ${start.toISOString().slice(0, 10)}`;
  if (years === undefined) {
    return { ...base, state: 'CONFIRMED', confirmedProfileFact: recorded, explanation: 'The vacancy states a UK residency requirement without naming a period, and your profile records a UK residency start date.' };
  }
  if (elapsedYears >= years) {
    return { ...base, state: 'CONFIRMED', confirmedProfileFact: recorded, explanation: `The vacancy states ${years} years of UK residency and your recorded start date covers that period.` };
  }
  return {
    ...base,
    state: 'CONFLICT',
    confirmedProfileFact: recorded,
    explanation: `The vacancy states ${years} years of UK residency and your recorded start date covers ${elapsedYears.toFixed(1)} years.`,
  };
}

function shiftItem(requirement: VacancyRequirementEvidence, facts: ConfirmedCandidateFacts): PracticalCompatibilityItem {
  const kind = (requirement.value ?? '').toUpperCase();
  const available =
    kind === 'NIGHT' ? facts.availableForNightShifts
      : kind === 'WEEKEND' ? facts.availableForWeekendShifts
        : kind === 'ROTATING' ? facts.availableForRotatingShifts
          : undefined;
  const label = kind === 'NIGHT' ? 'night shifts' : kind === 'WEEKEND' ? 'weekend working' : 'rotating shifts';
  const base = { category: 'SHIFT_AVAILABILITY' as const, vacancyRequirement: vacancyStatement(requirement) };
  if (available === true) {
    return { ...base, state: 'CONFIRMED', source: 'BOTH', confirmedProfileFact: `Available for ${label}`, explanation: `The vacancy mentions ${label} and your profile records that you are available for them.` };
  }
  if (available === false) {
    return { ...base, state: 'CONFLICT', source: 'BOTH', confirmedProfileFact: `Not available for ${label}`, explanation: `The vacancy mentions ${label} and your profile records that you are not available for them.` };
  }
  return { ...base, state: 'UNKNOWN', source: 'VACANCY', explanation: `The vacancy mentions ${label}. Your availability for them is not recorded in your profile.` };
}

/** Two-sided boolean comparison, used for licence, vehicle, onsite and travel. */
function booleanItem(input: {
  category: PracticalCompatibilityCategory;
  requirement: VacancyRequirementEvidence;
  held: boolean | undefined;
  confirmedLabel: string;
  deniedLabel: string;
  confirmedExplanation: string;
  conflictExplanation: string;
  unknownExplanation: string;
}): PracticalCompatibilityItem {
  const base = { category: input.category, vacancyRequirement: vacancyStatement(input.requirement) };
  if (input.held === true) {
    return { ...base, state: 'CONFIRMED', source: 'BOTH', confirmedProfileFact: input.confirmedLabel, explanation: input.confirmedExplanation };
  }
  if (input.held === false) {
    // Only a REQUIRED vacancy statement can conflict. "Preferred" or "mentioned"
    // is not something a candidate can fail.
    return input.requirement.requirement === 'REQUIRED'
      ? { ...base, state: 'CONFLICT', source: 'BOTH', confirmedProfileFact: input.deniedLabel, explanation: input.conflictExplanation }
      : { ...base, state: 'UNKNOWN', source: 'BOTH', confirmedProfileFact: input.deniedLabel, explanation: `${input.conflictExplanation} The vacancy states this as a preference rather than a requirement.` };
  }
  return { ...base, state: 'UNKNOWN', source: 'VACANCY', explanation: input.unknownExplanation };
}

/**
 * Immigration items.
 *
 * The system may report CONFIRMED FACTUAL profile data and CONFIRMED vacancy
 * wording, and may point out where a recorded expiry date falls relative to the
 * vacancy's own statement. It may not conclude anything about entitlement.
 */
function immigrationItems(
  builder: Builder,
  facts: ConfirmedCandidateFacts,
  vacancy: VacancyPracticalContext,
  requirements: VacancyRequirementEvidence[],
): void {
  const rightToWork = requirements.find((item) => item.category === 'RIGHT_TO_WORK');
  const sponsorship = requirements.find((item) => item.category === 'SPONSORSHIP');
  const wordingSaysNoSponsorship =
    vacancy.sponsorshipSignal === 'NOT_AVAILABLE' || vacancy.sponsorshipSignal === 'RIGHT_TO_WORK_REQUIRED' || Boolean(sponsorship);

  if (rightToWork || vacancy.sponsorshipSignal === 'RIGHT_TO_WORK_REQUIRED') {
    const statement = rightToWork ? vacancyStatement(rightToWork) : 'Existing right to work required';
    if (facts.hasCurrentRightToWork === true) {
      builder.add({
        category: 'RIGHT_TO_WORK',
        state: 'CONFIRMED',
        source: 'BOTH',
        vacancyRequirement: statement,
        confirmedProfileFact: facts.visaStatusLabel ?? 'Right to work recorded',
        explanation: 'The vacancy requires an existing right to work and your profile records a current right-to-work status.',
      });
    } else {
      builder.add({
        category: 'RIGHT_TO_WORK',
        state: 'UNKNOWN',
        source: 'VACANCY',
        vacancyRequirement: statement,
        explanation: 'The vacancy requires an existing right to work. Your profile does not record a status that confirms this.',
      });
    }
  }

  if (wordingSaysNoSponsorship || vacancy.sponsorshipSignal === 'AVAILABLE' || vacancy.sponsorshipSignal === 'MAY_BE_CONSIDERED') {
    const statement = sponsorship
      ? vacancyStatement(sponsorship)
      : vacancy.sponsorshipSignal === 'AVAILABLE' ? 'Sponsorship stated as available'
        : vacancy.sponsorshipSignal === 'MAY_BE_CONSIDERED' ? 'Sponsorship may be considered'
          : vacancy.sponsorshipSignal === 'NOT_AVAILABLE' ? 'Sponsorship stated as unavailable'
            : 'Existing right to work required';
    if (facts.requiresSponsorshipNow === true && wordingSaysNoSponsorship) {
      builder.add({
        category: 'SPONSORSHIP',
        state: 'CONFLICT',
        source: 'BOTH',
        vacancyRequirement: statement,
        confirmedProfileFact: 'Sponsorship recorded as currently required',
        explanation: 'The vacancy states that sponsorship is unavailable and your profile records that sponsorship is currently required.',
      });
    } else if (facts.requiresSponsorshipNow === false) {
      builder.add({
        category: 'SPONSORSHIP',
        state: 'CONFIRMED',
        source: 'BOTH',
        vacancyRequirement: statement,
        confirmedProfileFact: 'Sponsorship recorded as not currently required',
        explanation: 'Your profile records that you do not currently require sponsorship.',
      });
    } else {
      builder.add({
        category: 'SPONSORSHIP',
        state: 'UNKNOWN',
        source: 'VACANCY',
        vacancyRequirement: statement,
        explanation: 'The vacancy mentions sponsorship. Your profile does not record whether you currently require it.',
      });
    }
  }

  // Visa duration. A recorded expiry is a FACT about the profile and a stated
  // "no sponsorship" is a FACT about the advert; putting them next to each other
  // is a timeline observation, not a conclusion about whether anyone may be hired.
  if (facts.visaExpiry) {
    const expiry = new Date(facts.visaExpiry);
    if (!Number.isNaN(expiry.getTime())) {
      const expiryLabel = expiry.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
      if (wordingSaysNoSponsorship) {
        builder.add({
          category: 'VISA_DURATION',
          state: 'UNKNOWN',
          source: 'BOTH',
          vacancyRequirement: 'The vacancy states that sponsorship is unavailable.',
          confirmedProfileFact: `Recorded work permission until ${expiryLabel}`,
          explanation: `Your profile records current work permission until ${expiryLabel}. This may be relevant for employment continuing beyond that date. Confirm the position directly with the employer.`,
        });
      } else if (facts.mayRequireSponsorshipLater === true) {
        builder.add({
          category: 'VISA_DURATION',
          state: 'UNKNOWN',
          source: 'PROFILE',
          confirmedProfileFact: `Recorded work permission until ${expiryLabel}`,
          explanation: `Your profile records current work permission until ${expiryLabel} and that sponsorship may be required after that date.`,
        });
      } else {
        builder.add({
          category: 'VISA_DURATION',
          state: 'CONFIRMED',
          source: 'PROFILE',
          confirmedProfileFact: `Recorded work permission until ${expiryLabel}`,
          explanation: `Your profile records current work permission until ${expiryLabel}.`,
        });
      }
    }
  }
}

/** Categories whose UNKNOWN can be cleared by recording a structured profile value. */
const UPDATABLE: ReadonlySet<PracticalCompatibilityCategory> = new Set([
  'SPONSORSHIP', 'RIGHT_TO_WORK', 'VISA_DURATION', 'LOCATION', 'RELOCATION', 'COMMUTE',
  'REMOTE_ONSITE', 'DRIVING_LICENCE', 'VEHICLE', 'DBS', 'SECURITY_CLEARANCE',
  'UK_RESIDENCY', 'PROFESSIONAL_REGISTRATION', 'SHIFT_AVAILABILITY', 'TRAVEL',
]);

export function comparePracticalCompatibility(
  requirements: readonly VacancyRequirementEvidence[],
  facts: ConfirmedCandidateFacts,
  vacancy: VacancyPracticalContext = {},
  now: Date = new Date(),
): PracticalCompatibilityViewModel {
  const builder = makeBuilder();
  const detected = requirements.filter((item) => item.requirement !== 'NOT_DETECTED');

  immigrationItems(builder, facts, vacancy, [...detected]);

  for (const requirement of detected) {
    switch (requirement.category) {
      case 'RIGHT_TO_WORK':
      case 'SPONSORSHIP':
        break; // Handled together above, where wording and profile facts meet.
      case 'DRIVING_LICENCE':
        builder.add(booleanItem({
          category: 'DRIVING_LICENCE',
          requirement,
          held: facts.drivingLicenceHeld,
          confirmedLabel: 'Driving licence recorded as held',
          deniedLabel: 'Driving licence recorded as not held',
          confirmedExplanation: 'The vacancy states a driving licence and your profile records that you hold one.',
          conflictExplanation: 'The vacancy states a driving licence and your profile records that you do not hold one.',
          unknownExplanation: 'The vacancy states a driving licence. This is not confirmed in your profile.',
        }));
        break;
      case 'OWN_VEHICLE':
        builder.add(booleanItem({
          category: 'VEHICLE',
          requirement,
          held: facts.ownVehicleAvailable,
          confirmedLabel: 'Access to a vehicle recorded',
          deniedLabel: 'No access to a vehicle recorded',
          confirmedExplanation: 'The vacancy states access to a vehicle and your profile records that you have one.',
          conflictExplanation: 'The vacancy states access to a vehicle and your profile records that you do not have one.',
          unknownExplanation: 'The vacancy states access to a vehicle. This is not confirmed in your profile.',
        }));
        break;
      case 'ONSITE': {
        const preference = facts.workPatternPreference;
        const accepts = preference === undefined ? undefined : preference !== 'REMOTE_ONLY';
        builder.add(booleanItem({
          category: 'REMOTE_ONSITE',
          requirement,
          held: accepts,
          confirmedLabel: `Work pattern preference recorded as ${preference?.toLowerCase().replace('_', ' ')}`,
          deniedLabel: 'Work pattern preference recorded as remote only',
          confirmedExplanation: 'The vacancy involves on-site attendance and your recorded work-pattern preference allows it.',
          conflictExplanation: 'The vacancy involves on-site attendance and your profile records a remote-only preference.',
          unknownExplanation: 'The vacancy involves on-site attendance. Your work-pattern preference is not recorded in your profile.',
        }));
        break;
      }
      case 'TRAVEL':
        builder.add(booleanItem({
          category: 'TRAVEL',
          requirement,
          held: facts.willingToTravel,
          confirmedLabel: 'Willingness to travel recorded',
          deniedLabel: 'Unwillingness to travel recorded',
          confirmedExplanation: 'The vacancy mentions travel and your profile records that you are willing to travel.',
          conflictExplanation: 'The vacancy mentions travel and your profile records that you are not willing to travel.',
          unknownExplanation: 'The vacancy mentions travel. Your travel availability is not recorded in your profile.',
        }));
        break;
      case 'DBS':
        builder.add(dbsItem(requirement, facts));
        break;
      case 'SECURITY_CLEARANCE':
        builder.add(clearanceItem(requirement, facts));
        break;
      case 'UK_RESIDENCY':
        builder.add(residencyItem(requirement, facts, now));
        break;
      case 'SHIFT_PATTERN':
        builder.add(shiftItem(requirement, facts));
        break;
      case 'PROFESSIONAL_REGISTRATION': {
        const wanted = requirement.value?.toUpperCase();
        const registration = facts.professionalRegistrations.find(
          (item) => item.body.toUpperCase() === wanted,
        );
        if (registration?.status === 'ACTIVE') {
          builder.add({
            category: 'PROFESSIONAL_REGISTRATION',
            state: 'CONFIRMED',
            source: 'BOTH',
            vacancyRequirement: vacancyStatement(requirement),
            confirmedProfileFact: `${registration.body} registration recorded as active`,
            explanation: `The vacancy states ${registration.body} registration and your profile records an active registration with that body.`,
          });
        } else if (registration) {
          builder.add({
            category: 'PROFESSIONAL_REGISTRATION',
            state: registration.status === 'EXPIRED' ? 'CONFLICT' : 'UNKNOWN',
            source: 'BOTH',
            vacancyRequirement: vacancyStatement(requirement),
            confirmedProfileFact: `${registration.body} registration recorded as ${registration.status.toLowerCase()}`,
            explanation: registration.status === 'EXPIRED'
              ? `The vacancy states ${registration.body} registration and your profile records that registration as expired.`
              : `The vacancy states ${registration.body} registration and your profile records a registration that is not confirmed as active.`,
          });
        } else {
          builder.add({
            category: 'PROFESSIONAL_REGISTRATION',
            state: 'UNKNOWN',
            source: 'VACANCY',
            vacancyRequirement: vacancyStatement(requirement),
            explanation: `The vacancy states ${wanted ?? 'professional'} registration. A matching registration is not recorded in your profile.`,
          });
        }
        break;
      }
    }
  }

  // Location is assessed from vacancy METADATA, so it is offered whenever the
  // vacancy or the profile carries a location — not only when the advert text
  // happens to mention one.
  const location = assessLocationCompatibility(facts, vacancy);
  builder.add({
    category: 'LOCATION',
    state: LOCATION_STATE[location.state],
    source: location.profileFact && location.vacancyFact ? 'BOTH' : location.profileFact ? 'PROFILE' : 'VACANCY',
    ...(location.vacancyFact ? { vacancyRequirement: location.vacancyFact } : {}),
    ...(location.profileFact ? { confirmedProfileFact: location.profileFact } : {}),
    explanation: location.explanation,
  });

  // Commute. Only stated when the user has actually recorded a limit AND the
  // answer genuinely cannot be given: there is no travel-time data here, and
  // guessing a commute is worse than saying so.
  if (facts.maxCommuteMinutes !== undefined && location.state !== 'COMPATIBLE' && vacancy.workStyle !== 'REMOTE') {
    builder.add({
      category: 'COMMUTE',
      state: 'UNKNOWN',
      source: 'PROFILE',
      confirmedProfileFact: `Maximum commute recorded as ${facts.maxCommuteMinutes} minutes`,
      ...(vacancy.locationText ? { vacancyRequirement: vacancy.locationText } : {}),
      explanation: 'Your maximum commute is recorded, but no journey-time information is available for this vacancy, so the commute cannot be assessed.',
    });
  }

  const summary = {
    confirmed: builder.items.filter((item) => item.state === 'CONFIRMED').length,
    conflicts: builder.items.filter((item) => item.state === 'CONFLICT').length,
    unknown: builder.items.filter((item) => item.state === 'UNKNOWN').length,
    notApplicable: builder.items.filter((item) => item.state === 'NOT_APPLICABLE').length,
  };
  const updatableCategories = [
    ...new Set(
      builder.items
        .filter((item) => item.state === 'UNKNOWN' && UPDATABLE.has(item.category))
        .map((item) => item.category),
    ),
  ];
  return {
    items: builder.items,
    summary,
    updatableCategories,
    disclaimer: PRACTICAL_COMPATIBILITY_DISCLAIMER,
  };
}
