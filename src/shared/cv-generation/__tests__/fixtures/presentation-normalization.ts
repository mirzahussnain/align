import type { EntityIdentityRepresentation, NormalizableEntityKind } from '../../entity-identity';

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
