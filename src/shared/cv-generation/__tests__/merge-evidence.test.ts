import { describe, expect, it } from 'vitest';
import { mergeCandidateEvidence } from '../merge-evidence';
import type { UnifiedCandidateEvidence } from '../types';

function evidence(overrides: Partial<UnifiedCandidateEvidence> = {}): UnifiedCandidateEvidence {
  return {
    schemaVersion: 1,
    identity: {},
    contact: {},
    professionalLinks: [],
    employment: [],
    projects: [],
    education: [],
    certifications: [],
    training: [],
    volunteerExperience: [],
    openSource: [],
    skills: [],
    achievements: [],
    otherEvidence: [],
    evidenceById: {},
    sourceRefs: [],
    conflicts: [],
    ...overrides,
  };
}

describe('mergeCandidateEvidence', () => {
  it('preserves facts unique to the source CV and profile', () => {
    const merged = mergeCandidateEvidence([
      evidence({
        evidenceById: {
          'cv-role': {
            id: 'cv-role', kind: 'EMPLOYMENT', field: 'employment', canonicalText: 'Engineer at Northstar',
            provenance: 'SOURCE_CV', preservationTier: 0, requirementIds: [],
            sourceRefs: [{ sourceType: 'SOURCE_CV', entityType: 'CvRevision', entityId: 'cv-1', fieldPath: 'experience[0]' }],
          },
        },
      }),
      evidence({
        evidenceById: {
          'profile-project': {
            id: 'profile-project', kind: 'PROJECT', field: 'project', canonicalText: 'CareTrack',
            provenance: 'CAREER_PROFILE', preservationTier: 1, requirementIds: [],
            sourceRefs: [{ sourceType: 'CAREER_PROFILE', entityType: 'ProjectEntry', entityId: 'project-1', fieldPath: 'name' }],
          },
        },
      }),
    ]);

    expect(Object.keys(merged.evidenceById)).toHaveLength(2);
    expect(Object.values(merged.evidenceById).map((item) => item.canonicalText)).toEqual(
      expect.arrayContaining(['Engineer at Northstar', 'CareTrack'])
    );
  });

  it('deduplicates equivalent facts while retaining every source reference', () => {
    const fact = {
      kind: 'SKILL' as const,
      field: 'skill',
      canonicalText: 'TypeScript',
      preservationTier: 1 as const,
      requirementIds: ['r-1'],
    };
    const merged = mergeCandidateEvidence([
      evidence({ evidenceById: { a: { id: 'a', ...fact, provenance: 'SOURCE_CV', sourceRefs: [{ sourceType: 'SOURCE_CV', entityType: 'CvRevision', entityId: 'cv-1', fieldPath: 'skills[0]' }] } } }),
      evidence({ evidenceById: { b: { id: 'b', ...fact, provenance: 'CAREER_PROFILE', sourceRefs: [{ sourceType: 'CAREER_PROFILE', entityType: 'Skill', entityId: 'skill-1', fieldPath: 'name' }] } } }),
    ]);

    const items = Object.values(merged.evidenceById);
    expect(items).toHaveLength(1);
    expect(items[0].sourceRefs).toHaveLength(2);
    expect(items[0].requirementIds).toEqual(['r-1']);
  });

  it('records conflicting values instead of silently merging them', () => {
    const make = (id: string, text: string, sourceType: 'SOURCE_CV' | 'CAREER_PROFILE') => evidence({
      evidenceById: {
        [id]: {
          id, kind: 'CONTACT', field: 'email', conflictKey: 'identity.email', canonicalText: text,
          provenance: sourceType, preservationTier: 0, requirementIds: [],
          sourceRefs: [{ sourceType, entityType: sourceType === 'SOURCE_CV' ? 'CvRevision' : 'ProfileIdentity', entityId: id, fieldPath: 'email' }],
        },
      },
    });

    const merged = mergeCandidateEvidence([make('cv-email', 'old@example.com', 'SOURCE_CV'), make('profile-email', 'new@example.com', 'CAREER_PROFILE')]);
    expect(merged.conflicts).toEqual([
      expect.objectContaining({ key: 'identity.email', evidenceIds: expect.arrayContaining(['cv-email', 'profile-email']) }),
    ]);
    expect(Object.keys(merged.evidenceById)).toHaveLength(2);
  });
});
