import type { OccupationId } from '@/shared/types/classification';
import type { OccupationProfile } from './types';
import { softwareEngineerProfile } from './profiles/software-engineer';
import { warehouseOperativeProfile } from './profiles/warehouse-operative';
import { administratorProfile } from './profiles/administrator';
import { registeredNurseProfile } from './profiles/registered-nurse';
import { healthcareSupportProfile } from './profiles/healthcare-support';
import { genericProfile } from './profiles/generic';

export const OCCUPATION_PROFILES: Record<OccupationId, OccupationProfile> = {
  software_engineer: softwareEngineerProfile,
  warehouse_operative: warehouseOperativeProfile,
  administrator: administratorProfile,
  registered_nurse: registeredNurseProfile,
  healthcare_support: healthcareSupportProfile,
  generic: genericProfile,
};

export const OCCUPATION_IDS = Object.keys(OCCUPATION_PROFILES) as OccupationId[];

export function getOccupationProfile(id: OccupationId): OccupationProfile {
  return OCCUPATION_PROFILES[id] ?? genericProfile;
}

/** Narrow an untrusted string (AI output, stored column) to a known occupation. */
export function isKnownOccupation(value: unknown): value is OccupationId {
  return typeof value === 'string' && value in OCCUPATION_PROFILES;
}
