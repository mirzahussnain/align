import { describe, expect, it } from 'vitest';
import { applyStructuredCandidateEvidence } from '../job-match-structured-evidence';
import type { CareerProfileSnapshotData } from '../career-profile-snapshot';
import { REFERENCE_JOB_MATCH } from './fixtures/job-match-reference';

const emptyProfile = {
  profileId: 'profile-1',
  label: 'Primary profile',
  personal: { targetRoleTitle: '', targetOccupation: '', targetSeniority: '', targetIndustry: '' },
  experience: [], projects: [], education: [], skills: [], certifications: [], trainings: [],
  licences: [], professionalRegistrations: [], languages: [], volunteering: [], otherEvidence: [],
} as unknown as CareerProfileSnapshotData['profile'];

describe('applyStructuredCandidateEvidence', () => {
  it('evaluates confirmed practical facts separately from CV evidence', () => {
    const input = structuredMatch('Full UK driving licence required');
    const result = applyStructuredCandidateEvidence(input, {
      profile: emptyProfile,
      practicalFacts: { drivingLicenceHeld: false } as CareerProfileSnapshotData['practicalFacts'],
    });

    expect(result.requirements[0].status).toBe('contradicted');
    expect(result.requirements[0].evidence).toContainEqual(expect.objectContaining({
      source: 'practical_fact',
      sourceRef: 'drivingLicenceHeld',
      text: 'Driving licence not held',
    }));
    expect(result.requirements[0].deduction.points).toBeGreaterThanOrEqual(6);
  });

  it('does not invent structured evidence when no confirmed fact or profile item matches', () => {
    const input = structuredMatch('Kubernetes production experience');
    const result = applyStructuredCandidateEvidence(input, { profile: emptyProfile, practicalFacts: null });
    expect(result.requirements[0]).toEqual(input.requirements[0]);
  });
});

function structuredMatch(text: string) {
  const copy = structuredClone(REFERENCE_JOB_MATCH);
  copy.requirements[0] = {
    ...copy.requirements[0],
    text,
    status: 'unclear',
    evidence: [],
    deduction: { ...copy.requirements[0].deduction, points: 4 },
  };
  return copy;
}
