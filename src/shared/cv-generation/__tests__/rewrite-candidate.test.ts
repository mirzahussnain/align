import { describe, expect, it } from 'vitest';
import { createCvRewriteCandidateContract } from '../rewrite-candidate';
import { emptyCandidateEvidence } from '../merge-evidence';
import type { ApprovedCvPlan } from '../types';

function fixture(sectionOrder: ApprovedCvPlan['sectionOrder'] = ['EXPERIENCE']) {
  const evidence = emptyCandidateEvidence();
  evidence.evidenceById.metric = {
    id: 'metric', kind: 'ACHIEVEMENT', field: 'experience.achievement', canonicalText: 'Reduced latency by 25%',
    provenance: 'CAREER_PROFILE', preservationTier: 0, requirementIds: [],
    sourceRefs: [{ sourceType: 'CAREER_PROFILE', entityType: 'Experience', entityId: 'role-1', fieldPath: 'achievements[0]' }],
  };
  evidence.evidenceById.delivery = {
    id: 'delivery', kind: 'ACHIEVEMENT', field: 'experience.achievement', canonicalText: 'Built reliable internal services',
    provenance: 'CAREER_PROFILE', preservationTier: 0, requirementIds: [],
    sourceRefs: [{ sourceType: 'CAREER_PROFILE', entityType: 'Experience', entityId: 'role-1', fieldPath: 'achievements[1]' }],
  };
  evidence.employment.push({ id: 'role-1', label: 'Engineer', details: {}, evidenceIds: ['metric', 'delivery'] });
  const plan: ApprovedCvPlan = {
    schemaVersion: 1, sourceMode: 'JOB_MATCH', atsStrategy: 'STANDARD', targetStrategy: 'EXPERIENCE_FORWARD',
    sectionOrder, density: 'BALANCED', targetLength: 'ONE_PAGE', includedEvidenceIds: ['metric', 'delivery'],
    optionalEvidenceIds: [], omittedEvidence: [], professionalLinkIds: [], projectLinkIds: [],
    coveredRequirementIds: [], unresolvedRequirementIds: [], approvedAt: new Date(0).toISOString(),
  };
  return { evidence, plan };
}

describe('provider rewrite candidate validation', () => {
  it('accepts a candidate after dropping one invalid patch and retaining its original evidence', () => {
    const { evidence, plan } = fixture();
    const contract = createCvRewriteCandidateContract({ generationId: 'g1', evidence, plan, templateId: 'architect' });
    const result = contract.runtimeSchema.safeParse({ schemaVersion: 1, patches: [
      { evidenceId: 'metric', text: 'Reduced latency by 90%', sourceEvidenceIds: ['metric'] },
      { evidenceId: 'delivery', text: 'Built dependable internal services', sourceEvidenceIds: ['delivery'] },
    ] });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.patchCount).toEqual({ returned: 2, accepted: 1, rejected: 1 });
    expect(result.data.rejected).toEqual([expect.objectContaining({ evidenceId: 'metric', reason: 'unsupported_metric' })]);
    expect(result.data.spec.sections[0].entries[0].lines).toEqual([
      { evidenceId: 'metric', text: 'Reduced latency by 25%' },
      { evidenceId: 'delivery', text: 'Built dependable internal services' },
    ]);
  });

  it('rejects a provider candidate when the final assembled spec fails preservation', () => {
    const { evidence, plan } = fixture([]);
    const contract = createCvRewriteCandidateContract({ generationId: 'g1', evidence, plan, templateId: 'architect' });
    const result = contract.runtimeSchema.safeParse({ schemaVersion: 1, patches: [] });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.map((issue) => issue.message).join(' ')).toContain('PRESERVATION_VALIDATION_FAILED');
    expect(JSON.stringify(result.error.issues)).not.toContain('Reduced latency');
  });
});
