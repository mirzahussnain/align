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
  evidence.employment.push({ id: 'role-1', sourceEntityId: 'role-1', label: 'Engineer', details: { title: 'Engineer', employer: 'Northwind Robotics' }, evidenceIds: ['metric', 'delivery'] });
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
    const section = result.data.spec.sections.find((item) => item.type === 'EXPERIENCE');
    expect(section?.items[0].lines).toEqual([
      { id: 'delivery', text: 'Built dependable internal services' },
      { id: 'metric', text: 'Reduced latency by 25%' },
    ]);
  });

  it('passes snapshot authority context into provider candidate assembly', () => {
    const { evidence, plan } = fixture(['EDUCATION']);
    evidence.evidenceById.matchEducation = {
      id: 'matchEducation', kind: 'EDUCATION', field: 'record', canonicalText: 'Historical degree', canonicalData: { degree: 'BSc Data', institution: 'Westbridge Institute' },
      provenance: 'CAREER_PROFILE', preservationTier: 1, requirementIds: [], sourceRefs: [{ sourceType: 'CAREER_PROFILE', entityType: 'Education', entityId: 'education-1', fieldPath: 'record', snapshotId: 'profile-match' }],
    };
    evidence.evidenceById.currentEducation = {
      id: 'currentEducation', kind: 'EDUCATION', field: 'record', canonicalText: 'Current degree', canonicalData: { degree: 'BSc Data Engineering', institution: 'Westbridge Institute' },
      provenance: 'CAREER_PROFILE', preservationTier: 1, requirementIds: [], sourceRefs: [{ sourceType: 'CAREER_PROFILE', entityType: 'Education', entityId: 'education-1', fieldPath: 'record', snapshotId: 'profile-current' }],
    };
    evidence.education.push(
      { id: 'education-match', sourceEntityId: 'education-1', label: 'BSc Data', details: { degree: 'BSc Data', institution: 'Westbridge Institute' }, evidenceIds: ['matchEducation'] },
      { id: 'education-current', sourceEntityId: 'education-1', label: 'BSc Data Engineering', details: { degree: 'BSc Data Engineering', institution: 'Westbridge Institute' }, evidenceIds: ['currentEducation'] },
    );
    plan.includedEvidenceIds = ['matchEducation', 'currentEducation'];
    const contract = createCvRewriteCandidateContract({ generationId: 'g1', evidence, plan, templateId: 'architect', authorityContext: { currentProfileSnapshotId: 'profile-current', matchProfileSnapshotId: 'profile-match' } });
    const result = contract.runtimeSchema.safeParse({ schemaVersion: 1, patches: [] });

    expect(result.success).toBe(true);
    if (!result.success) return;
    const section = result.data.spec.sections.find((item) => item.type === 'EDUCATION');
    expect(section?.items[0].degree).toBe('BSc Data Engineering');
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
