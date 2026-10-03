import { describe, expect, it } from 'vitest';
import { clusterMaterialGaps } from '../gap-clustering';
import type { GenerationRequirement, RequirementReconciliationSnapshot } from '../types';

const req = (id: string, text: string, overrides: Partial<GenerationRequirement> = {}): GenerationRequirement => ({
  id, text, importance: 'MANDATORY', category: 'DUTY', evidenceRequired: true, sourceSection: 'JOB_DESCRIPTION', ...overrides,
});
const reconciliationFor = (requirements: GenerationRequirement[]): RequirementReconciliationSnapshot => ({
  schemaVersion: 1, items: requirements.map((item) => ({ requirementId: item.id, status: 'MISSING', evidenceIds: [], confidence: 0, reason: 'No authoritative evidence found.' })),
});

describe('clusterMaterialGaps', () => {
  it('clusters semantically overlapping API requirements while retaining their ids', () => {
    const requirements = [req('r1', 'Build REST APIs'), req('r2', 'Consume REST APIs'), req('r3', 'API integrations'), req('r4', 'Mentor junior engineers')];
    const groups = clusterMaterialGaps(requirements, reconciliationFor(requirements));
    expect(groups).toContainEqual(expect.objectContaining({ requirementIds: expect.arrayContaining(['r1', 'r2', 'r3']) }));
    expect(groups.find((group) => group.requirementIds.includes('r4'))?.requirementIds).toEqual(['r4']);
  });

  it('prefers optional upstream semantic clusters while retaining every requirement id', () => {
    const requirements = [
      req('r1', 'Build public HTTP services', { clusterKey: 'api-development', clusterLabel: 'API development & integration' }),
      req('r2', 'Connect partner systems', { clusterKey: 'api-development', clusterLabel: 'API development & integration' }),
      req('r3', 'Review pull requests'),
    ];
    const groups = clusterMaterialGaps(requirements, reconciliationFor(requirements));
    expect(groups).toContainEqual(expect.objectContaining({ label: 'API development & integration', requirementIds: ['r1', 'r2'] }));
    expect(groups.flatMap((group) => group.requirementIds).sort()).toEqual(['r1', 'r2', 'r3']);
  });

  it('separates core, supporting, confirmation, and desirable presentation groups', () => {
    const requirements = [
      req('r-core', 'C# / .NET', { category: 'SKILL' }),
      req('r-support', 'Troubleshoot software issues', { category: 'DUTY' }),
      req('r-location', 'Work in person in Haverfordwest', { category: 'AVAILABILITY' }),
      req('r-extra', 'Umbraco CMS', { category: 'TOOL', importance: 'DESIRABLE' }),
    ];
    const groups = clusterMaterialGaps(requirements, reconciliationFor(requirements));
    expect(groups.find((group) => group.requirementIds.includes('r-core'))?.presentationGroup).toBe('CORE_EVIDENCE');
    expect(groups.find((group) => group.requirementIds.includes('r-support'))?.presentationGroup).toBe('SUPPORTING_EVIDENCE');
    expect(groups.find((group) => group.requirementIds.includes('r-location'))?.presentationGroup).toBe('CONFIRMATION');
    expect(groups.find((group) => group.requirementIds.includes('r-extra'))?.presentationGroup).toBe('DESIRABLE_EXTRAS');
  });
});
