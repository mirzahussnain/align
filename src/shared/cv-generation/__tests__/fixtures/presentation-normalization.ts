import type { EntityIdentityRepresentation, NormalizableEntityKind } from '../../entity-identity';
import type { StructuralFieldCandidate } from '../../presentation-authority';
import type { EvidenceSourceType } from '../../types';

export function identityRepresentation(
  representationId: string,
  kind: NormalizableEntityKind,
  details: Record<string, unknown>,
  overrides: Partial<EntityIdentityRepresentation> = {}
): EntityIdentityRepresentation {
  return {
    representationId,
    kind,
    label: representationId,
    details,
    evidenceIds: [],
    sourceRefs: [],
    ...overrides,
  };
}

export function fieldCandidate<T>(
  representationId: string,
  value: T,
  sourceType: EvidenceSourceType,
  overrides: Partial<StructuralFieldCandidate<T>> = {}
): StructuralFieldCandidate<T> {
  return { representationId, value, sourceType, supportKeys: [], ...overrides };
}
