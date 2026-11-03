import { describe, expect, it } from 'vitest';
import { serializeApprovedEvidenceForRewrite } from '../rewrite-serializer';
import { validateRewritePatches } from '../rewrite-validator';
import type { ApprovedCvPlan, CandidateEvidenceItem, UnifiedCandidateEvidence } from '../types';
import { emptyCandidateEvidence } from '../merge-evidence';

function fixture() {
  const evidence = emptyCandidateEvidence();
  const item: CandidateEvidenceItem = { id: 'e1', kind: 'ACHIEVEMENT', field: 'experience.achievement', canonicalText: 'Reduced processing time by 25%', provenance: 'CAREER_PROFILE', preservationTier: 0, requirementIds: ['r1'], sourceRefs: [{ sourceType: 'CAREER_PROFILE', entityType: 'Experience', entityId: 'x1', fieldPath: 'achievements[0]' }] };
  const second: CandidateEvidenceItem = { id: 'e2', kind: 'ACHIEVEMENT', field: 'experience.achievement', canonicalText: 'Built reliable internal services', sourceEntityId: 'x1', provenance: 'CAREER_PROFILE', preservationTier: 0, requirementIds: ['r1'], sourceRefs: [{ sourceType: 'CAREER_PROFILE', entityType: 'Experience', entityId: 'x1', fieldPath: 'achievements[1]' }] };
  evidence.evidenceById.e1 = item;
  evidence.evidenceById.e2 = second;
  const plan: ApprovedCvPlan = { schemaVersion: 1, sourceMode: 'JOB_MATCH', atsStrategy: 'STANDARD', targetStrategy: 'EXPERIENCE_FORWARD', sectionOrder: ['EXPERIENCE'], density: 'SPACIOUS', targetLength: 'ONE_PAGE', includedEvidenceIds: ['e1', 'e2'], optionalEvidenceIds: [], omittedEvidence: [], professionalLinkIds: [], projectLinkIds: [], coveredRequirementIds: ['r1'], unresolvedRequirementIds: [], approvedAt: new Date(0).toISOString() };
  return { evidence: evidence as UnifiedCandidateEvidence, plan };
}

describe('evidence-keyed rewrite contract', () => {
  it('serializes only approved evidence and no full-document output request', () => {
    const { evidence, plan } = fixture();
    const serialized = serializeApprovedEvidenceForRewrite(evidence, plan);
    expect(JSON.parse(serialized).approvedEvidence).toEqual(expect.arrayContaining([expect.objectContaining({ evidenceId: 'e1' })]));
    expect(serialized).toContain('Return rewrite patches only');
  });

  it('serializes only selected evidence whose text can consume a rewrite patch', () => {
    const { evidence, plan } = fixture();
    evidence.evidenceById.structural = {
      id: 'structural', kind: 'PROJECT', field: 'project', canonicalText: 'CareTrack',
      canonicalData: { name: 'CareTrack', technologies: ['C#', '.NET'] }, provenance: 'CAREER_PROFILE',
      preservationTier: 1, requirementIds: [],
      sourceRefs: [{ sourceType: 'CAREER_PROFILE', entityType: 'ProjectEntry', entityId: 'caretrack', fieldPath: 'record' }],
    };
    evidence.evidenceById.hitl = {
      id: 'hitl', kind: 'PROJECT', field: 'project.achievement',
      canonicalText: "Used C# and .NET to build CareTrack's backend, implementing application logic and API endpoints.",
      canonicalData: { fieldKind: 'ACHIEVEMENT', persistenceScope: 'APPLICATION_ONLY' }, sourceEntityId: 'caretrack',
      provenance: 'APPLICATION_EVIDENCE', preservationTier: 0, requirementIds: ['r-dotnet', 'r-api'],
      sourceRefs: [{ sourceType: 'APPLICATION_EVIDENCE', entityType: 'PROJECT', entityId: 'caretrack', fieldPath: 'achievement[0]' }],
    };
    plan.includedEvidenceIds.push('structural', 'hitl');

    const payload = JSON.parse(serializeApprovedEvidenceForRewrite(evidence, plan));

    expect(payload.approvedEvidence.map((item: { evidenceId: string }) => item.evidenceId)).toEqual(['e1', 'e2', 'hitl']);
    expect(payload.approvedEvidence[2]).toMatchObject({ evidenceId: 'hitl', requirementIds: ['r-dotnet', 'r-api'] });
    expect(payload.approvedEvidence[2]).not.toHaveProperty('sourceEntityId');
    expect(payload.approvedEvidence[2]).not.toHaveProperty('sourceEntityType');
    expect(evidence.evidenceById.hitl).toMatchObject({ sourceEntityId: 'caretrack', sourceRefs: [expect.objectContaining({ entityType: 'PROJECT' })] });
  });

  it('rejects a rewrite patch for selected structural evidence', () => {
    const { evidence, plan } = fixture();
    evidence.evidenceById.structural = {
      id: 'structural', kind: 'SKILL', field: 'skill', canonicalText: 'React', canonicalData: { name: 'React' },
      provenance: 'CAREER_PROFILE', preservationTier: 1, requirementIds: [],
      sourceRefs: [{ sourceType: 'CAREER_PROFILE', entityType: 'Skill', entityId: 'react', fieldPath: 'name' }],
    };
    plan.includedEvidenceIds.push('structural');

    const result = validateRewritePatches({ schemaVersion: 1, patches: [
      { evidenceId: 'structural', text: 'React', sourceEvidenceIds: ['structural'] },
    ] }, evidence, plan);

    expect(result.patches.has('structural')).toBe(false);
    expect(result.rejected).toContainEqual(expect.objectContaining({ evidenceId: 'structural', reason: 'non_patchable_evidence' }));
  });

  it('keeps unresolved and confirmed-missing requirement state out of positive rewrite evidence', () => {
    const { evidence, plan } = fixture();
    plan.unresolvedRequirementIds = ['r-umbraco', 'r-commercial-duration'];

    const serialized = serializeApprovedEvidenceForRewrite(evidence, plan);

    expect(serialized).not.toContain('r-umbraco');
    expect(serialized).not.toContain('r-commercial-duration');
  });

  it('keeps reusable positive HITL evidence patchable regardless of origin', () => {
    const { evidence, plan } = fixture();
    evidence.evidenceById.reusable = {
      id: 'reusable', kind: 'EDUCATION', field: 'education.coursework', canonicalText: 'Applied database design in a capstone project.',
      canonicalData: { fieldKind: 'COURSEWORK', generationId: 'g1' }, sourceEntityId: 'education-1',
      provenance: 'HITL', preservationTier: 1, requirementIds: ['r-database'],
      sourceRefs: [{ sourceType: 'PROFILE_EVIDENCE', entityType: 'Education', entityId: 'education-1', fieldPath: 'evidenceMetadata[0]' }],
    };
    plan.optionalEvidenceIds.push('reusable');

    const payload = JSON.parse(serializeApprovedEvidenceForRewrite(evidence, plan));

    expect(payload.approvedEvidence).toContainEqual(expect.objectContaining({ evidenceId: 'reusable', requirementIds: ['r-database'] }));
  });

  it('accepts a grounded patch and leaves omission to deterministic assembly', () => {
    const { evidence, plan } = fixture();
    const result = validateRewritePatches({ schemaVersion: 1, patches: [{ evidenceId: 'e1', text: 'Cut processing time by 25%', sourceEvidenceIds: ['e1'] }] }, evidence, plan);
    expect(result.ok).toBe(true);
    expect(result.patches.get('e1')).toBe('Cut processing time by 25%');
  });

  it.each([
    [{ schemaVersion: 1, patches: [{ evidenceId: 'other', text: 'Managed work', sourceEvidenceIds: ['other'] }] }, 'unapproved evidence'],
    [{ schemaVersion: 1, patches: [{ evidenceId: 'e1', text: 'Reduced processing time by 70%', sourceEvidenceIds: ['e1'] }] }, 'unsupported metric'],
    [{ schemaVersion: 1, patches: [{ evidenceId: 'e1', text: 'Improved processing', sourceEvidenceIds: ['other'] }] }, 'does not cite only'],
    [{ schemaVersion: 1, patches: [{ evidenceId: 'e1', text: 'Delivered Kubernetes processing at Google', sourceEvidenceIds: ['e1'] }] }, 'unsupported named'],
  ])('rejects %s', (output, reason) => {
    const { evidence, plan } = fixture();
    expect(validateRewritePatches(output, evidence, plan).reasons.join(' ')).toContain(reason);
  });

  it('keeps valid patches when another patch invents a metric', () => {
    const { evidence, plan } = fixture();
    const result = validateRewritePatches({ schemaVersion: 1, patches: [
      { evidenceId: 'e1', text: 'Reduced processing time by 70%', sourceEvidenceIds: ['e1'] },
      { evidenceId: 'e2', text: 'Built dependable internal services', sourceEvidenceIds: ['e2'] },
    ] }, evidence, plan);

    expect(result.patches).toEqual(new Map([['e2', 'Built dependable internal services']]));
    expect(result.rejected).toEqual([expect.objectContaining({
      evidenceId: 'e1',
      sourceEntityType: 'Experience',
      path: 'experience.achievement',
      reason: 'unsupported_metric',
    })]);
  });

  it.each([
    ['Introduced Kubernetes for reliable internal services', 'unsupported_technology'],
    ['Built reliable internal services over five years', 'unsupported_duration'],
    ['Built reliable internal services in a full-time role', 'unsupported_employment_type'],
  ])('rejects only a patch containing %s', (text, reason) => {
    const { evidence, plan } = fixture();
    const result = validateRewritePatches({ schemaVersion: 1, patches: [
      { evidenceId: 'e2', text, sourceEvidenceIds: ['e2'] },
    ] }, evidence, plan);

    expect(result.patches.has('e2')).toBe(false);
    expect(result.rejected).toContainEqual(expect.objectContaining({ evidenceId: 'e2', reason }));
  });

  it('normalizes an unsupported summary rewrite without exposing its text', () => {
    const { evidence, plan } = fixture();
    evidence.evidenceById.summary = {
      id: 'summary', kind: 'OTHER', field: 'summary', canonicalText: 'Engineer building reliable services',
      provenance: 'CAREER_PROFILE', preservationTier: 1, requirementIds: [],
      sourceRefs: [{ sourceType: 'CAREER_PROFILE', entityType: 'Profile', entityId: 'profile-1', fieldPath: 'summary' }],
    };
    plan.includedEvidenceIds.push('summary');
    const invented = 'Principal Kubernetes architect for ten years';
    const result = validateRewritePatches({ schemaVersion: 1, patches: [
      { evidenceId: 'summary', text: invented, sourceEvidenceIds: ['summary'] },
    ] }, evidence, plan);

    expect(result.patches.has('summary')).toBe(false);
    expect(result.rejected).toContainEqual(expect.objectContaining({ evidenceId: 'summary', reason: 'ungrounded_summary_claim' }));
    expect(JSON.stringify(result.rejected)).not.toContain(invented);
  });

  it.each([
    ['managed global teams and designed svelte platforms', 'evidence_mismatch'],
    ['Built reliable internal services with c#', 'unsupported_technology'],
    ['Built reliable internal services with c++', 'unsupported_technology'],
    ['Built reliable internal services with .net', 'unsupported_technology'],
  ])('rejects an unsupported lowercase factual claim: %s', (text, reason) => {
    const { evidence, plan } = fixture();
    const result = validateRewritePatches({ schemaVersion: 1, patches: [
      { evidenceId: 'e2', text, sourceEvidenceIds: ['e2'] },
    ] }, evidence, plan);
    expect(result.patches.has('e2')).toBe(false);
    expect(result.rejected).toContainEqual(expect.objectContaining({ evidenceId: 'e2', reason }));
  });

  it.each([
    ['Reduced processing time by 25x'],
    ['Reduced processing time by £25'],
  ])('rejects a metric whose digits match but unit changes: %s', (text) => {
    const { evidence, plan } = fixture();
    const result = validateRewritePatches({ schemaVersion: 1, patches: [
      { evidenceId: 'e1', text, sourceEvidenceIds: ['e1'] },
    ] }, evidence, plan);
    expect(result.rejected).toContainEqual(expect.objectContaining({ reason: 'unsupported_metric' }));
  });

  it('rejects every duplicate patch for an evidence ID and retains the original', () => {
    const { evidence, plan } = fixture();
    const result = validateRewritePatches({ schemaVersion: 1, patches: [
      { evidenceId: 'e2', text: 'Built dependable internal services', sourceEvidenceIds: ['e2'] },
      { evidenceId: 'e2', text: 'Built robust internal services', sourceEvidenceIds: ['e2'] },
    ] }, evidence, plan);
    expect(result.patches.has('e2')).toBe(false);
    expect(result.rejected).toHaveLength(2);
    expect(result.rejected.every((item) => item.reason === 'duplicate_patch')).toBe(true);
  });

  it.each([
    ['Delivered Go services', 'Worked at Google'],
    ['Built Java services', 'Built JavaScript interfaces'],
  ])('does not treat a substring as technology evidence', (text, source) => {
    const { evidence, plan } = fixture();
    evidence.evidenceById.e2.canonicalText = source;
    const result = validateRewritePatches({ schemaVersion: 1, patches: [
      { evidenceId: 'e2', text, sourceEvidenceIds: ['e2'] },
    ] }, evidence, plan);
    expect(result.rejected).toContainEqual(expect.objectContaining({ reason: 'unsupported_technology' }));
  });
});
