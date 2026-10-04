import { describe, expect, it } from 'vitest';
import { emptyCandidateEvidence } from '../merge-evidence';
import { normalizePresentationSkills } from '../presentation-skills';
import { structuralEvidence } from './fixtures/presentation-normalization';

function input(reverse = false) {
  const evidence = emptyCandidateEvidence();
  evidence.skills = [
    { id: 'rust-extracted', sourceEntityId: 'rust-source', label: 'rust', name: ' rust ', category: 'Tools', details: { excerpt: 'hide' }, evidenceIds: ['rust-extracted-record'] },
    { id: 'rust-canonical', sourceEntityId: 'skill-rust', label: 'Rust', name: 'Rust', category: 'Languages', details: {}, evidenceIds: ['rust-canonical-record'] },
    { id: 'svelte-extracted', sourceEntityId: 'svelte-source', label: 'Svelte', name: 'Svelte', category: '', details: {}, evidenceIds: ['svelte-record'] },
    { id: 'cockroach-canonical', sourceEntityId: 'skill-cockroach', label: 'CockroachDB', name: 'CockroachDB', category: 'Databases', details: {}, evidenceIds: ['cockroach-record'] },
  ];
  const records = [
    ['rust-extracted-record', 'SOURCE_CV', 'rust-source', 'extract-1'],
    ['rust-canonical-record', 'CAREER_PROFILE', 'skill-rust', 'profile-current'],
    ['svelte-record', 'SOURCE_CV', 'svelte-source', 'extract-1'],
    ['cockroach-record', 'CAREER_PROFILE', 'skill-cockroach', 'profile-current'],
  ] as const;
  for (const [id, source, entityId, snapshotId] of records) evidence.evidenceById[id] = structuralEvidence(id, 'SKILL', source, entityId, snapshotId);
  if (reverse) evidence.skills.reverse();
  return {
    evidence,
    selectedEvidenceIds: new Set<string>(records.map(([id]) => id)),
    patches: new Map<string, string>(),
    authorityContext: { currentProfileSnapshotId: 'profile-current', matchProfileSnapshotId: 'profile-match' },
    sparseSkillArtifacts: [{ skillName: 'Rust', evidenceIds: ['sparse-rust-record'] }],
  };
}

describe('presentation skill normalization', () => {
  it('groups canonical skills once with authoritative categories and complete bindings', () => {
    const result = normalizePresentationSkills(input());

    expect(result.groups).toEqual([
      { id: 'skill-category:databases', category: 'Databases', skills: [{ id: 'skill-cockroach', name: 'CockroachDB' }] },
      { id: 'skill-category:languages', category: 'Languages', skills: [{ id: 'skill-rust', name: 'Rust' }] },
      { id: 'skill-category:skills', category: 'Skills', skills: [{ id: 'skill:svelte', name: 'Svelte' }] },
    ]);
    expect(result.bindings.find(({ nodeId }) => nodeId === 'skill-rust')?.evidenceIds).toEqual([
      'rust-canonical-record', 'rust-extracted-record', 'sparse-rust-record',
    ]);
    expect(result.bindings.flatMap(({ evidenceIds }) => evidenceIds)).toEqual(expect.arrayContaining([
      'rust-canonical-record', 'rust-extracted-record', 'svelte-record', 'cockroach-record', 'sparse-rust-record',
    ]));
    expect(JSON.stringify(result.groups)).not.toMatch(/Category:|Excerpt:/);
  });

  it('keeps category and skill ordering independent of source order', () => {
    expect(normalizePresentationSkills(input(true)).groups).toEqual(normalizePresentationSkills(input()).groups);
  });

  it('uses the category saved by the Career Profile editor for future CV generation', () => {
    const value = input();
    const canonical = value.evidence.skills.find(({ id }) => id === 'rust-canonical');
    if (!canonical) throw new Error('Expected canonical Rust fixture');
    canonical.category = 'User edited category';

    expect(normalizePresentationSkills(value).groups).toContainEqual({
      id: 'skill-category:user edited category',
      category: 'User edited category',
      skills: [{ id: 'skill-rust', name: 'Rust' }],
    });
  });
});
