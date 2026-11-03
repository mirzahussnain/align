import { describe, expect, it } from 'vitest';
import { persistApplicationOnlyEvidence } from '../application-evidence';
import { persistReusableProfileEvidence } from '../profile-persistence';
import type { EvidenceCaptureInput } from '../types';

const sourceProject: EvidenceCaptureInput = {
  entityKind: 'PROJECT',
  entity: {
    mode: 'SOURCE_CV', entityId: 'project:source-cv:generation-1:caretrack', sourceEntityId: 'project-0', label: 'CareTrack',
    data: { name: 'CareTrack', repositoryUrl: 'https://github.com/example/caretrack' },
  },
  evidenceItems: [{ fieldKind: 'ACHIEVEMENT', text: 'Built REST APIs in C#.', requirementIds: ['r-dotnet', 'r-api'] }],
  persistenceScope: 'CAREER_PROFILE_AND_APPLICATION',
};

describe('HITL evidence persistence scope', () => {
  it('promotes a source-CV-only project into the canonical Career Profile', async () => {
    const stored: Array<Record<string, unknown>> = [];
    const tx = {
      projectEntry: {
        count: async () => 0,
        create: async ({ data }: { data: Record<string, unknown> }) => { stored.push({ id: 'canonical-project-1', ...data }); return { id: 'canonical-project-1' }; },
        update: async ({ data }: { data: Record<string, unknown> }) => { Object.assign(stored[0], data); return stored[0]; },
      },
    };

    const id = await persistReusableProfileEvidence(tx as never, 'profile-1', 'generation-1', sourceProject);

    expect(id).toBe('canonical-project-1');
    expect(stored[0]).toMatchObject({
      profileId: 'profile-1', name: 'CareTrack', repositoryUrl: 'https://github.com/example/caretrack',
      achievements: ['Built REST APIs in C#.'],
    });
  });

  it('keeps application-only evidence out of canonical profile entities', async () => {
    const applicationRows: Array<Record<string, unknown>> = [];
    const tx = {
      cvApplicationEvidence: {
        create: async ({ data }: { data: Record<string, unknown> }) => { applicationRows.push(data); return data; },
      },
    };
    const input: EvidenceCaptureInput = {
      ...sourceProject,
      entity: { mode: 'EXISTING', entityId: 'project-1', label: 'CareTrack' },
      persistenceScope: 'APPLICATION_ONLY',
    };

    await persistApplicationOnlyEvidence(tx as never, 'generation-1', input);

    expect(applicationRows).toHaveLength(1);
    expect(applicationRows[0]).toMatchObject({ entityId: 'project-1', persistenceScope: 'APPLICATION_ONLY', requirementIds: ['r-dotnet', 'r-api'] });
  });

  it('enriches an existing canonical project instead of creating another entity', async () => {
    const row = { id: 'project-1', profileId: 'profile-1', achievements: ['Existing achievement'], evidenceMetadata: [] };
    let creates = 0;
    const tx = {
      projectEntry: {
        findFirst: async () => row,
        create: async () => { creates += 1; return { id: 'unexpected' }; },
        update: async ({ data }: { data: Record<string, unknown> }) => { Object.assign(row, data); return row; },
      },
    };
    const input: EvidenceCaptureInput = {
      ...sourceProject,
      entity: { mode: 'EXISTING', entityId: 'project-1', label: 'CareTrack' },
    };

    const id = await persistReusableProfileEvidence(tx as never, 'profile-1', 'generation-1', input);

    expect(id).toBe('project-1');
    expect(creates).toBe(0);
    expect(row.achievements).toEqual(['Existing achievement', 'Built REST APIs in C#.']);
  });
});
