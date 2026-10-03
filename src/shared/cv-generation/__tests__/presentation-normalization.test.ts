import { describe, expect, it } from 'vitest';
import { emptyCandidateEvidence } from '../merge-evidence';
import { normalizeEntitySections } from '../presentation-normalization';
import { CV_BUILD_SPEC_V2_VERSION } from '../build-spec-types';
import { presentationEntity, structuralEvidence } from './fixtures/presentation-normalization';

function normalizationInput() {
  const evidence = emptyCandidateEvidence();
  evidence.employment = [
    presentationEntity('role-extracted', 'role-1', 'Platform Engineer', {
      jobTitle: 'Platform Engineer', company: 'Northwind Robotics', startDate: '2024-01', excerpt: 'internal',
    }, ['role-extracted-record']),
    presentationEntity('role-current', 'role-1', 'Platform Engineer', {
      title: 'Platform Engineer', employer: 'Northwind Robotics', startDate: '2024-01', location: 'Leeds', internalRecordId: 'secret',
    }, ['role-current-record']),
  ];
  evidence.projects = [presentationEntity('project-1', 'project-1', 'Lighthouse API', {
    name: 'Lighthouse API', technologies: ['TypeScript', 'PostgreSQL'], repositoryUrl: 'https://github.com/example/lighthouse', skillIds: ['skill-1'],
  }, ['project-record'])];
  evidence.education = [
    presentationEntity('education-extracted', 'education-1', 'Education', {
      degree: 'BSc Data Engineering — Westbridge Institute MSc', university: 'Wrong fragment', excerpt: 'adjacent records',
    }, ['education-extracted-record']),
    presentationEntity('education-current', 'education-1', 'BSc Data Engineering', {
      qualification: 'BSc Data Engineering', institution: 'Westbridge Institute', grade: 'First', reconciliation: { hidden: true },
    }, ['education-current-record']),
  ];
  evidence.certifications = [presentationEntity('cert-1', 'cert-1', 'Cloud Associate', { name: 'Cloud Associate', issuer: 'Example Cloud', excerpt: 'hide' }, ['cert-record'])];
  evidence.training = [presentationEntity('training-1', 'training-1', 'Distributed Systems', { course: 'Distributed Systems', provider: 'Contoso Academy', skillIds: ['hide'] }, ['training-record'])];
  evidence.volunteerExperience = [presentationEntity('volunteer-1', 'volunteer-1', 'Mentor', { role: 'Mentor', organisation: 'Code Guild', internalRecordId: 'hide' }, ['volunteer-record'])];
  evidence.openSource = [presentationEntity('oss-1', 'oss-1', 'Beacon', { projectName: 'Beacon', role: 'Maintainer', repositoryUrl: 'https://github.com/example/beacon', unknown: 'hide' }, ['oss-record'])];
  evidence.otherEvidence = [presentationEntity('other-1', 'other-1', 'Technical speaker', { title: 'Technical speaker', context: 'Community events', nested: { hide: true } }, ['other-record'])];

  const records = [
    ['role-extracted-record', 'EMPLOYMENT', 'SOURCE_CV', 'role-1', 'extract-1'],
    ['role-current-record', 'EMPLOYMENT', 'CAREER_PROFILE', 'role-1', 'profile-current'],
    ['project-record', 'PROJECT', 'CAREER_PROFILE', 'project-1', 'profile-current'],
    ['education-extracted-record', 'EDUCATION', 'SOURCE_CV', 'education-1', 'extract-1'],
    ['education-current-record', 'EDUCATION', 'CAREER_PROFILE', 'education-1', 'profile-current'],
    ['cert-record', 'CERTIFICATION', 'CAREER_PROFILE', 'cert-1', 'profile-current'],
    ['training-record', 'TRAINING', 'CAREER_PROFILE', 'training-1', 'profile-current'],
    ['volunteer-record', 'VOLUNTEER', 'CAREER_PROFILE', 'volunteer-1', 'profile-current'],
    ['oss-record', 'OPEN_SOURCE', 'CAREER_PROFILE', 'oss-1', 'profile-current'],
    ['other-record', 'OTHER', 'CAREER_PROFILE', 'other-1', 'profile-current'],
  ] as const;
  for (const [id, kind, source, entityId, snapshotId] of records) evidence.evidenceById[id] = structuralEvidence(id, kind, source, entityId, snapshotId);

  return {
    evidence,
    selectedEvidenceIds: new Set(records.map(([id]) => id)),
    patches: new Map<string, string>(),
    authorityContext: { currentProfileSnapshotId: 'profile-current', matchProfileSnapshotId: 'profile-match' },
  };
}

describe('structural presentation normalization', () => {
  it('emits one explicit experience, project, and authoritative education per component', () => {
    const result = normalizeEntitySections(normalizationInput());

    expect(CV_BUILD_SPEC_V2_VERSION).toBe(4);
    expect(result.experience).toEqual([expect.objectContaining({ title: 'Platform Engineer', employer: 'Northwind Robotics', location: 'Leeds' })]);
    expect(result.projects).toEqual([expect.objectContaining({ name: 'Lighthouse API', technologies: ['TypeScript', 'PostgreSQL'] })]);
    expect(result.education).toEqual([expect.objectContaining({ degree: 'BSc Data Engineering', institution: 'Westbridge Institute', grade: 'First' })]);
  });

  it('maps every supported entity to known presentation fields without metadata leakage', () => {
    const result = normalizeEntitySections(normalizationInput());
    expect(result.certifications[0]).toMatchObject({ name: 'Cloud Associate', issuer: 'Example Cloud' });
    expect(result.training[0]).toMatchObject({ course: 'Distributed Systems', provider: 'Contoso Academy' });
    expect(result.volunteering[0]).toMatchObject({ role: 'Mentor', organisation: 'Code Guild' });
    expect(result.openSource[0]).toMatchObject({ projectName: 'Beacon', role: 'Maintainer' });
    expect(result.other[0]).toMatchObject({ title: 'Technical speaker', context: 'Community events' });

    const serialized = JSON.stringify(result);
    for (const forbidden of ['metadata', 'excerpt', 'skillIds', 'internalRecordId', 'reconciliation', 'nested', 'unknown']) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});
