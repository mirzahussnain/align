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
    selectedEvidenceIds: new Set<string>(records.map(([id]) => id)),
    patches: new Map<string, string>(),
    authorityContext: { currentProfileSnapshotId: 'profile-current', matchProfileSnapshotId: 'profile-match' },
  };
}

function positiveEvidenceInput() {
  const input = normalizationInput();
  const add = (id: string, canonicalText: string, provenance: 'APPLICATION_EVIDENCE' | 'HITL', sourceEntityId: string, requirementIds = ['requirement-1']) => {
    input.evidence.evidenceById[id] = {
      id, kind: 'ACHIEVEMENT', field: 'achievement', canonicalText, provenance,
      preservationTier: 0, requirementIds, sourceEntityId,
      sourceRefs: [{ sourceType: provenance, entityType: 'ACHIEVEMENT', entityId: sourceEntityId, fieldPath: 'achievement' }],
    };
    input.selectedEvidenceIds.add(id);
  };
  add('project-impact', 'Reduced API latency by 35%.', 'APPLICATION_EVIDENCE', 'project-1');
  add('role-impact-a', 'Led platform migration.', 'HITL', 'role-1');
  add('role-impact-b', '  LED\u00a0PLATFORM   MIGRATION. ', 'APPLICATION_EVIDENCE', 'role-1');
  add('role-distinct', 'Mentored four engineers.', 'HITL', 'role-1');
  input.patches.set('role-impact-a', 'Led the platform migration safely.');
  input.patches.set('role-impact-b', 'Different duplicate rewrite.');
  return input;
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

  it('assigns positive evidence once and deduplicates exact normalized text with union bindings', () => {
    const result = normalizeEntitySections(positiveEvidenceInput());

    expect(result.projects[0].lines.map(({ text }) => text)).toEqual(['Reduced API latency by 35%.']);
    expect(result.experience[0].lines.map(({ text }) => text)).toEqual(expect.arrayContaining([
      'Led the platform migration safely.', 'Mentored four engineers.',
    ]));
    expect(result.experience[0].lines).toHaveLength(2);
    expect(result.bindings).toContainEqual(expect.objectContaining({
      nodeId: 'line:role-impact-a', evidenceIds: ['role-impact-a', 'role-impact-b'], representativeEvidenceId: 'role-impact-a',
    }));
  });

  it('reports ambiguous explicit entity references instead of guessing', () => {
    const input = normalizationInput();
    input.evidence.projects.push(presentationEntity('project-2', 'project-2', 'Harbor API', { name: 'Harbor API' }, ['project-2-record']));
    input.evidence.evidenceById['project-2-record'] = structuralEvidence('project-2-record', 'PROJECT', 'CAREER_PROFILE', 'project-2', 'profile-current');
    input.evidence.evidenceById.ambiguous = {
      id: 'ambiguous', kind: 'ACHIEVEMENT', field: 'achievement', canonicalText: 'Improved delivery.', provenance: 'APPLICATION_EVIDENCE', preservationTier: 0, requirementIds: [],
      sourceRefs: [
        { sourceType: 'APPLICATION_EVIDENCE', entityType: 'PROJECT', entityId: 'project-1', fieldPath: 'achievement' },
        { sourceType: 'APPLICATION_EVIDENCE', entityType: 'PROJECT', entityId: 'project-2', fieldPath: 'achievement' },
      ],
    };
    input.selectedEvidenceIds.add('project-2-record');
    input.selectedEvidenceIds.add('ambiguous');

    expect(normalizeEntitySections(input).issues).toContainEqual({ code: 'AMBIGUOUS_EVIDENCE_ENTITY', evidenceId: 'ambiguous' });
  });

  it('reclassifies only a fully sparse technology-named project', () => {
    const input = normalizationInput();
    input.evidence.skills.push({ id: 'skill-rust', sourceEntityId: 'skill-rust', label: 'Rust', name: 'Rust', category: 'Languages', details: {}, evidenceIds: ['skill-rust-record'] });
    input.evidence.evidenceById['skill-rust-record'] = structuralEvidence('skill-rust-record', 'SKILL', 'CAREER_PROFILE', 'skill-rust', 'profile-current');
    input.evidence.projects.push(
      presentationEntity('sparse-rust', 'sparse-rust', 'Rust', { name: 'Rust' }, ['sparse-rust-record']),
      presentationEntity('real-rust', 'real-rust', 'Rust', { name: 'Rust', repositoryUrl: 'https://github.com/example/rust-project' }, ['real-rust-record']),
    );
    input.evidence.evidenceById['sparse-rust-record'] = structuralEvidence('sparse-rust-record', 'PROJECT', 'SOURCE_CV', 'sparse-rust', 'extract-1');
    input.evidence.evidenceById['real-rust-record'] = structuralEvidence('real-rust-record', 'PROJECT', 'SOURCE_CV', 'real-rust', 'extract-1');
    for (const id of ['skill-rust-record', 'sparse-rust-record', 'real-rust-record']) input.selectedEvidenceIds.add(id);

    const result = normalizeEntitySections(input);
    expect(result.sparseSkillArtifacts).toEqual([{ skillName: 'Rust', evidenceIds: ['sparse-rust-record'] }]);
    expect(result.projects.filter(({ name }) => name === 'Rust')).toHaveLength(1);
    expect(result.projects.find(({ name }) => name === 'Rust')?.links).toEqual([]);
  });
});
