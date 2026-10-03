import { describe, expect, it } from 'vitest';
import { proposeCvPlan } from '../planner';
import { emptyCandidateEvidence } from '../merge-evidence';
import type { RequirementReconciliationSnapshot, UnifiedCandidateEvidence, UnifiedEvidenceEntity } from '../types';

const reconciliation: RequirementReconciliationSnapshot = { schemaVersion: 1, items: [] };
const entity = (id: string): UnifiedEvidenceEntity => ({ id, sourceEntityId: id, label: id, details: {}, evidenceIds: [] });
const evidence = (overrides: Partial<UnifiedCandidateEvidence> = {}) => ({ ...emptyCandidateEvidence(), ...overrides });

describe('proposeCvPlan', () => {
  it('puts projects ahead of experience for a junior project-heavy candidate', () => {
    const plan = proposeCvPlan({ evidence: evidence({ projects: [entity('p1'), entity('p2')], employment: [entity('e1')] }), reconciliation, sourceMode: 'CAREER_PROFILE', atsStrategy: 'STANDARD', target: { seniority: 'entry' } });
    expect(plan.sectionOrder.indexOf('PROJECTS')).toBeLessThan(plan.sectionOrder.indexOf('EXPERIENCE'));
  });

  it('uses experience-forward structure for an experienced candidate', () => {
    const plan = proposeCvPlan({ evidence: evidence({ employment: [entity('e1'), entity('e2'), entity('e3')], projects: [entity('p1')] }), reconciliation, sourceMode: 'JOB_MATCH', atsStrategy: 'COMPOSITE', target: { seniority: 'mid' } });
    expect(plan.sectionOrder.indexOf('EXPERIENCE')).toBeLessThan(plan.sectionOrder.indexOf('PROJECTS'));
  });

  it('supports career-change and credential-heavy strategies', () => {
    const careerChange = proposeCvPlan({ evidence: evidence({ projects: [entity('p1')], employment: [entity('e1')], skills: [{ ...entity('s1'), category: 'Transferable Skills', name: 'Stakeholder communication' }] }), reconciliation, sourceMode: 'JOB_MATCH', atsStrategy: 'STANDARD', target: { careerChanger: true } });
    expect(careerChange.sectionOrder.slice(0, 3)).toEqual(['PROFILE', 'SKILLS', 'PROJECTS']);
    const regulated = proposeCvPlan({ evidence: evidence({ education: [entity('ed1')], certifications: [entity('c1'), entity('c2')], employment: [entity('e1')] }), reconciliation, sourceMode: 'JOB_MATCH', atsStrategy: 'STANDARD', target: { regulated: true } });
    expect(regulated.sectionOrder.indexOf('CERTIFICATIONS')).toBeLessThan(regulated.sectionOrder.indexOf('EXPERIENCE'));
  });

  it.each([
    [{}, 'CAREER_PROFILE' as const, ['PROFILE', 'SKILLS', 'EXPERIENCE', 'PROJECTS', 'EDUCATION']],
    [{ seniority: 'entry' }, 'JOB_MATCH' as const, ['PROFILE', 'SKILLS', 'PROJECTS', 'EDUCATION', 'EXPERIENCE']],
    [{ seniority: 'mid' }, 'JOB_MATCH' as const, ['PROFILE', 'EXPERIENCE', 'SKILLS', 'PROJECTS', 'EDUCATION']],
  ])('preserves a dynamic recommendation for target %j', (target, sourceMode, expected) => {
    const source = evidence({
      employment: [entity('e1')], projects: [entity('p1')], education: [entity('ed1')],
      skills: [{ ...entity('s1'), category: 'Technical Skills', name: 'TypeScript' }],
    });

    const plan = proposeCvPlan({ evidence: source, reconciliation, sourceMode, atsStrategy: 'STANDARD', target });

    expect(plan.sectionOrder).toEqual(expected);
  });

  it('creates a deterministic profile-only plan without inventing evidence ids', () => {
    const source = evidence({ employment: [entity('e1')] });
    source.evidenceById.fact = { id: 'fact', kind: 'EMPLOYMENT', field: 'employment', canonicalText: 'Engineer at Acme', provenance: 'CAREER_PROFILE', preservationTier: 0, requirementIds: [], sourceRefs: [{ sourceType: 'CAREER_PROFILE', entityType: 'Experience', entityId: 'e1', fieldPath: 'record' }] };
    source.employment[0].evidenceIds = ['fact'];
    const plan = proposeCvPlan({ evidence: source, reconciliation, sourceMode: 'CAREER_PROFILE', atsStrategy: 'STANDARD', target: {} });
    expect(plan.includedEvidenceIds).toEqual(['fact']);
    expect(plan.targetStrategy).toBe('PROFILE_ONLY');
  });
});
