import { normalizeIdentityText } from './entity-identity';
import type { EvidenceSourceType } from './types';

export interface NormalizationAuthorityContext {
  currentProfileSnapshotId?: string;
  matchProfileSnapshotId?: string;
}

export interface StructuralFieldCandidate<T> {
  value: T;
  representationId: string;
  sourceType: EvidenceSourceType;
  snapshotId?: string;
  canonicalEntityId?: string;
  supportKeys: string[];
}

export type StructuralAuthority =
  | 'CURRENT_PROFILE'
  | 'CANONICAL_REUSABLE'
  | 'APPLICATION_ENTITY'
  | 'MATCH_PROFILE'
  | 'EXTRACTED'
  | 'SAFE_FALLBACK';

export interface StructuralFieldValidation<T> {
  isValid?: (value: T) => boolean;
  completeness?: (value: T) => number;
  normalize?: (value: T) => string;
}

const authorityRank: Record<StructuralAuthority, number> = {
  CURRENT_PROFILE: 1,
  CANONICAL_REUSABLE: 2,
  APPLICATION_ENTITY: 3,
  MATCH_PROFILE: 4,
  EXTRACTED: 5,
  SAFE_FALLBACK: 6,
};

export function authorityFor<T>(
  candidate: StructuralFieldCandidate<T>,
  context: NormalizationAuthorityContext
): StructuralAuthority {
  if (candidate.sourceType === 'CAREER_PROFILE' && candidate.snapshotId === context.currentProfileSnapshotId) {
    return 'CURRENT_PROFILE';
  }
  if (candidate.sourceType === 'CAREER_PROFILE' && candidate.snapshotId === context.matchProfileSnapshotId) {
    return 'MATCH_PROFILE';
  }
  if (candidate.sourceType === 'HITL' || candidate.sourceType === 'PROFILE_EVIDENCE' || candidate.sourceType === 'CAREER_PROFILE') {
    return 'CANONICAL_REUSABLE';
  }
  if (candidate.sourceType === 'APPLICATION_EVIDENCE') return 'APPLICATION_ENTITY';
  if (candidate.sourceType === 'SOURCE_CV') return 'EXTRACTED';
  return 'SAFE_FALLBACK';
}

export function selectAuthoritativeField<T>(
  candidates: StructuralFieldCandidate<T>[],
  context: NormalizationAuthorityContext,
  validation: StructuralFieldValidation<T> = {}
): T | undefined {
  const present = candidates.filter(({ value }) => value !== undefined && value !== null && String(value).trim() !== '');
  if (present.length === 0) return undefined;
  const normalize = validation.normalize ?? ((value: T) => normalizeIdentityText(value));
  return [...present].sort((left, right) => {
    const authorityDifference = authorityRank[authorityFor(left, context)] - authorityRank[authorityFor(right, context)];
    if (authorityDifference) return authorityDifference;
    const validityDifference = Number(validation.isValid?.(right.value) ?? true) - Number(validation.isValid?.(left.value) ?? true);
    if (validityDifference) return validityDifference;
    const supportDifference = new Set(right.supportKeys).size - new Set(left.supportKeys).size;
    if (supportDifference) return supportDifference;
    const completenessDifference = (validation.completeness?.(right.value) ?? 0) - (validation.completeness?.(left.value) ?? 0);
    if (completenessDifference) return completenessDifference;
    return normalize(left.value).localeCompare(normalize(right.value))
      || left.representationId.localeCompare(right.representationId);
  })[0]?.value;
}
