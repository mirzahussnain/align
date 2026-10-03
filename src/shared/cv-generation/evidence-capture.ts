import { EvidenceCaptureInputSchema } from './schemas';
import { stableEvidenceId } from './evidence-id';
import { tokenCoverage } from './requirements';
import type {
  CandidateEvidenceItem,
  EvidenceCaptureInput,
  GenerationRequirement,
  UnifiedCandidateEvidence,
  UnifiedEvidenceEntity,
} from './types';

const collectionByKind = {
  EXPERIENCE: 'employment', PROJECT: 'projects', EDUCATION: 'education', CERTIFICATION: 'certifications',
  TRAINING: 'training', VOLUNTEERING: 'volunteerExperience', OPEN_SOURCE: 'openSource', OTHER: 'otherEvidence',
} as const;

const evidenceKindByEntity = {
  EXPERIENCE: 'EMPLOYMENT', PROJECT: 'PROJECT', EDUCATION: 'EDUCATION', CERTIFICATION: 'CERTIFICATION',
  TRAINING: 'TRAINING', VOLUNTEERING: 'VOLUNTEER', OPEN_SOURCE: 'OPEN_SOURCE', OTHER: 'OTHER',
} as const;

function labelFor(input: EvidenceCaptureInput): string {
  if (input.entity.mode === 'EXISTING' || input.entity.mode === 'SOURCE_CV') return input.entity.label;
  const data = input.entity.data;
  return String(data.name ?? data.projectName ?? data.title ?? data.company ?? data.institution ?? data.course ?? data.organisation ?? 'Added evidence');
}

export function materializeCapturedEvidence(
  snapshot: UnifiedCandidateEvidence,
  generationId: string,
  rawInput: EvidenceCaptureInput
): UnifiedCandidateEvidence {
  const input = EvidenceCaptureInputSchema.parse(rawInput) as EvidenceCaptureInput;
  const result = structuredClone(snapshot);
  const entityId = input.entity.mode === 'EXISTING' || input.entity.mode === 'SOURCE_CV'
    ? input.entity.entityId
    : stableEvidenceId('hitl-entity', generationId, input.entityKind, labelFor(input));
  const lookupId = input.entity.mode === 'SOURCE_CV' ? input.entity.sourceEntityId : entityId;
  const collectionName = collectionByKind[input.entityKind];
  const collection = result[collectionName] as UnifiedEvidenceEntity[];
  let entity = collection.find((item) => item.sourceEntityId === lookupId || item.id === lookupId);
  if (!entity && (input.entity.mode === 'NEW' || input.entity.mode === 'SOURCE_CV')) {
    entity = { id: entityId, sourceEntityId: entityId, label: labelFor(input), details: input.entity.data, evidenceIds: [] };
    collection.push(entity);
  } else if (entity && input.entity.mode === 'SOURCE_CV' && input.persistenceScope === 'CAREER_PROFILE_AND_APPLICATION') {
    entity.sourceEntityId = entityId;
    entity.label = input.entity.label;
    entity.details = { ...entity.details, ...input.entity.data };
  }

  input.evidenceItems.forEach((captured, index) => {
    const evidenceId = stableEvidenceId('hitl', generationId, input.entityKind, entityId, captured.fieldKind, captured.text, index);
    const sourceType = input.persistenceScope === 'APPLICATION_ONLY' ? 'APPLICATION_EVIDENCE' as const : 'HITL' as const;
    const ref = { sourceType, entityType: input.entityKind, entityId, fieldPath: `${captured.fieldKind.toLocaleLowerCase('en-GB')}[${index}]`, snapshotId: generationId };
    const item: CandidateEvidenceItem = {
      id: evidenceId,
      kind: evidenceKindByEntity[input.entityKind],
      field: `${input.entityKind.toLocaleLowerCase('en-GB')}.${captured.fieldKind.toLocaleLowerCase('en-GB')}`,
      canonicalText: captured.text.trim(),
      canonicalData: { fieldKind: captured.fieldKind, persistenceScope: input.persistenceScope },
      sourceEntityId: entityId,
      provenance: sourceType,
      preservationTier: captured.requirementIds.length ? 0 : 1,
      requirementIds: [...new Set(captured.requirementIds)],
      sourceRefs: [ref],
    };
    result.evidenceById[evidenceId] = item;
    result.sourceRefs.push(ref);
    entity?.evidenceIds.push(evidenceId);
  });
  return result;
}

export function suggestRelatedRequirements(
  evidenceText: string,
  requirements: GenerationRequirement[],
  alreadyMapped = new Set<string>()
) {
  return requirements
    .filter((requirement) => !alreadyMapped.has(requirement.id))
    .map((requirement) => ({ requirementId: requirement.id, confidence: tokenCoverage(requirement.text, evidenceText) }))
    .filter((suggestion) => suggestion.confidence >= 0.25)
    .sort((left, right) => right.confidence - left.confidence);
}
