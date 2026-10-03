import { describe, expect, it } from 'vitest';
import { EvidenceCaptureInputSchema } from '../schemas';
import { materializeCapturedEvidence, suggestRelatedRequirements } from '../evidence-capture';
import { emptyCandidateEvidence } from '../merge-evidence';
import type { GenerationRequirement } from '../types';

describe('structured evidence capture', () => {
  it('validates new entities against their canonical schema', () => {
    expect(EvidenceCaptureInputSchema.safeParse({
      entityKind: 'PROJECT', entity: { mode: 'NEW', data: { technologies: [] } },
      evidenceItems: [{ fieldKind: 'ACHIEVEMENT', text: 'Built APIs.', requirementIds: ['r1'] }],
      persistenceScope: 'CAREER_PROFILE_AND_APPLICATION',
    }).success).toBe(false);
  });

  it('rejects project metadata that the canonical ProjectEntry schema cannot persist', () => {
    const parsed = EvidenceCaptureInputSchema.safeParse({
      entityKind: 'PROJECT',
      entity: { mode: 'NEW', data: { name: 'CareTrack', role: 'Developer' } },
      evidenceItems: [{ fieldKind: 'ACHIEVEMENT', text: 'Built REST APIs.', requirementIds: ['r-api'] }],
      persistenceScope: 'CAREER_PROFILE_AND_APPLICATION',
    });
    expect(parsed.success).toBe(false);
  });
  it('accepts a source-CV entity that can be promoted into the canonical profile schema', () => {
    const parsed = EvidenceCaptureInputSchema.safeParse({
      entityKind: 'PROJECT',
      entity: {
        mode: 'SOURCE_CV', entityId: 'project:source-cv:generation-1:caretrack', sourceEntityId: 'project-0', label: 'CareTrack',
        data: { name: 'CareTrack', repositoryUrl: 'https://github.com/example/caretrack' },
      },
      evidenceItems: [{ fieldKind: 'ACHIEVEMENT', text: 'Built REST APIs.', requirementIds: ['r-api'] }],
      persistenceScope: 'CAREER_PROFILE_AND_APPLICATION',
    });
    expect(parsed.success).toBe(true);
  });
  it('hands a promoted source-CV entity over to its canonical profile identity', () => {
    const snapshot = emptyCandidateEvidence();
    snapshot.projects.push({ id: 'cv-project', sourceEntityId: 'project-0', label: 'CareTrack', details: { name: 'CareTrack' }, evidenceIds: [] });
    const result = materializeCapturedEvidence(snapshot, 'generation-1', {
      entityKind: 'PROJECT',
      entity: { mode: 'SOURCE_CV', entityId: 'canonical-project-1', sourceEntityId: 'project-0', label: 'CareTrack', data: { name: 'CareTrack' } },
      evidenceItems: [{ fieldKind: 'ACHIEVEMENT', text: 'Built REST APIs.', requirementIds: ['r-api'] }],
      persistenceScope: 'CAREER_PROFILE_AND_APPLICATION',
    });
    expect(result.projects[0].sourceEntityId).toBe('canonical-project-1');
    expect(result.projects[0].evidenceIds).toHaveLength(1);
  });
  it('attaches application-only evidence to a source-CV entity through its generation-scoped identity', () => {
    const snapshot = emptyCandidateEvidence();
    snapshot.projects.push({ id: 'cv-project', sourceEntityId: 'project-0', label: 'CareTrack', details: { name: 'CareTrack' }, evidenceIds: [] });
    const result = materializeCapturedEvidence(snapshot, 'generation-1', {
      entityKind: 'PROJECT',
      entity: { mode: 'SOURCE_CV', entityId: 'project:source-cv:generation-1:caretrack', sourceEntityId: 'project-0', label: 'CareTrack', data: { name: 'CareTrack' } },
      evidenceItems: [{ fieldKind: 'ACHIEVEMENT', text: 'Built REST APIs.', requirementIds: ['r-api'] }],
      persistenceScope: 'APPLICATION_ONLY',
    });
    const captured = Object.values(result.evidenceById)[0];
    expect(captured.sourceEntityId).toBe('project:source-cv:generation-1:caretrack');
    expect(result.projects[0].evidenceIds).toEqual([captured.id]);
  });
  it('attaches multiple evidence items and requirement mappings to one existing entity', () => {
    const result = materializeCapturedEvidence(emptyCandidateEvidence(), 'generation-1', {
      entityKind: 'PROJECT', entity: { mode: 'EXISTING', entityId: 'caretrack', label: 'CareTrack' },
      evidenceItems: [
        { fieldKind: 'ACHIEVEMENT', text: 'Built services in C#/.NET.', requirementIds: ['r-dotnet', 'r-backend'] },
        { fieldKind: 'ACHIEVEMENT', text: 'Designed REST API integrations.', requirementIds: ['r-api'] },
      ],
      persistenceScope: 'CAREER_PROFILE_AND_APPLICATION',
    });
    const added = Object.values(result.evidenceById);
    expect(added).toHaveLength(2);
    expect(new Set(added.map((item) => item.sourceEntityId))).toEqual(new Set(['caretrack']));
    expect(added.flatMap((item) => item.requirementIds)).toEqual(expect.arrayContaining(['r-dotnet', 'r-backend', 'r-api']));
  });

  it('suggests other unresolved requirements supported by the same evidence', () => {
    const requirements: GenerationRequirement[] = [
      { id: 'r-api', text: 'REST API development', importance: 'MANDATORY', category: 'DUTY', evidenceRequired: true, sourceSection: 'JOB_DESCRIPTION' },
      { id: 'r-db', text: 'Database development with SQL', importance: 'MANDATORY', category: 'SKILL', evidenceRequired: true, sourceSection: 'JOB_DESCRIPTION' },
      { id: 'r-mentor', text: 'Mentor junior engineers', importance: 'DESIRABLE', category: 'DUTY', evidenceRequired: true, sourceSection: 'JOB_DESCRIPTION' },
    ];
    expect(suggestRelatedRequirements('Built REST APIs backed by SQL databases.', requirements, new Set(['r-api']))).toEqual([
      expect.objectContaining({ requirementId: 'r-db' }),
    ]);
  });
});
