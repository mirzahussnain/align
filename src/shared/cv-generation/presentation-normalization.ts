import { groupEntityRepresentations, stablePresentationEntityId, type EntityIdentityRepresentation, type NormalizableEntityKind } from './entity-identity';
import { selectAuthoritativeField, type NormalizationAuthorityContext, type StructuralFieldCandidate } from './presentation-authority';
import type {
  CvEvidenceBinding,
  CvPresentationCertification,
  CvPresentationEducation,
  CvPresentationExperience,
  CvPresentationOpenSource,
  CvPresentationOtherEvidence,
  CvPresentationProject,
  CvPresentationTraining,
  CvPresentationVolunteerExperience,
} from './build-spec-types';
import type { CandidateEvidenceItem, EvidenceKind, EvidenceSourceType, UnifiedCandidateEvidence, UnifiedEvidenceEntity } from './types';

export interface NormalizationInput {
  evidence: UnifiedCandidateEvidence;
  selectedEvidenceIds: Set<string>;
  patches: Map<string, string>;
  authorityContext: NormalizationAuthorityContext;
}

export interface NormalizedEntitySections {
  experience: CvPresentationExperience[];
  projects: CvPresentationProject[];
  education: CvPresentationEducation[];
  certifications: CvPresentationCertification[];
  training: CvPresentationTraining[];
  volunteering: CvPresentationVolunteerExperience[];
  openSource: CvPresentationOpenSource[];
  other: CvPresentationOtherEvidence[];
  bindings: CvEvidenceBinding[];
  entityAliasIndex: Map<string, string>;
}

interface ContextualRepresentation extends EntityIdentityRepresentation {
  sourceType: EvidenceSourceType;
  snapshotId?: string;
}

const collectionByKind: Record<NormalizableEntityKind, keyof UnifiedCandidateEvidence> = {
  EXPERIENCE: 'employment', PROJECT: 'projects', EDUCATION: 'education', CERTIFICATION: 'certifications',
  TRAINING: 'training', VOLUNTEERING: 'volunteerExperience', OPEN_SOURCE: 'openSource', OTHER: 'otherEvidence',
};

const evidenceKindToEntityKind: Partial<Record<EvidenceKind, NormalizableEntityKind>> = {
  EMPLOYMENT: 'EXPERIENCE', PROJECT: 'PROJECT', EDUCATION: 'EDUCATION', CERTIFICATION: 'CERTIFICATION',
  TRAINING: 'TRAINING', VOLUNTEER: 'VOLUNTEERING', OPEN_SOURCE: 'OPEN_SOURCE', OTHER: 'OTHER',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function itemContext(item: CandidateEvidenceItem): Pick<ContextualRepresentation, 'sourceType' | 'snapshotId'> {
  const ref = [...item.sourceRefs].sort((a, b) => `${a.sourceType}:${a.entityId}`.localeCompare(`${b.sourceType}:${b.entityId}`))[0];
  return { sourceType: item.provenance, snapshotId: ref?.snapshotId };
}

function representationsFor(kind: NormalizableEntityKind, input: NormalizationInput): ContextualRepresentation[] {
  const entities = input.evidence[collectionByKind[kind]] as UnifiedEvidenceEntity[];
  const result: ContextualRepresentation[] = [];
  for (const entity of entities) {
    for (const evidenceId of entity.evidenceIds.filter((id) => input.selectedEvidenceIds.has(id)).sort()) {
      const item = input.evidence.evidenceById[evidenceId];
      if (!item) continue;
      const context = itemContext(item);
      result.push({
        representationId: `${entity.id}:${evidenceId}`,
        kind,
        canonicalEntityId: ['CAREER_PROFILE', 'PROFILE_EVIDENCE', 'HITL'].includes(context.sourceType) ? entity.sourceEntityId : undefined,
        sourceEntityId: entity.sourceEntityId,
        label: entity.label,
        details: entity.details,
        evidenceIds: [evidenceId],
        sourceRefs: item.sourceRefs,
        ...context,
      });
    }
  }
  for (const evidenceId of [...input.selectedEvidenceIds].sort()) {
    const item = input.evidence.evidenceById[evidenceId];
    if (!item || evidenceKindToEntityKind[item.kind] !== kind || !isRecord(item.canonicalData)) continue;
    const context = itemContext(item);
    const ref = item.sourceRefs[0];
    result.push({
      representationId: `evidence:${evidenceId}`,
      kind,
      canonicalEntityId: ['CAREER_PROFILE', 'PROFILE_EVIDENCE', 'HITL'].includes(context.sourceType) ? item.sourceEntityId ?? ref?.entityId : undefined,
      sourceEntityId: item.sourceEntityId ?? ref?.entityId,
      label: item.canonicalText,
      details: item.canonicalData,
      evidenceIds: [evidenceId],
      sourceRefs: item.sourceRefs,
      ...context,
    });
  }
  return result;
}

function raw(details: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = details[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

function strings(details: Record<string, unknown>, key: string): string[] {
  const value = details[key];
  return Array.isArray(value) ? [...new Set(value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim()))] : [];
}

function field(group: ContextualRepresentation[], keys: string[], input: NormalizationInput): string | undefined {
  const candidates = group.flatMap((representation): StructuralFieldCandidate<string>[] => {
    const value = raw(representation.details, keys);
    return value ? [{
      value,
      representationId: representation.representationId,
      sourceType: representation.sourceType,
      snapshotId: representation.snapshotId,
      canonicalEntityId: representation.canonicalEntityId,
      supportKeys: representation.evidenceIds,
    }] : [];
  });
  return selectAuthoritativeField(candidates, input.authorityContext);
}

function normalizeKind(kind: NormalizableEntityKind, input: NormalizationInput) {
  const representations = representationsFor(kind, input);
  const contexts = new Map(representations.map((representation) => [representation.representationId, representation]));
  return groupEntityRepresentations(representations).map((group) => {
    const members = group.representations.map((item) => contexts.get(item.representationId)!).filter(Boolean);
    const id = stablePresentationEntityId(group);
    const evidenceIds = [...new Set(members.flatMap((item) => item.evidenceIds))].sort();
    return { id, members, evidenceIds, aliases: group.aliases };
  });
}

const base = (id: string) => ({ id, lines: [], links: [] });

export function normalizeEntitySections(input: NormalizationInput): NormalizedEntitySections {
  const bindings: CvEvidenceBinding[] = [];
  const entityAliasIndex = new Map<string, string>();
  const groups = <T>(kind: NormalizableEntityKind, mapper: (id: string, members: ContextualRepresentation[]) => T | null): T[] =>
    normalizeKind(kind, input).flatMap(({ id, members, evidenceIds, aliases }) => {
      const item = mapper(id, members);
      if (!item) return [];
      bindings.push({ nodeId: id, evidenceIds });
      for (const alias of aliases) entityAliasIndex.set(alias.value, id);
      for (const member of members) {
        entityAliasIndex.set(member.representationId, id);
        if (member.sourceEntityId) entityAliasIndex.set(member.sourceEntityId, id);
        if (member.canonicalEntityId) entityAliasIndex.set(member.canonicalEntityId, id);
      }
      return [item];
    });

  const experience = groups('EXPERIENCE', (id, members) => {
    const title = field(members, ['title', 'jobTitle'], input);
    const employer = field(members, ['employer', 'company'], input);
    return title && employer ? { ...base(id), title, employer, location: field(members, ['location'], input), employmentType: field(members, ['employmentType', 'type'], input), startDate: field(members, ['startDate'], input), endDate: field(members, ['endDate'], input) } : null;
  });
  const projects = groups('PROJECT', (id, members) => {
    const name = field(members, ['name', 'projectName'], input);
    if (!name) return null;
    const ordered = [...members].sort((a, b) => a.representationId.localeCompare(b.representationId));
    const technologies = [...new Set(ordered.flatMap((member) => strings(member.details, 'technologies')))];
    return { ...base(id), name, subtitle: field(members, ['subtitle', 'description', 'purpose'], input), startDate: field(members, ['startDate'], input), endDate: field(members, ['endDate'], input), technologies };
  });
  const education = groups('EDUCATION', (id, members) => {
    const degree = field(members, ['degree', 'qualification'], input);
    const institution = field(members, ['university', 'institution'], input);
    return degree && institution ? { ...base(id), degree, institution, location: field(members, ['location'], input), startDate: field(members, ['startDate'], input), endDate: field(members, ['endDate'], input), grade: field(members, ['grade'], input) } : null;
  });
  const certifications = groups('CERTIFICATION', (id, members) => {
    const name = field(members, ['name', 'officialName'], input);
    return name ? { ...base(id), name, issuer: field(members, ['issuer', 'issuingBody'], input), issueDate: field(members, ['issueDate'], input), expiryDate: field(members, ['expiryDate'], input), credentialId: field(members, ['credentialId', 'credentialNumber'], input), credentialUrl: field(members, ['credentialUrl', 'verificationUrl'], input) } : null;
  });
  const training = groups('TRAINING', (id, members) => {
    const course = field(members, ['course'], input);
    return course ? { ...base(id), course, provider: field(members, ['provider'], input), field: field(members, ['field'], input), status: field(members, ['status'], input), startDate: field(members, ['startDate'], input), endDate: field(members, ['endDate'], input), result: field(members, ['result'], input) } : null;
  });
  const volunteering = groups('VOLUNTEERING', (id, members) => {
    const role = field(members, ['role'], input);
    const organisation = field(members, ['organisation', 'organization'], input);
    return role && organisation ? { ...base(id), role, organisation, startDate: field(members, ['startDate'], input), endDate: field(members, ['endDate'], input) } : null;
  });
  const openSource = groups('OPEN_SOURCE', (id, members) => {
    const projectName = field(members, ['projectName', 'name'], input);
    return projectName ? { ...base(id), projectName, role: field(members, ['role'], input), repositoryUrl: field(members, ['repositoryUrl'], input), projectUrl: field(members, ['projectUrl'], input), startDate: field(members, ['startDate'], input), endDate: field(members, ['endDate'], input), description: field(members, ['description'], input), technologies: [...new Set(members.flatMap((member) => strings(member.details, 'technologies')))] } : null;
  });
  const other = groups('OTHER', (id, members) => {
    const title = field(members, ['title'], input);
    return title ? { ...base(id), title, context: field(members, ['context'], input), period: field(members, ['period'], input) } : null;
  });
  return { experience, projects, education, certifications, training, volunteering, openSource, other, bindings, entityAliasIndex };
}
