import { describe, expect, it } from 'vitest';
import { reconcileRequirements, unresolvedRequirements } from '../reconcile';
import { emptyCandidateEvidence } from '../merge-evidence';
import type { GenerationRequirement } from '../types';

const requirements: GenerationRequirement[] = [
  { id: 'r-dotnet', text: 'Professional C#/.NET experience', importance: 'MANDATORY', category: 'EXPERIENCE', evidenceRequired: true, sourceSection: 'PERSON_SPECIFICATION' },
  { id: 'r-api', text: 'Build and integrate REST APIs', importance: 'MANDATORY', category: 'DUTY', evidenceRequired: true, sourceSection: 'JOB_DESCRIPTION' },
  { id: 'r-cloud', text: 'AWS cloud deployment', importance: 'DESIRABLE', category: 'TOOL', evidenceRequired: true, sourceSection: 'JOB_DESCRIPTION' },
];

describe('eligibility confirmations', () => {
  it('keeps a positive confirmation resolved during later full reconciliation', () => {
    const eligibility = [{
      id: 'r-location', text: 'Work in person in Haverfordwest', importance: 'MANDATORY' as const,
      category: 'AVAILABILITY' as const, evidenceRequired: true, sourceSection: 'JOB_DESCRIPTION' as const,
    }];
    const result = reconcileRequirements(eligibility, emptyCandidateEvidence(), new Set(), new Set(['r-location']));
    expect(result.items[0]).toMatchObject({ requirementId: 'r-location', status: 'CONFIRMED', evidenceIds: [] });
    expect(unresolvedRequirements(result)).toHaveLength(0);
  });
});
describe('reconcileRequirements', () => {
  it('uses explicit many-requirement mappings and suppresses resolved questions', () => {
    const evidence = emptyCandidateEvidence();
    evidence.evidenceById.e1 = {
      id: 'e1', kind: 'PROJECT', field: 'project.achievement', canonicalText: 'Built and deployed REST APIs using C# and .NET.',
      provenance: 'HITL', preservationTier: 0, requirementIds: ['r-dotnet', 'r-api'],
      sourceRefs: [{ sourceType: 'HITL', entityType: 'ProjectEntry', entityId: 'caretrack', fieldPath: 'achievements[0]' }],
    };
    const result = reconcileRequirements(requirements, evidence);
    expect(result.items.find((item) => item.requirementId === 'r-dotnet')?.status).toBe('SUPPORTED');
    expect(result.items.find((item) => item.requirementId === 'r-api')?.status).toBe('SUPPORTED');
    expect(unresolvedRequirements(result)).toEqual([expect.objectContaining({ requirementId: 'r-cloud' })]);
  });

  it('treats an uncontextualised standalone skill as partial rather than sufficient proof', () => {
    const evidence = emptyCandidateEvidence();
    evidence.evidenceById.skill = {
      id: 'skill', kind: 'SKILL', field: 'skill', canonicalText: 'C#', provenance: 'CAREER_PROFILE', preservationTier: 1, requirementIds: [],
      sourceRefs: [{ sourceType: 'CAREER_PROFILE', entityType: 'Skill', entityId: 'skill-1', fieldPath: 'name' }],
    };
    const result = reconcileRequirements([requirements[0]], evidence);
    expect(result.items[0].status).toBe('PARTIAL');
  });

  it('keeps confirmed missing terminal for the current generation', () => {
    const result = reconcileRequirements(requirements, emptyCandidateEvidence(), new Set(['r-cloud']));
    expect(result.items.find((item) => item.requirementId === 'r-cloud')?.status).toBe('CONFIRMED_MISSING');
    expect(unresolvedRequirements(result)).not.toContainEqual(expect.objectContaining({ requirementId: 'r-cloud' }));
  });
});
