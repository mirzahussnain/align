import type {
  EvidenceSourceRef,
  HitlEvidenceEntityKind,
  UnifiedCandidateEvidence,
  UnifiedEvidenceEntity,
} from './types';
import { primaryEntityIdentityFingerprint } from './entity-identity';

export interface ExistingRecordOption {
  key: string;
  entityKind: HitlEvidenceEntityKind;
  entityId: string;
  label: string;
  origin: 'CAREER_PROFILE' | 'SOURCE_CV';
  promotable: boolean;
  details: Record<string, unknown>;
  promotionData: Record<string, unknown>;
  sourceEntityIds: string[];
  sourceRefs: EvidenceSourceRef[];
}

const collections: Record<HitlEvidenceEntityKind, keyof UnifiedCandidateEvidence> = {
  EXPERIENCE: 'employment',
  PROJECT: 'projects',
  EDUCATION: 'education',
  CERTIFICATION: 'certifications',
  TRAINING: 'training',
  VOLUNTEERING: 'volunteerExperience',
  OPEN_SOURCE: 'openSource',
  OTHER: 'otherEvidence',
};

const text = (details: Record<string, unknown>, ...keys: string[]) => {
  for (const key of keys) {
    const value = String(details[key] ?? '').trim();
    if (value) return value;
  }
  return '';
};
const joined = (...values: string[]) => values.filter(Boolean).join(' — ');

function canonicalLabel(kind: HitlEvidenceEntityKind, entity: UnifiedEvidenceEntity): string {
  const details = entity.details;
  switch (kind) {
    case 'EXPERIENCE':
      return joined(text(details, 'jobTitle', 'title'), text(details, 'company', 'employer')) || entity.label;
    case 'PROJECT':
      return joined(text(details, 'name', 'projectName'), text(details, 'description', 'purpose')) || entity.label;
    case 'EDUCATION':
      return joined(text(details, 'degree', 'qualification'), text(details, 'university', 'institution')) || entity.label;
    case 'CERTIFICATION':
      return joined(text(details, 'name', 'officialName'), text(details, 'issuer', 'issuingBody')) || entity.label;
    case 'TRAINING':
      return joined(text(details, 'course'), text(details, 'provider')) || entity.label;
    case 'VOLUNTEERING':
      return joined(text(details, 'role'), text(details, 'organisation')) || entity.label;
    case 'OPEN_SOURCE':
      return joined(text(details, 'projectName', 'name'), text(details, 'role') || 'Open-source contribution') || entity.label;
    case 'OTHER':
      return text(details, 'title') || entity.label;
  }
}

export function canonicalEntityData(kind: HitlEvidenceEntityKind, details: Record<string, unknown>): Record<string, unknown> {
  const value = (...keys: string[]) => text(details, ...keys) || undefined;
  switch (kind) {
    case 'EXPERIENCE': return { company: value('company', 'employer'), title: value('jobTitle', 'title'), employmentType: value('employmentType', 'type'), startDate: value('startDate'), endDate: value('endDate'), current: Boolean(details.current), location: value('location') };
    case 'PROJECT': return { name: value('name', 'projectName'), startDate: value('startDate'), endDate: value('endDate'), liveUrl: value('liveUrl'), repositoryUrl: value('repositoryUrl') };
    case 'EDUCATION': return { institution: value('institution', 'university'), qualification: value('qualification', 'degree'), startDate: value('startDate'), endDate: value('endDate'), current: Boolean(details.current), grade: value('grade') };
    case 'CERTIFICATION': return { name: value('name', 'officialName'), issuer: value('issuer', 'issuingBody'), issueDate: value('issueDate'), expiryDate: value('expiryDate'), credentialId: value('credentialId', 'credentialNumber'), credentialUrl: value('credentialUrl', 'verificationUrl') };
    case 'TRAINING': return { course: value('course'), provider: value('provider'), field: value('field'), status: value('status'), startDate: value('startDate'), endDate: value('endDate'), result: value('result') };
    case 'VOLUNTEERING': return { organisation: value('organisation'), role: value('role'), startDate: value('startDate'), endDate: value('endDate') };
    case 'OPEN_SOURCE': return { projectName: value('projectName', 'name'), role: value('role'), repositoryUrl: value('repositoryUrl'), projectUrl: value('projectUrl'), startDate: value('startDate'), endDate: value('endDate'), description: value('description'), technologies: Array.isArray(details.technologies) ? details.technologies.map(String) : [] };
    case 'OTHER': return { title: value('title'), context: value('context'), period: value('period') };
  }
}
function refsFor(entity: UnifiedEvidenceEntity, evidence: UnifiedCandidateEvidence): EvidenceSourceRef[] {
  const refs = entity.evidenceIds.flatMap((id) => evidence.evidenceById[id]?.sourceRefs ?? []);
  const unique = new Map(refs.map((ref) => [
    [ref.sourceType, ref.entityType, ref.entityId, ref.fieldPath, ref.snapshotId ?? ''].join('|'),
    ref,
  ]));
  return [...unique.values()];
}

function isProfileBacked(refs: EvidenceSourceRef[]): boolean {
  return refs.some((ref) => ref.sourceType === 'CAREER_PROFILE' || ref.sourceType === 'PROFILE_EVIDENCE' || ref.sourceType === 'HITL');
}

function encodedFingerprint(value: string): string {
  return encodeURIComponent(value).replace(/%/g, '').toLocaleLowerCase('en-GB');
}

export function buildExistingRecordOptions(
  evidence: UnifiedCandidateEvidence,
  generationId: string,
  kind: HitlEvidenceEntityKind
): ExistingRecordOption[] {
  const entities = evidence[collections[kind]] as UnifiedEvidenceEntity[];
  const candidates = entities
    .filter((entity) => entity.sourceEntityId)
    .map((entity) => {
      const sourceRefs = refsFor(entity, evidence);
      return {
        entity,
        sourceRefs,
        profileBacked: isProfileBacked(sourceRefs),
        fingerprint: primaryEntityIdentityFingerprint(kind, {
          representationId: entity.id,
          kind,
          label: entity.label,
          details: entity.details,
          evidenceIds: entity.evidenceIds,
          sourceRefs,
        }),
      };
    });
  const byFingerprint = new Map<string, typeof candidates>();
  for (const candidate of candidates) {
    const group = byFingerprint.get(candidate.fingerprint) ?? [];
    group.push(candidate);
    byFingerprint.set(candidate.fingerprint, group);
  }

  return [...byFingerprint.entries()].map(([fingerprint, group]) => {
    const chosen = group.find((candidate) => candidate.profileBacked) ?? group[0];
    const sourceEntityId = chosen.entity.sourceEntityId!;
    const origin = chosen.profileBacked ? 'CAREER_PROFILE' as const : 'SOURCE_CV' as const;
    const type = kind.toLocaleLowerCase('en-GB');
    return {
      key: origin === 'CAREER_PROFILE'
        ? `${type}:${sourceEntityId}`
        : `${type}:source-cv:${generationId}:${encodedFingerprint(fingerprint)}`,
      entityKind: kind,
      entityId: sourceEntityId,
      label: canonicalLabel(kind, chosen.entity),
      origin,
      promotable: origin === 'SOURCE_CV',
      details: chosen.entity.details,
      promotionData: canonicalEntityData(kind, chosen.entity.details),
      sourceEntityIds: [...new Set(group.map((candidate) => candidate.entity.sourceEntityId!))],
      sourceRefs: [...new Map(group.flatMap((candidate) => candidate.sourceRefs).map((ref) => [
        [ref.sourceType, ref.entityType, ref.entityId, ref.fieldPath, ref.snapshotId ?? ''].join('|'), ref,
      ])).values()],
    };
  });
}
