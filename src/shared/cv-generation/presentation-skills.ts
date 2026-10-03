import type { CvEvidenceBinding, CvPresentationSkillGroup } from './build-spec-types';
import { normalizeIdentityText } from './entity-identity';
import { selectAuthoritativeField, type StructuralFieldCandidate } from './presentation-authority';
import type { NormalizationInput } from './presentation-normalization';
import type { UnifiedSkill } from './types';

export interface PresentationSkillInput extends NormalizationInput {
  sparseSkillArtifacts?: Array<{ skillName: string; evidenceIds: string[] }>;
}

export interface PresentationSkillResult {
  groups: CvPresentationSkillGroup[];
  bindings: CvEvidenceBinding[];
  skillAliases: Map<string, string>;
}

interface SkillRepresentation {
  skill: UnifiedSkill;
  evidenceId: string;
}

export function normalizePresentationSkills(input: PresentationSkillInput): PresentationSkillResult {
  const byName = new Map<string, SkillRepresentation[]>();
  for (const skill of input.evidence.skills) {
    for (const evidenceId of skill.evidenceIds.filter((id) => input.selectedEvidenceIds.has(id)).sort()) {
      const key = normalizeIdentityText(skill.name);
      if (!key) continue;
      byName.set(key, [...(byName.get(key) ?? []), { skill, evidenceId }]);
    }
  }

  const bindings: CvEvidenceBinding[] = [];
  const skillAliases = new Map<string, string>();
  const normalizedSkills: Array<{ id: string; name: string; category: string }> = [];
  for (const [nameKey, representations] of [...byName.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const candidates = representations.map(({ skill, evidenceId }): StructuralFieldCandidate<string> => {
      const evidence = input.evidence.evidenceById[evidenceId];
      return {
        value: skill.category,
        representationId: skill.id,
        sourceType: evidence.provenance,
        snapshotId: evidence.sourceRefs[0]?.snapshotId,
        canonicalEntityId: evidence.provenance === 'SOURCE_CV' ? undefined : skill.sourceEntityId,
        supportKeys: [evidenceId],
      };
    }).filter(({ value }) => value.trim().length > 0);
    const canonicalIds = representations.flatMap(({ skill, evidenceId }) => {
      const source = input.evidence.evidenceById[evidenceId]?.provenance;
      return source && source !== 'SOURCE_CV' && skill.sourceEntityId ? [skill.sourceEntityId] : [];
    }).sort();
    const id = canonicalIds[0] ?? `skill:${nameKey}`;
    const displayName = [...representations].sort((left, right) => {
      const leftCanonical = input.evidence.evidenceById[left.evidenceId]?.provenance === 'SOURCE_CV' ? 1 : 0;
      const rightCanonical = input.evidence.evidenceById[right.evidenceId]?.provenance === 'SOURCE_CV' ? 1 : 0;
      return leftCanonical - rightCanonical || left.skill.name.localeCompare(right.skill.name) || left.skill.id.localeCompare(right.skill.id);
    })[0].skill.name.trim();
    const category = selectAuthoritativeField(candidates, input.authorityContext) ?? 'Skills';
    const artifactIds = (input.sparseSkillArtifacts ?? []).filter(({ skillName }) => normalizeIdentityText(skillName) === nameKey).flatMap(({ evidenceIds }) => evidenceIds);
    const evidenceIds = [...new Set([...representations.map(({ evidenceId }) => evidenceId), ...artifactIds])].sort();
    bindings.push({ nodeId: id, evidenceIds });
    normalizedSkills.push({ id, name: displayName, category });
    skillAliases.set(nameKey, id);
    for (const { skill } of representations) {
      skillAliases.set(skill.id, id);
      if (skill.sourceEntityId) skillAliases.set(skill.sourceEntityId, id);
    }
  }

  const grouped = new Map<string, { category: string; skills: Array<{ id: string; name: string }> }>();
  for (const skill of normalizedSkills) {
    const key = normalizeIdentityText(skill.category);
    const group = grouped.get(key) ?? { category: skill.category, skills: [] };
    group.skills.push({ id: skill.id, name: skill.name });
    grouped.set(key, group);
  }
  const groups = [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([key, group]) => ({
    id: `skill-category:${key}`,
    category: group.category,
    skills: group.skills.sort((left, right) => normalizeIdentityText(left.name).localeCompare(normalizeIdentityText(right.name)) || left.id.localeCompare(right.id)),
  }));
  return { groups, bindings, skillAliases };
}
