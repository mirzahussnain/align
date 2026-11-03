import type { EntityIdentityRepresentation, NormalizableEntityKind } from '../../entity-identity';
import type { StructuralFieldCandidate } from '../../presentation-authority';
import type { EvidenceSourceType } from '../../types';
import type { CandidateEvidenceItem, UnifiedEvidenceEntity } from '../../types';

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

export function presentationEntity(
  id: string,
  sourceEntityId: string,
  label: string,
  details: Record<string, unknown>,
  evidenceIds: string[]
): UnifiedEvidenceEntity {
  return { id, sourceEntityId, label, details, evidenceIds };
}

export function structuralEvidence(
  id: string,
  kind: CandidateEvidenceItem['kind'],
  sourceType: EvidenceSourceType,
  entityId: string,
  snapshotId?: string
): CandidateEvidenceItem {
  return {
    id,
    kind,
    field: 'record',
    canonicalText: id,
    provenance: sourceType,
    preservationTier: 1,
    requirementIds: [],
    sourceRefs: [{ sourceType, entityType: kind, entityId, fieldPath: 'record', snapshotId }],
  };
}
