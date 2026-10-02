import { describe, expect, it } from 'vitest';
import { validatePlanEvidenceSelection } from '../preservation';
import { emptyCandidateEvidence } from '../merge-evidence';

describe('plan preservation', () => {
  it('rejects silent omission of tier 0 and unexplained tier 1 evidence', () => {
    const evidence = emptyCandidateEvidence();
    evidence.evidenceById.metric = { id: 'metric', kind: 'ACHIEVEMENT', field: 'achievement', canonicalText: 'Reduced latency by 40%', provenance: 'SOURCE_CV', preservationTier: 0, requirementIds: [], sourceRefs: [{ sourceType: 'SOURCE_CV', entityType: 'CvRevision', entityId: 'cv1', fieldPath: 'experience[0]' }] };
    evidence.evidenceById.github = { id: 'github', kind: 'LINK', field: 'GITHUB', canonicalText: 'https://github.com/a', provenance: 'CAREER_PROFILE', preservationTier: 1, requirementIds: [], sourceRefs: [{ sourceType: 'CAREER_PROFILE', entityType: 'ProfileIdentity', entityId: 'p1', fieldPath: 'github' }] };
    expect(validatePlanEvidenceSelection(evidence, { includedEvidenceIds: [], optionalEvidenceIds: [], omittedEvidence: [] })).toEqual(expect.arrayContaining([expect.objectContaining({ evidenceId: 'metric' }), expect.objectContaining({ evidenceId: 'github' })]));
  });
});
