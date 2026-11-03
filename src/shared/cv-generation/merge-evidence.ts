import type {
  CandidateEvidenceItem,
  EvidenceConflict,
  EvidenceSourceRef,
  UnifiedCandidateEvidence,
  UnifiedEvidenceEntity,
} from './types';

const normalized = (value: string) => value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-GB');
const stableJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
};

const refKey = (ref: EvidenceSourceRef) => [ref.sourceType, ref.entityType, ref.entityId, ref.fieldPath, ref.snapshotId ?? ''].join('|');
const itemKey = (item: CandidateEvidenceItem) => [item.kind, item.field, normalized(item.canonicalText), stableJson(item.canonicalData)].join('|');

function mergeStrings(left: string[], right: string[]): string[] {
  return [...new Set([...left, ...right])];
}

function mergeRefs(left: EvidenceSourceRef[], right: EvidenceSourceRef[]): EvidenceSourceRef[] {
  const refs = new Map(left.map((ref) => [refKey(ref), ref]));
  for (const ref of right) refs.set(refKey(ref), ref);
  return [...refs.values()];
}

function mergeEntities<T extends UnifiedEvidenceEntity>(groups: T[][], aliases: Map<string, string>): T[] {
  const entities = new Map<string, T>();
  for (const group of groups) {
    for (const entity of group) {
      const evidenceIds = [...new Set(entity.evidenceIds.map((id) => aliases.get(id) ?? id))];
      const prior = entities.get(entity.id);
      entities.set(entity.id, prior ? { ...prior, evidenceIds: mergeStrings(prior.evidenceIds, evidenceIds) } : { ...entity, evidenceIds });
    }
  }
  return [...entities.values()];
}

export function emptyCandidateEvidence(): UnifiedCandidateEvidence {
  return {
    schemaVersion: 1,
    identity: {}, contact: {}, professionalLinks: [], employment: [], projects: [], education: [],
    certifications: [], training: [], volunteerExperience: [], openSource: [], skills: [], achievements: [],
    otherEvidence: [], evidenceById: {}, sourceRefs: [], conflicts: [],
  };
}

export function mergeCandidateEvidence(sources: UnifiedCandidateEvidence[]): UnifiedCandidateEvidence {
  const evidenceById: Record<string, CandidateEvidenceItem> = {};
  const byValue = new Map<string, string>();
  const aliases = new Map<string, string>();

  for (const source of sources) {
    for (const item of Object.values(source.evidenceById)) {
      const key = itemKey(item);
      const existingId = byValue.get(key);
      if (!existingId) {
        evidenceById[item.id] = { ...item, requirementIds: [...new Set(item.requirementIds)], sourceRefs: mergeRefs([], item.sourceRefs) };
        byValue.set(key, item.id);
        aliases.set(item.id, item.id);
        continue;
      }
      aliases.set(item.id, existingId);
      const existing = evidenceById[existingId];
      evidenceById[existingId] = {
        ...existing,
        requirementIds: mergeStrings(existing.requirementIds, item.requirementIds),
        sourceRefs: mergeRefs(existing.sourceRefs, item.sourceRefs),
      };
    }
  }

  const conflicts: EvidenceConflict[] = [];
  const conflictsByKey = new Map<string, CandidateEvidenceItem[]>();
  for (const item of Object.values(evidenceById)) {
    if (!item.conflictKey) continue;
    const group = conflictsByKey.get(item.conflictKey) ?? [];
    group.push(item);
    conflictsByKey.set(item.conflictKey, group);
  }
  for (const [key, items] of conflictsByKey) {
    if (new Set(items.map((item) => normalized(item.canonicalText))).size > 1) {
      conflicts.push({ key, evidenceIds: items.map((item) => item.id), reason: 'DIFFERENT_AUTHORITATIVE_VALUES' });
    }
  }

  const sourceRefs = mergeRefs(
    sources.flatMap((source) => source.sourceRefs),
    Object.values(evidenceById).flatMap((item) => item.sourceRefs)
  );
  const links = new Map<string, UnifiedCandidateEvidence['professionalLinks'][number]>();
  for (const source of sources) for (const link of source.professionalLinks) {
    const evidenceId = aliases.get(link.evidenceId) ?? link.evidenceId;
    links.set(`${link.type}|${normalized(link.url)}|${link.projectId ?? ''}`, { ...link, evidenceId });
  }

  return {
    schemaVersion: 1,
    identity: Object.assign({}, ...sources.map((source) => source.identity), {
      evidenceIds: mergeStrings([], sources.flatMap((source) => source.identity.evidenceIds ?? []).map((id) => aliases.get(id) ?? id)),
    }),
    contact: Object.assign({}, ...sources.map((source) => source.contact), {
      evidenceIds: mergeStrings([], sources.flatMap((source) => source.contact.evidenceIds ?? []).map((id) => aliases.get(id) ?? id)),
    }),
    professionalLinks: [...links.values()],
    employment: mergeEntities(sources.map((source) => source.employment), aliases),
    projects: mergeEntities(sources.map((source) => source.projects), aliases),
    education: mergeEntities(sources.map((source) => source.education), aliases),
    certifications: mergeEntities(sources.map((source) => source.certifications), aliases),
    training: mergeEntities(sources.map((source) => source.training), aliases),
    volunteerExperience: mergeEntities(sources.map((source) => source.volunteerExperience), aliases),
    openSource: mergeEntities(sources.map((source) => source.openSource), aliases),
    skills: mergeEntities(sources.map((source) => source.skills), aliases),
    achievements: mergeEntities(sources.map((source) => source.achievements), aliases),
    otherEvidence: mergeEntities(sources.map((source) => source.otherEvidence), aliases),
    evidenceById,
    sourceRefs,
    conflicts: [...sources.flatMap((source) => source.conflicts), ...conflicts],
  };
}
