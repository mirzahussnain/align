import { stableEvidenceId } from './evidence-id';
import { semanticFamily, semanticTokens } from './requirements';
import type {
  GenerationRequirement,
  RequirementPresentationGroup,
  RequirementReconciliationSnapshot,
  SemanticGapGroup,
} from './types';

function similarity(left: string, right: string): number {
  const a = semanticTokens(left);
  const b = semanticTokens(right);
  const union = new Set([...a, ...b]);
  if (!union.size) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  return intersection / union.size;
}

function presentationGroup(requirement: GenerationRequirement): RequirementPresentationGroup {
  if (requirement.category === 'ELIGIBILITY' || requirement.category === 'AVAILABILITY') return 'CONFIRMATION';
  if (requirement.importance === 'DESIRABLE') return 'DESIRABLE_EXTRAS';
  if (requirement.analysis?.deduction.rubric === 'MANDATORY_CORE_MISSING') return 'CORE_EVIDENCE';
  if (requirement.analysis?.deduction.rubric === 'MANDATORY_SUPPORTING_MISSING') return 'SUPPORTING_EVIDENCE';
  if (['QUALIFICATION', 'EXPERIENCE', 'SKILL', 'TOOL', 'CREDENTIAL'].includes(requirement.category)) return 'CORE_EVIDENCE';
  return 'SUPPORTING_EVIDENCE';
}

function fallbackLabel(group: GenerationRequirement[]): string {
  const upstream = group.map((item) => item.clusterLabel).find(Boolean);
  if (upstream) return upstream;
  const family = group.map((item) => semanticFamily(item.text)).find(Boolean);
  return family === 'api-development-integration' ? 'API development & integration'
    : family === 'database-development' ? 'Database development'
      : family === 'cloud-deployment' ? 'Cloud deployment'
        : family === 'csharp-dotnet' ? 'C# / .NET experience'
          : group[0].text;
}

export function clusterMaterialGaps(requirements: GenerationRequirement[], reconciliation: RequirementReconciliationSnapshot): SemanticGapGroup[] {
  const unresolved = new Set(reconciliation.items
    .filter((item) => item.status === 'MISSING' || item.status === 'PARTIAL' || item.status === 'CONFLICTED')
    .map((item) => item.requirementId));
  const candidates = requirements.filter((requirement) => unresolved.has(requirement.id));
  const groups: GenerationRequirement[][] = [];

  for (const requirement of candidates) {
    const section = presentationGroup(requirement);
    const family = semanticFamily(requirement.text);
    const group = groups.find((existing) => existing.some((member) => {
      if (presentationGroup(member) !== section) return false;
      if (requirement.clusterKey || member.clusterKey) {
        return Boolean(requirement.clusterKey && member.clusterKey === requirement.clusterKey);
      }
      const memberFamily = semanticFamily(member.text);
      return (family && memberFamily === family) || similarity(requirement.text, member.text) >= 0.35;
    }));
    if (group) group.push(requirement);
    else groups.push([requirement]);
  }

  return groups.map((group) => ({
    id: stableEvidenceId('gap-group', ...group.map((item) => item.id).sort()),
    label: fallbackLabel(group),
    requirementIds: group.map((item) => item.id),
    importance: group.some((item) => item.importance === 'MANDATORY') ? 'MANDATORY' : 'DESIRABLE',
    category: group[0].category,
    presentationGroup: presentationGroup(group[0]),
  }));
}
