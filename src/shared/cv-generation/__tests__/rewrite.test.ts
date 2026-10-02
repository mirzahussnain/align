import { describe, expect, it } from 'vitest';
import { serializeApprovedEvidenceForRewrite } from '../rewrite-serializer';
import { validateRewritePatches } from '../rewrite-validator';
import type { ApprovedCvPlan, CandidateEvidenceItem, UnifiedCandidateEvidence } from '../types';
import { emptyCandidateEvidence } from '../merge-evidence';

function fixture() {
  const evidence = emptyCandidateEvidence();
  const item: CandidateEvidenceItem = { id: 'e1', kind: 'ACHIEVEMENT', field: 'experience.achievement', canonicalText: 'Reduced processing time by 25%', provenance: 'CAREER_PROFILE', preservationTier: 0, requirementIds: ['r1'], sourceRefs: [{ sourceType: 'CAREER_PROFILE', entityType: 'Experience', entityId: 'x1', fieldPath: 'achievements[0]' }] };
  evidence.evidenceById.e1 = item;
  const plan: ApprovedCvPlan = { schemaVersion: 1, sourceMode: 'JOB_MATCH', atsStrategy: 'STANDARD', targetStrategy: 'EXPERIENCE_FORWARD', sectionOrder: ['EXPERIENCE'], density: 'SPACIOUS', targetLength: 'ONE_PAGE', includedEvidenceIds: ['e1'], optionalEvidenceIds: [], omittedEvidence: [], professionalLinkIds: [], projectLinkIds: [], coveredRequirementIds: ['r1'], unresolvedRequirementIds: [], approvedAt: new Date(0).toISOString() };
  return { evidence: evidence as UnifiedCandidateEvidence, plan };
}

describe('evidence-keyed rewrite contract', () => {
  it('serializes only approved evidence and no full-document output request', () => {
    const { evidence, plan } = fixture();
    const serialized = serializeApprovedEvidenceForRewrite(evidence, plan);
    expect(JSON.parse(serialized).approvedEvidence).toEqual([expect.objectContaining({ evidenceId: 'e1' })]);
    expect(serialized).toContain('Return rewrite patches only');
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
});
