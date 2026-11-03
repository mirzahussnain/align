import { describe, expect, it } from 'vitest';
import { groupEntityRepresentations, stablePresentationEntityId } from '../entity-identity';
import { identityRepresentation } from './fixtures/presentation-normalization';

describe('presentation entity identity', () => {
  it('connects experience representations transitively through canonical id and fingerprint', () => {
    const groups = groupEntityRepresentations([
      identityRepresentation('current', 'EXPERIENCE', { title: 'Platform Engineer', employer: 'Northwind Robotics', startDate: '2024-01' }, { canonicalEntityId: 'experience-7' }),
      identityRepresentation('historical', 'EXPERIENCE', { title: 'Platform Engineer' }, { canonicalEntityId: 'experience-7' }),
      identityRepresentation('extracted', 'EXPERIENCE', { jobTitle: ' platform engineer ', company: 'NORTHWIND ROBOTICS', startDate: '2024-01' }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].representations.map(({ representationId }) => representationId)).toEqual([
      'current', 'extracted', 'historical',
    ]);
    expect(stablePresentationEntityId(groups[0])).toBe('experience-7');
  });

  it('does not treat a shared fact evidence id as entity identity', () => {
    const groups = groupEntityRepresentations([
      identityRepresentation('northwind', 'EXPERIENCE', { title: 'Platform Engineer', employer: 'Northwind Robotics', startDate: '2024-01' }, { evidenceIds: ['fact-1'] }),
      identityRepresentation('contoso', 'EXPERIENCE', { title: 'Platform Engineer', employer: 'Contoso Transit', startDate: '2024-01' }, { evidenceIds: ['fact-1'] }),
    ]);

    expect(groups).toHaveLength(2);
  });

  it('keeps complete experience identities with conflicting employers separate', () => {
    const groups = groupEntityRepresentations([
      identityRepresentation('northwind', 'EXPERIENCE', { title: 'Platform Engineer', employer: 'Northwind Robotics', startDate: '2024-01' }),
      identityRepresentation('contoso', 'EXPERIENCE', { title: 'Platform Engineer', employer: 'Contoso Transit', startDate: '2024-01' }),
    ]);

    expect(groups.map(stablePresentationEntityId)).toHaveLength(2);
  });

  it('returns stable source-only identities and memberships for every supported kind', () => {
    const representations = [
      identityRepresentation('project', 'PROJECT', { repositoryUrl: 'https://github.com/example/beacon/' }),
      identityRepresentation('education', 'EDUCATION', { qualification: 'BSc Computing', institution: 'Northwind University' }),
      identityRepresentation('certification', 'CERTIFICATION', { name: 'Cloud Associate', issuer: 'Example Cloud' }),
      identityRepresentation('training', 'TRAINING', { course: 'Distributed Systems', provider: 'Contoso Academy' }),
      identityRepresentation('volunteer', 'VOLUNTEERING', { role: 'Mentor', organisation: 'Code Guild' }),
      identityRepresentation('open-source', 'OPEN_SOURCE', { projectUrl: 'https://example.org/forge/' }),
      identityRepresentation('other', 'OTHER', { title: 'Technical speaker', context: 'Community events' }),
    ];
    const summarize = (input: typeof representations) => groupEntityRepresentations(input).map((group) => ({
      id: stablePresentationEntityId(group),
      members: group.representations.map(({ representationId }) => representationId),
    }));

    expect(summarize(representations)).toEqual(summarize([...representations].reverse()));
    expect(summarize(representations).map(({ id }) => id)).toEqual([
      'certification:cloud associate|example cloud',
      'education:bsc computing|northwind university',
      'open_source:https://example.org/forge',
      'other:technical speaker|community events',
      'project:https://github.com/example/beacon',
      'training:distributed systems|contoso academy',
      'volunteering:mentor|code guild',
    ]);
  });
});
