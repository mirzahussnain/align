import { describe, expect, it } from 'vitest';
import { buildExistingRecordOptions } from '../evidence-options';
import { emptyCandidateEvidence } from '../merge-evidence';
import type { UnifiedCandidateEvidence, UnifiedEvidenceEntity } from '../types';

function entity(
  id: string,
  sourceEntityId: string,
  label: string,
  details: Record<string, unknown>,
  evidenceIds: string[]
): UnifiedEvidenceEntity {
  return { id, sourceEntityId, label, details, evidenceIds };
}

function snapshot(): UnifiedCandidateEvidence {
  const evidence = emptyCandidateEvidence();
  evidence.projects = [
    entity('cv-caretrack', 'project-0', 'Next.js', {
      name: 'CareTrack', repositoryUrl: 'https://github.com/example/caretrack',
    }, ['cv-caretrack-record']),
    entity('profile-caretrack', 'project-profile-1', 'CareTrack', {
      name: 'CareTrack', role: 'Full-stack developer', repositoryUrl: 'https://github.com/example/caretrack',
    }, ['profile-caretrack-record']),
    entity('cv-archive', 'project-1', 'Archive', {
      name: 'Archive', repositoryUrl: 'https://github.com/example/archive', achievements: ['Recovered historical records.'],
    }, ['cv-archive-record']),
    entity('profile-align', 'project-profile-2', 'Align', {
      name: 'Align', description: 'AI Career Intelligence Platform',
    }, ['profile-align-record']),
  ];
  evidence.employment = [
    entity('profile-role-1', 'experience-1', 'Developer', {
      jobTitle: 'Junior Full-Stack Developer', company: 'NextPak Agile Solutions', startDate: '2024-01',
    }, ['profile-role-1-record']),
    entity('profile-role-2', 'experience-2', 'Developer', {
      jobTitle: 'Junior Full-Stack Developer', company: 'Another Company', startDate: '2024-01',
    }, ['profile-role-2-record']),
    entity('cv-role-1', 'experience-0', 'Junior Full-Stack Developer', {
      jobTitle: 'Junior Full-Stack Developer', company: 'NextPak Agile Solutions', startDate: '2024-01',
    }, ['cv-role-1-record']),
  ];
  evidence.evidenceById = {
    'cv-caretrack-record': {
      id: 'cv-caretrack-record', kind: 'PROJECT', field: 'project', canonicalText: 'CareTrack', provenance: 'SOURCE_CV', preservationTier: 1, requirementIds: [],
      sourceRefs: [{ sourceType: 'SOURCE_CV', entityType: 'ExtractedProject', entityId: 'project-0', fieldPath: 'record', snapshotId: 'extract-1' }],
    },
    'profile-caretrack-record': {
      id: 'profile-caretrack-record', kind: 'PROJECT', field: 'project', canonicalText: 'CareTrack', provenance: 'CAREER_PROFILE', preservationTier: 1, requirementIds: [],
      sourceRefs: [{ sourceType: 'CAREER_PROFILE', entityType: 'ProjectEntry', entityId: 'project-profile-1', fieldPath: 'record', snapshotId: 'profile-snapshot-1' }],
    },
    'cv-archive-record': {
      id: 'cv-archive-record', kind: 'PROJECT', field: 'project', canonicalText: 'Archive', provenance: 'SOURCE_CV', preservationTier: 1, requirementIds: [],
      sourceRefs: [{ sourceType: 'SOURCE_CV', entityType: 'ExtractedProject', entityId: 'project-1', fieldPath: 'record', snapshotId: 'extract-1' }],
    },
    'profile-align-record': {
      id: 'profile-align-record', kind: 'PROJECT', field: 'project', canonicalText: 'Align', provenance: 'CAREER_PROFILE', preservationTier: 1, requirementIds: [],
      sourceRefs: [{ sourceType: 'CAREER_PROFILE', entityType: 'ProjectEntry', entityId: 'project-profile-2', fieldPath: 'record', snapshotId: 'profile-snapshot-1' }],
    },
    'profile-role-1-record': {
      id: 'profile-role-1-record', kind: 'EMPLOYMENT', field: 'employment', canonicalText: 'Junior Full-Stack Developer · NextPak Agile Solutions', provenance: 'CAREER_PROFILE', preservationTier: 0, requirementIds: [],
      sourceRefs: [{ sourceType: 'CAREER_PROFILE', entityType: 'Experience', entityId: 'experience-1', fieldPath: 'record' }],
    },
    'profile-role-2-record': {
      id: 'profile-role-2-record', kind: 'EMPLOYMENT', field: 'employment', canonicalText: 'Junior Full-Stack Developer · Another Company', provenance: 'CAREER_PROFILE', preservationTier: 0, requirementIds: [],
      sourceRefs: [{ sourceType: 'CAREER_PROFILE', entityType: 'Experience', entityId: 'experience-2', fieldPath: 'record' }],
    },
    'cv-role-1-record': {
      id: 'cv-role-1-record', kind: 'EMPLOYMENT', field: 'employment', canonicalText: 'Junior Full-Stack Developer at NextPak Agile Solutions', provenance: 'SOURCE_CV', preservationTier: 0, requirementIds: [],
      sourceRefs: [{ sourceType: 'SOURCE_CV', entityType: 'ExtractedExperience', entityId: 'experience-0', fieldPath: 'record', snapshotId: 'extract-1' }],
    },
  };
  return evidence;
}

describe('buildExistingRecordOptions', () => {
  it('prefers one canonical project and merges its extracted references', () => {
    const options = buildExistingRecordOptions(snapshot(), 'generation-1', 'PROJECT');
    const careTrack = options.filter((option) => option.label.startsWith('CareTrack'));

    expect(careTrack).toHaveLength(1);
    expect(careTrack[0]).toMatchObject({
      key: 'project:project-profile-1',
      entityId: 'project-profile-1',
      origin: 'CAREER_PROFILE',
      sourceEntityIds: expect.arrayContaining(['project-profile-1', 'project-0']),
    });
    expect(careTrack[0].label).not.toBe('Next.js');
  });

  it('retains a source-CV-only project with a stable generation-scoped fingerprint', () => {
    const first = buildExistingRecordOptions(snapshot(), 'generation-1', 'PROJECT');
    const second = buildExistingRecordOptions(snapshot(), 'generation-1', 'PROJECT');
    const archive = first.find((option) => option.label.startsWith('Archive'));

    expect(archive).toMatchObject({ origin: 'SOURCE_CV', promotable: true, promotionData: { name: 'Archive', repositoryUrl: 'https://github.com/example/archive' } });
    expect(archive?.key).toMatch(/^project:source-cv:generation-1:/);
    expect(archive?.key).toBe(second.find((option) => option.label.startsWith('Archive'))?.key);
  });

  it('deduplicates by identity rather than display label', () => {
    const options = buildExistingRecordOptions(snapshot(), 'generation-1', 'EXPERIENCE');

    expect(options).toHaveLength(2);
    expect(options.map((option) => option.key)).toEqual([
      'experience:experience-1',
      'experience:experience-2',
    ]);
    expect(options[0].sourceEntityIds).toEqual(expect.arrayContaining(['experience-1', 'experience-0']));
    expect(options.map((option) => option.label)).toEqual([
      'Junior Full-Stack Developer — NextPak Agile Solutions',
      'Junior Full-Stack Developer — Another Company',
    ]);
  });

  it('builds canonical project labels and leaves record creation outside the options', () => {
    const options = buildExistingRecordOptions(snapshot(), 'generation-1', 'PROJECT');

    expect(options.find((option) => option.entityId === 'project-profile-2')?.label).toBe('Align — AI Career Intelligence Platform');
    expect(options.filter((option) => /create a new/i.test(option.label))).toHaveLength(0);
  });
});
