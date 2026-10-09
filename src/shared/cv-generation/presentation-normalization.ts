import { groupEntityRepresentations, stablePresentationEntityId, type EntityIdentityRepresentation, type NormalizableEntityKind } from './entity-identity';
import { authorityFor, selectAuthoritativeField, type NormalizationAuthorityContext, type StructuralFieldCandidate, type StructuralFieldValidation } from './presentation-authority';
import type {
  CvEvidenceBinding,
  CvPresentationCertification,
  CvPresentationEducation,
  CvPresentationExperience,
  CvPresentationOpenSource,
  CvPresentationOtherEvidence,
  CvPresentationLine,
  CvPresentationProject,
  CvPresentationTraining,
  CvPresentationVolunteerExperience,
} from './build-spec-types';
import type { CandidateEvidenceItem, EvidenceKind, EvidenceSourceType, UnifiedCandidateEvidence, UnifiedEvidenceEntity } from './types';
import { isPatchableEvidence } from './patchable-evidence';
import { normalizeIdentityText } from './entity-identity';

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
  issues: NormalizationIssue[];
  sparseSkillArtifacts: Array<{ skillName: string; evidenceIds: string[] }>;
}

export interface NormalizationIssue {
  code: 'AMBIGUOUS_EVIDENCE_ENTITY' | 'UNRESOLVED_EVIDENCE_ENTITY';
  evidenceId: string;
}

export interface AssignableEntityGroup {
  id: string;
  aliases: string[];
}

export interface EvidenceAssignmentResult {
  assignments: Map<string, CandidateEvidenceItem[]>;
  issues: NormalizationIssue[];
}

interface ContextualRepresentation extends EntityIdentityRepresentation {
  entityId: string;
  sourceType: EvidenceSourceType;
  snapshotId?: string;
  collectionOrder: number;
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
  for (const [collectionOrder, entity] of entities.entries()) {
    for (const evidenceId of entity.evidenceIds.filter((id) => input.selectedEvidenceIds.has(id))) {
      const item = input.evidence.evidenceById[evidenceId];
      if (!item) continue;
      const context = itemContext(item);
      result.push({
        representationId: `${entity.id}:${evidenceId}`,
        entityId: entity.id,
        kind,
        canonicalEntityId: ['CAREER_PROFILE', 'PROFILE_EVIDENCE', 'HITL'].includes(context.sourceType) ? entity.sourceEntityId : undefined,
        sourceEntityId: entity.sourceEntityId,
        label: entity.label,
        details: entity.details,
        evidenceIds: [evidenceId],
        sourceRefs: item.sourceRefs,
        collectionOrder,
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
      entityId: `evidence:${evidenceId}`,
      kind,
      canonicalEntityId: ['CAREER_PROFILE', 'PROFILE_EVIDENCE', 'HITL'].includes(context.sourceType) ? item.sourceEntityId ?? ref?.entityId : undefined,
      sourceEntityId: item.sourceEntityId ?? ref?.entityId,
      label: item.canonicalText,
      details: item.canonicalData,
      evidenceIds: [evidenceId],
      sourceRefs: item.sourceRefs,
      collectionOrder: Number.MAX_SAFE_INTEGER,
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

function booleanField(
  group: ContextualRepresentation[],
  key: string,
  input: NormalizationInput
): boolean | undefined {
  const candidates = group.flatMap((representation): StructuralFieldCandidate<boolean>[] => {
    const value = representation.details[key];
    return typeof value === 'boolean' ? [{
      value,
      representationId: representation.representationId,
      sourceType: representation.sourceType,
      snapshotId: representation.snapshotId,
      canonicalEntityId: representation.canonicalEntityId,
      supportKeys: representation.evidenceIds,
    }] : [];
  });
  return selectAuthoritativeField(candidates, input.authorityContext, {
    normalize: (value) => String(value),
  });
}

function strings(details: Record<string, unknown>, key: string): string[] {
  const value = details[key];
  return Array.isArray(value) ? [...new Set(value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim()))] : [];
}

function field(group: ContextualRepresentation[], keys: string[], input: NormalizationInput, validation?: StructuralFieldValidation<string>): string | undefined {
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
  return selectAuthoritativeField(candidates, input.authorityContext, validation);
}

const dateValidation: StructuralFieldValidation<string> = {
  isValid: (value) => !/^\d{4}-\d{2}$/.test(value) || /^\d{4}-(0[1-9]|1[0-2])$/.test(value),
};

const dateField = (group: ContextualRepresentation[], key: 'startDate' | 'endDate' | 'issueDate' | 'expiryDate', input: NormalizationInput) => field(group, [key], input, dateValidation);

function normalizeKind(kind: NormalizableEntityKind, input: NormalizationInput) {
  const representations = representationsFor(kind, input);
  const contexts = new Map(representations.map((representation) => [representation.representationId, representation]));
  const evidenceOrder = new Map<string, number>();
  const entities = input.evidence[collectionByKind[kind]] as UnifiedEvidenceEntity[];
  for (const entity of entities) for (const evidenceId of entity.evidenceIds) {
    if (!evidenceOrder.has(evidenceId)) evidenceOrder.set(evidenceId, evidenceOrder.size);
  }
  return groupEntityRepresentations(representations).map((group) => {
    const members = group.representations.map((item) => contexts.get(item.representationId)!).filter(Boolean);
    const id = stablePresentationEntityId(group);
    const evidenceIds = [...new Set(members.flatMap((item) => item.evidenceIds))].sort((left, right) =>
      (evidenceOrder.get(left) ?? Number.MAX_SAFE_INTEGER) - (evidenceOrder.get(right) ?? Number.MAX_SAFE_INTEGER)
      || left.localeCompare(right)
    );
    const order = selectAuthoritativeField(members.map((member): StructuralFieldCandidate<number> => ({
      value: typeof member.details.sortOrder === 'number'
        ? member.details.sortOrder
        : typeof member.details.sourceOrder === 'number' ? member.details.sourceOrder : member.collectionOrder,
      representationId: member.representationId,
      sourceType: member.sourceType,
      snapshotId: member.snapshotId,
      canonicalEntityId: member.canonicalEntityId,
      supportKeys: member.evidenceIds,
    })), input.authorityContext, { normalize: (value) => value.toString().padStart(12, '0') });
    return { id, members, evidenceIds, aliases: group.aliases, order };
  }).sort((left, right) => (left.order ?? Number.MAX_SAFE_INTEGER) - (right.order ?? Number.MAX_SAFE_INTEGER) || left.id.localeCompare(right.id));
}

const base = (id: string) => ({ id, lines: [], links: [] });

function normalizePresentationText(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/gu, ' ');
}

function boundarySignature(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('en').replace(/[^\p{L}\p{N}]+/gu, '');
}

function selectEquivalentBoundarySet(
  items: CandidateEvidenceItem[],
  sourceOrder: Map<string, number>,
  authorityContext: NormalizationAuthorityContext
): { items: CandidateEvidenceItem[]; equivalentIds: Map<string, string[]> } {
  const eligible = items.filter((item) => item.provenance === 'SOURCE_CV' || item.provenance === 'CAREER_PROFILE');
  const partitions = new Map<string, CandidateEvidenceItem[]>();
  for (const item of eligible) {
    const ref = item.sourceRefs.find((candidate) => candidate.sourceType === item.provenance) ?? item.sourceRefs[0];
    const key = [item.provenance, ref?.snapshotId ?? '', item.sourceEntityId ?? ref?.entityId ?? ''].join(':');
    partitions.set(key, [...(partitions.get(key) ?? []), item]);
  }
  const candidates = [...partitions.values()].map((partition) => {
    const ordered = [...partition].sort((left, right) =>
      (sourceOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (sourceOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER)
      || left.id.localeCompare(right.id)
    );
    return { items: ordered, signature: boundarySignature(ordered.map(({ canonicalText }) => canonicalText).join('')) };
  }).filter(({ signature }) => signature.length > 0);
  const equivalentIds = new Map<string, string[]>();
  const suppressed = new Set<string>();
  for (const signature of new Set(candidates.map((candidate) => candidate.signature))) {
    const equivalent = candidates.filter((candidate) => candidate.signature === signature);
    if (equivalent.length < 2) continue;
    const chosen = [...equivalent].sort((left, right) => {
      const sourceRank = Number(left.items[0]?.provenance !== 'SOURCE_CV') - Number(right.items[0]?.provenance !== 'SOURCE_CV');
      if (sourceRank) return sourceRank;
      const rank = ['CURRENT_PROFILE', 'CANONICAL_REUSABLE', 'APPLICATION_ENTITY', 'MATCH_PROFILE', 'EXTRACTED', 'SAFE_FALLBACK'];
      const authority = (candidate: CandidateEvidenceItem) => {
        const ref = candidate.sourceRefs[0];
        return rank.indexOf(authorityFor({
          value: candidate.canonicalText,
          representationId: candidate.id,
          sourceType: candidate.provenance,
          snapshotId: ref?.snapshotId,
          canonicalEntityId: candidate.sourceEntityId,
          supportKeys: [candidate.id],
        }, authorityContext));
      };
      return authority(left.items[0]!) - authority(right.items[0]!);
    })[0]!;
    for (const redundant of equivalent.filter((candidate) => candidate !== chosen).flatMap((candidate) => candidate.items)) {
      suppressed.add(redundant.id);
      const redundantSignature = boundarySignature(redundant.canonicalText);
      const owner = chosen.items.find((candidate) => boundarySignature(candidate.canonicalText).includes(redundantSignature))
        ?? chosen.items[0];
      if (owner) equivalentIds.set(owner.id, [...(equivalentIds.get(owner.id) ?? []), redundant.id]);
    }
  }
  return { items: items.filter(({ id }) => !suppressed.has(id)), equivalentIds };
}

export function dedupePresentationLines(
  items: CandidateEvidenceItem[],
  patches: Map<string, string>,
  authorityContext: NormalizationAuthorityContext,
  orderedEvidenceIds: string[] = []
): { lines: import('./build-spec-types').CvPresentationLine[]; bindings: CvEvidenceBinding[] } {
  const sourceOrder = new Map(orderedEvidenceIds.map((id, index) => [id, index]));
  const uniqueById = [...new Map(items.map((item) => [item.id, item])).values()];
  const boundarySelection = selectEquivalentBoundarySet(uniqueById, sourceOrder, authorityContext);
  const byText = new Map<string, CandidateEvidenceItem[]>();
  for (const item of boundarySelection.items) {
    const key = normalizeIdentityText(item.canonicalText);
    byText.set(key, [...(byText.get(key) ?? []), item]);
  }
  const groups = [...byText.values()].map((duplicates) => {
    const representative = [...duplicates].sort((left, right) => {
      const leftRef = left.sourceRefs[0];
      const rightRef = right.sourceRefs[0];
      const leftAuthority = authorityFor({ value: left.canonicalText, representationId: left.id, sourceType: left.provenance, snapshotId: leftRef?.snapshotId, canonicalEntityId: left.sourceEntityId, supportKeys: [left.id] }, authorityContext);
      const rightAuthority = authorityFor({ value: right.canonicalText, representationId: right.id, sourceType: right.provenance, snapshotId: rightRef?.snapshotId, canonicalEntityId: right.sourceEntityId, supportKeys: [right.id] }, authorityContext);
      const rank = ['CURRENT_PROFILE', 'CANONICAL_REUSABLE', 'APPLICATION_ENTITY', 'MATCH_PROFILE', 'EXTRACTED', 'SAFE_FALLBACK'];
      return rank.indexOf(leftAuthority) - rank.indexOf(rightAuthority) || left.id.localeCompare(right.id);
    })[0];
    const evidenceIds = [...new Set(duplicates.flatMap(({ id }) => [
      id,
      ...(boundarySelection.equivalentIds.get(id) ?? []),
    ]))].sort();
    return {
      line: { id: representative.id, text: normalizePresentationText(patches.get(representative.id) ?? representative.canonicalText) },
      binding: { nodeId: `line:${representative.id}`, evidenceIds, representativeEvidenceId: representative.id },
      order: Math.min(...duplicates.map(({ id }) => sourceOrder.get(id) ?? Number.MAX_SAFE_INTEGER)),
    };
  }).sort((a, b) => a.order - b.order || a.line.id.localeCompare(b.line.id));
  return { lines: groups.map(({ line }) => line), bindings: groups.map(({ binding }) => binding) };
}

export function assignPositiveEvidence(
  groups: AssignableEntityGroup[],
  input: NormalizationInput,
  kind?: NormalizableEntityKind
): EvidenceAssignmentResult {
  const assignments = new Map<string, CandidateEvidenceItem[]>();
  const issues: NormalizationIssue[] = [];
  for (const evidenceId of [...input.selectedEvidenceIds].sort()) {
    const item = input.evidence.evidenceById[evidenceId];
    if (!item || item.field === 'summary' || !isPatchableEvidence(item)) continue;
    const references = new Set([item.sourceEntityId, ...item.sourceRefs.map(({ entityId }) => entityId)].filter((id): id is string => Boolean(id)));
    const matches = groups.filter((group) => group.aliases.some((alias) => references.has(alias)));
    const referencedKinds = new Set(item.sourceRefs.map(({ entityType }) => entityType));
    const referencesThisKind = kind === 'EXPERIENCE'
      ? referencedKinds.has('EXPERIENCE') || referencedKinds.has('EMPLOYMENT')
      : kind ? referencedKinds.has(kind) : false;
    if (matches.length > 1) {
      issues.push({ code: 'AMBIGUOUS_EVIDENCE_ENTITY', evidenceId });
      continue;
    }
    if (matches[0]) assignments.set(matches[0].id, [...(assignments.get(matches[0].id) ?? []), item]);
    else if (referencesThisKind) issues.push({ code: 'UNRESOLVED_EVIDENCE_ENTITY', evidenceId });
  }
  return { assignments, issues };
}

export function normalizeEntitySections(input: NormalizationInput): NormalizedEntitySections {
  const bindings: CvEvidenceBinding[] = [];
  const entityAliasIndex = new Map<string, string>();
  const issues: NormalizationIssue[] = [];
  const sparseSkillArtifacts: Array<{ skillName: string; evidenceIds: string[] }> = [];
  const sparseProjectCandidates = new Map<string, { skillName: string; evidenceIds: string[] }>();
  const groups = <T>(kind: NormalizableEntityKind, mapper: (id: string, members: ContextualRepresentation[], positiveItems: CandidateEvidenceItem[], evidenceIds: string[]) => T | null): T[] => {
    const normalized = normalizeKind(kind, input);
    const assignable = normalized.map(({ id, members, aliases }) => ({
      id,
      aliases: [...new Set([id, ...aliases.map(({ value }) => value), ...members.flatMap((member) => [member.entityId, member.sourceEntityId, member.canonicalEntityId, ...member.sourceRefs.map(({ entityId }) => entityId)].filter((value): value is string => Boolean(value)))])],
    }));
    const assignment = assignPositiveEvidence(assignable, input, kind);
    issues.push(...assignment.issues);
    return normalized.flatMap(({ id, members, evidenceIds, aliases }) => {
      const positiveItems = assignment.assignments.get(id) ?? [];
      const item = mapper(id, members, positiveItems, evidenceIds);
      if (!item) return [];
      bindings.push({ nodeId: id, evidenceIds });
      const deduped = dedupePresentationLines(positiveItems, input.patches, input.authorityContext, evidenceIds);
      bindings.push(...deduped.bindings);
      if ('lines' in (item as object)) (item as unknown as { lines: typeof deduped.lines }).lines = deduped.lines;
      for (const alias of aliases) entityAliasIndex.set(alias.value, id);
      for (const member of members) {
        entityAliasIndex.set(member.representationId, id);
        entityAliasIndex.set(member.entityId, id);
        if (member.sourceEntityId) entityAliasIndex.set(member.sourceEntityId, id);
        if (member.canonicalEntityId) entityAliasIndex.set(member.canonicalEntityId, id);
      }
      return [item];
    });
  };

  const experience = groups('EXPERIENCE', (id, members) => {
    const title = field(members, ['title', 'jobTitle'], input);
    const employer = field(members, ['employer', 'company'], input);
    return title && employer ? { ...base(id), title, employer, location: field(members, ['location'], input), employmentType: field(members, ['employmentType', 'type'], input), startDate: dateField(members, 'startDate', input), endDate: dateField(members, 'endDate', input), current: booleanField(members, 'current', input) } : null;
  });
  const selectedSkillNames = new Set(input.evidence.skills
    .filter((skill) => skill.evidenceIds.some((evidenceId) => input.selectedEvidenceIds.has(evidenceId)))
    .map((skill) => normalizeIdentityText(skill.name)));
  let projects: CvPresentationProject[] = groups('PROJECT', (id, members, _positiveItems, evidenceIds) => {
    const name = field(members, ['name', 'projectName'], input);
    if (!name) return null;
    const memberAliases = new Set(members.flatMap((member) => [member.entityId, member.sourceEntityId, member.canonicalEntityId, ...member.sourceRefs.map(({ entityId }) => entityId)].filter((value): value is string => Boolean(value))));
    const hasSelectedProjectLink = input.evidence.professionalLinks.some((link) => link.projectId && memberAliases.has(link.projectId) && input.selectedEvidenceIds.has(link.evidenceId));
    const hasProjectIdentity = hasSelectedProjectLink || members.some((member) => ['repositoryUrl', 'liveUrl', 'projectUrl', 'startDate', 'endDate', 'subtitle', 'description', 'purpose']
      .some((key) => raw(member.details, [key])));
    const isSparseSkill = members.every((member) => member.sourceType === 'SOURCE_CV' && !member.canonicalEntityId)
      && selectedSkillNames.has(normalizeIdentityText(name))
      && !hasProjectIdentity;
    if (isSparseSkill) sparseProjectCandidates.set(id, { skillName: name, evidenceIds });
    const ordered = [...members].sort((a, b) => a.representationId.localeCompare(b.representationId));
    const technologies = [...new Set(ordered.flatMap((member) => strings(member.details, 'technologies')))];
    return { ...base(id), name, subtitle: field(members, ['subtitle', 'description', 'purpose'], input), startDate: dateField(members, 'startDate', input), endDate: dateField(members, 'endDate', input), technologies };
  });
  const education = groups('EDUCATION', (id, members) => {
    const degree = field(members, ['degree', 'qualification'], input);
    const institution = field(members, ['university', 'institution'], input);
    return degree && institution ? { ...base(id), degree, institution, location: field(members, ['location'], input), startDate: dateField(members, 'startDate', input), endDate: dateField(members, 'endDate', input), grade: field(members, ['grade'], input) } : null;
  });
  const certifications = groups('CERTIFICATION', (id, members) => {
    const name = field(members, ['name', 'officialName'], input);
    return name ? { ...base(id), name, issuer: field(members, ['issuer', 'issuingBody'], input), issueDate: dateField(members, 'issueDate', input), expiryDate: dateField(members, 'expiryDate', input), credentialId: field(members, ['credentialId', 'credentialNumber'], input), credentialUrl: field(members, ['credentialUrl', 'verificationUrl'], input) } : null;
  });
  const training = groups('TRAINING', (id, members) => {
    const course = field(members, ['course'], input);
    return course ? { ...base(id), course, provider: field(members, ['provider'], input), field: field(members, ['field'], input), status: field(members, ['status'], input), startDate: dateField(members, 'startDate', input), endDate: dateField(members, 'endDate', input), result: field(members, ['result'], input) } : null;
  });
  const volunteering = groups('VOLUNTEERING', (id, members) => {
    const role = field(members, ['role'], input);
    const organisation = field(members, ['organisation', 'organization'], input);
    return role && organisation ? { ...base(id), role, organisation, startDate: dateField(members, 'startDate', input), endDate: dateField(members, 'endDate', input) } : null;
  });
  const openSource = groups('OPEN_SOURCE', (id, members) => {
    const projectName = field(members, ['projectName', 'name'], input);
    return projectName ? { ...base(id), projectName, role: field(members, ['role'], input), repositoryUrl: field(members, ['repositoryUrl'], input), projectUrl: field(members, ['projectUrl'], input), startDate: dateField(members, 'startDate', input), endDate: dateField(members, 'endDate', input), description: field(members, ['description'], input), technologies: [...new Set(members.flatMap((member) => strings(member.details, 'technologies')))] } : null;
  });
  const other = groups('OTHER', (id, members) => {
    const title = field(members, ['title'], input);
    return title ? { ...base(id), title, context: field(members, ['context'], input), period: field(members, ['period'], input) } : null;
  });
  const lineEntities: Array<{ id: string; lines: CvPresentationLine[] }> = [
    ...experience, ...projects, ...education, ...certifications, ...training, ...volunteering, ...openSource, ...other,
  ];
  const otherLines = lineEntities
    .flatMap((entity) => entity.lines.map((line) => ({ entityId: entity.id, line })));
  projects = projects.filter((project) => {
    const candidate = sparseProjectCandidates.get(project.id);
    if (!candidate) return true;
    const replacements = project.lines.map((line) =>
      otherLines.find(({ entityId, line: otherLine }) =>
        entityId !== project.id &&
        normalizeIdentityText(otherLine.text) === normalizeIdentityText(line.text)
      )
    );
    if (replacements.some((replacement) => !replacement)) return true;
    sparseSkillArtifacts.push(candidate);
    for (const [index, replacement] of replacements.entries()) {
      if (!replacement) continue;
      const sourceBinding = bindings.find(({ nodeId }) => nodeId === 'line:' + project.lines[index].id);
      const targetBinding = bindings.find(({ nodeId }) => nodeId === 'line:' + replacement.line.id);
      if (sourceBinding && targetBinding) {
        targetBinding.evidenceIds = [...new Set([...targetBinding.evidenceIds, ...sourceBinding.evidenceIds])].sort();
      }
    }
    return false;
  });
  return { experience, projects, education, certifications, training, volunteering, openSource, other, bindings, entityAliasIndex, issues, sparseSkillArtifacts };
}
