import { stableEvidenceId } from './evidence-id';
import { semanticFamily, semanticTokens } from './requirements';
import type { GenerationRequirement, RequirementReconciliationSnapshot, SemanticGapGroup } from './types';

function similarity(left: string, right: string): number {
  const a = semanticTokens(left);
  const b = semanticTokens(right);
  const union = new Set([...a, ...b]);
  if (!union.size) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  return intersection / union.size;
}

export function clusterMaterialGaps(requirements: GenerationRequirement[], reconciliation: RequirementReconciliationSnapshot): SemanticGapGroup[] {
  const unresolved = new Set(reconciliation.items.filter((item) => item.status === 'MISSING' || item.status === 'PARTIAL' || item.status === 'CONFLICTED').map((item) => item.requirementId));
  const candidates = requirements.filter((requirement) => unresolved.has(requirement.id));
  const groups: GenerationRequirement[][] = [];
  for (const requirement of candidates) {
    const family = semanticFamily(requirement.text);
    const group = groups.find((existing) => existing.some((member) => {
      const memberFamily = semanticFamily(member.text);
      return (family && memberFamily === family) || similarity(requirement.text, member.text) >= 0.35;
    }));
    if (group) group.push(requirement);
    else groups.push([requirement]);
  }
  return groups.map((group) => {
    const family = group.map((item) => semanticFamily(item.text)).find(Boolean);
    const label = family === 'api-development-integration' ? 'API development & integration'
      : family === 'database-development' ? 'Database development'
        : family === 'cloud-deployment' ? 'Cloud deployment'
          : family === 'csharp-dotnet' ? 'C# / .NET experience'
            : group[0].text;
    return {
      id: stableEvidenceId('gap-group', ...group.map((item) => item.id).sort()),
      label,
      requirementIds: group.map((item) => item.id),
      importance: group.some((item) => item.importance === 'MANDATORY') ? 'MANDATORY' : 'DESIRABLE',
    };
  });
}
