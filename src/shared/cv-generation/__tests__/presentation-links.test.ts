import { describe, expect, it } from 'vitest';
import { emptyCandidateEvidence } from '../merge-evidence';
import { normalizePresentationIdentity, normalizeProfessionalUrl, normalizeProjectLinks } from '../presentation-links';

function input(reverse = false) {
  const evidence = emptyCandidateEvidence();
  evidence.identity = { fullName: 'Ada Lovelace', headline: 'Platform Engineer', evidenceIds: ['identity-current'] };
  evidence.contact = { email: 'ada@current.example', phone: '+44 7700 900123', location: 'Leeds', evidenceIds: ['contact-old', 'contact-current'] };
  const item = (id: string, sourceType: 'CAREER_PROFILE' | 'SOURCE_CV', snapshotId: string, canonicalData: Record<string, unknown>) => ({
    id, kind: 'CONTACT' as const, field: 'contact', canonicalText: id, canonicalData, provenance: sourceType,
    preservationTier: 0 as const, requirementIds: [],
    sourceRefs: [{ sourceType, entityType: 'Contact', entityId: 'contact-1', fieldPath: 'record', snapshotId }],
  });
  evidence.evidenceById['identity-current'] = { ...item('identity-current', 'CAREER_PROFILE', 'profile-current', { fullName: 'Ada Lovelace', headline: 'Platform Engineer' }), kind: 'IDENTITY' };
  evidence.evidenceById['contact-old'] = item('contact-old', 'SOURCE_CV', 'extract-1', { email: 'old@example.test', phone: '000', location: 'London' });
  evidence.evidenceById['contact-current'] = item('contact-current', 'CAREER_PROFILE', 'profile-current', { email: 'ada@current.example', phone: '+44 7700 900123', location: 'Leeds' });

  const links = [
    { id: 'email-link', label: 'Email', url: 'mailto:ada@current.example', type: 'EMAIL' as const, evidenceId: 'email-link-record' },
    { id: 'phone-link', label: 'Phone', url: 'tel:+447700900123', type: 'PHONE' as const, evidenceId: 'phone-link-record' },
    { id: 'linkedin-a', label: 'LinkedIn', url: 'https://LINKEDIN.com/in/ada/', type: 'LINKEDIN' as const, evidenceId: 'linkedin-a-record' },
    { id: 'linkedin-b', label: 'LinkedIn profile', url: 'https://linkedin.com/in/ada', type: 'LINKEDIN' as const, evidenceId: 'linkedin-b-record' },
    { id: 'portfolio-a', label: 'Portfolio', url: 'https://ada.example/', type: 'PORTFOLIO' as const, evidenceId: 'portfolio-a-record' },
    { id: 'portfolio-b', label: 'Website', url: 'https://ADA.EXAMPLE', type: 'PERSONAL_WEBSITE' as const, evidenceId: 'portfolio-b-record' },
    { id: 'project-live', label: 'Live', url: 'https://lighthouse.example/', type: 'PROJECT_LIVE' as const, evidenceId: 'project-live-record', projectId: 'project-extracted' },
    { id: 'project-repo', label: 'Repository', url: 'https://github.com/example/lighthouse/', type: 'PROJECT_REPOSITORY' as const, evidenceId: 'project-repo-record', projectId: 'project-extracted' },
    { id: 'invalid', label: 'Debug', url: '[object Object]', type: 'OTHER' as const, evidenceId: 'invalid-record' },
  ];
  evidence.professionalLinks = reverse ? [...links].reverse() : links;
  for (const link of links) evidence.evidenceById[link.evidenceId] = {
    id: link.evidenceId, kind: link.type === 'EMAIL' || link.type === 'PHONE' ? 'CONTACT' : 'LINK', field: 'link', canonicalText: link.url,
    provenance: 'CAREER_PROFILE', preservationTier: 1, requirementIds: [],
    sourceRefs: [{ sourceType: 'CAREER_PROFILE', entityType: 'Link', entityId: link.id, fieldPath: 'url', snapshotId: 'profile-current' }],
  };
  return {
    evidence,
    selectedEvidenceIds: new Set<string>(Object.keys(evidence.evidenceById)),
    patches: new Map<string, string>(),
    authorityContext: { currentProfileSnapshotId: 'profile-current', matchProfileSnapshotId: 'profile-match' },
  };
}

describe('presentation contact and links', () => {
  it('uses current canonical identity/contact fields independently of input order', () => {
    expect(normalizePresentationIdentity(input()).identity).toEqual(normalizePresentationIdentity(input(true)).identity);
    expect(normalizePresentationIdentity(input()).identity).toEqual({
      fullName: 'Ada Lovelace', headline: 'Platform Engineer', email: 'ada@current.example', phone: '+44 7700 900123', location: 'Leeds',
    });
  });

  it('deduplicates professional links, binds duplicates, and attaches project links through aliases', () => {
    const normalized = normalizeProjectLinks(input().evidence.professionalLinks, new Map([['project-extracted', 'project:lighthouse']]), input().selectedEvidenceIds);

    expect(normalized.links.map(({ type }) => type)).toEqual(['LINKEDIN', 'PORTFOLIO']);
    expect(normalized.projectLinks.get('project:lighthouse')?.map(({ type }) => type)).toEqual(['PROJECT_LIVE', 'PROJECT_REPOSITORY']);
    expect(normalized.bindings.find(({ nodeId }) => nodeId === 'link:linkedin-a')?.evidenceIds).toEqual(['linkedin-a-record', 'linkedin-b-record']);
    expect(normalized.bindings.find(({ nodeId }) => nodeId === 'link:portfolio-a')?.evidenceIds).toEqual(['portfolio-a-record', 'portfolio-b-record']);
    expect(JSON.stringify(normalized)).not.toContain('[object Object]');
  });

  it('binds email and phone links to header fields instead of rendering them as links', () => {
    const normalized = normalizePresentationIdentity(input());
    expect(normalized.bindings.find(({ nodeId }) => nodeId === 'identity:email')?.evidenceIds).toEqual(expect.arrayContaining(['contact-current', 'email-link-record']));
    expect(normalized.bindings.find(({ nodeId }) => nodeId === 'identity:phone')?.evidenceIds).toEqual(expect.arrayContaining(['contact-current', 'phone-link-record']));
  });

  it('normalizes host casing and trailing slashes for comparison', () => {
    expect(normalizeProfessionalUrl('https://EXAMPLE.com/path/')).toBe('https://example.com/path');
    expect(normalizeProfessionalUrl('[object Object]')).toBeNull();
  });
});
