/**
 * UK right-to-work statuses. Values mirror the Prisma `VisaStatus` enum
 * (prisma/schema.prisma) exactly — keep them in sync. `temporary` marks the
 * time-limited statuses that require a `visaExpiry`; the three permanent
 * statuses (British/Irish citizen, Settled/ILR) never do.
 *
 * This module is Prisma-free so client components can import it without pulling
 * the `pg` adapter into the browser bundle.
 */
export interface VisaStatusOption {
  value: string;
  label: string;
  /** Time-limited status — requires an expiry date. */
  temporary: boolean;
}

export const VISA_STATUSES: readonly VisaStatusOption[] = [
  { value: 'BRITISH_CITIZEN', label: 'British citizen', temporary: false },
  { value: 'IRISH_CITIZEN', label: 'Irish citizen', temporary: false },
  { value: 'SETTLED', label: 'Settled / Indefinite Leave to Remain', temporary: false },
  { value: 'PRE_SETTLED', label: 'Pre-settled status', temporary: true },
  { value: 'SKILLED_WORKER', label: 'Skilled Worker visa', temporary: true },
  { value: 'HEALTH_CARE_WORKER', label: 'Health & Care Worker visa', temporary: true },
  { value: 'GRADUATE', label: 'Graduate visa', temporary: true },
  { value: 'STUDENT', label: 'Student visa', temporary: true },
  { value: 'DEPENDANT', label: 'Dependant visa', temporary: true },
  { value: 'GLOBAL_TALENT', label: 'Global Talent visa', temporary: true },
  { value: 'HIGH_POTENTIAL', label: 'High Potential Individual visa', temporary: true },
  { value: 'YOUTH_MOBILITY', label: 'Youth Mobility Scheme', temporary: true },
  { value: 'OTHER_SPONSORSHIP', label: 'Other (requires sponsorship)', temporary: true },
] as const;

const BY_VALUE = new Map(VISA_STATUSES.map((v) => [v.value, v]));

/** True if the value is a recognised visa status. */
export function isVisaStatus(value: string): boolean {
  return BY_VALUE.has(value);
}

/** True if the status is time-limited and therefore needs an expiry date. */
export function visaRequiresExpiry(value: string): boolean {
  return BY_VALUE.get(value)?.temporary ?? false;
}

/** Human-readable label for a status value, or the raw value if unknown. */
export function visaStatusLabel(value: string): string {
  return BY_VALUE.get(value)?.label ?? value;
}
