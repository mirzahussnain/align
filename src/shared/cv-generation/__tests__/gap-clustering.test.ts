import { describe, expect, it } from 'vitest';
import { clusterMaterialGaps } from '../gap-clustering';
import type { GenerationRequirement, RequirementReconciliationSnapshot } from '../types';

const req = (id: string, text: string): GenerationRequirement => ({ id, text, importance: 'MANDATORY', category: 'DUTY', evidenceRequired: true, sourceSection: 'JOB_DESCRIPTION' });

describe('clusterMaterialGaps', () => {
  it('clusters semantically overlapping API requirements while retaining their ids', () => {
    const requirements = [req('r1', 'Build REST APIs'), req('r2', 'Consume REST APIs'), req('r3', 'API integrations'), req('r4', 'Mentor junior engineers')];
    const reconciliation: RequirementReconciliationSnapshot = {
      schemaVersion: 1,
      items: requirements.map((item) => ({ requirementId: item.id, status: 'MISSING', evidenceIds: [], confidence: 0, reason: 'No authoritative evidence found.' })),
    };
    const groups = clusterMaterialGaps(requirements, reconciliation);
    expect(groups).toContainEqual(expect.objectContaining({ requirementIds: expect.arrayContaining(['r1', 'r2', 'r3']) }));
    expect(groups.find((group) => group.requirementIds.includes('r4'))?.requirementIds).toEqual(['r4']);
  });
});
