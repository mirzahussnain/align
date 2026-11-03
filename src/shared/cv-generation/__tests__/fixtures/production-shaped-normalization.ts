import { emptyCandidateEvidence } from '../../merge-evidence';
import type { ApprovedCvPlan, CandidateEvidenceItem, EvidenceSourceType } from '../../types';
import type { NormalizationAuthorityContext } from '../../presentation-authority';

export function createProductionShapedNormalizationFixture(): {
  evidence: ReturnType<typeof emptyCandidateEvidence>;
  plan: ApprovedCvPlan;
  authorityContext: NormalizationAuthorityContext;
  expected: { experienceCount: number; projectCount: number; educationCount: number; skillCount: number };
} {
  const evidence = emptyCandidateEvidence();
  const selected: string[] = [];
  const add = (item: CandidateEvidenceItem) => { evidence.evidenceById[item.id] = item; selected.push(item.id); };
  const structural = (id: string, kind: CandidateEvidenceItem['kind'], sourceType: EvidenceSourceType, entityId: string, snapshotId: string, canonicalData: Record<string, unknown>): CandidateEvidenceItem => ({
    id, kind, field: 'record', canonicalText: id, canonicalData, provenance: sourceType, preservationTier: 1, requirementIds: [],
    sourceRefs: [{ sourceType, entityType: kind, entityId, fieldPath: 'record', snapshotId }],
  });

  add(structural('identity-current', 'IDENTITY', 'CAREER_PROFILE', 'identity-1', 'profile-current', { fullName: 'Alex McCandidate', headline: 'Platform Engineer' }));
  add(structural('contact-old', 'CONTACT', 'SOURCE_CV', 'contact-1', 'extract-1', { email: 'old@example.test', phone: '000', location: 'London' }));
  add(structural('contact-current', 'CONTACT', 'CAREER_PROFILE', 'contact-1', 'profile-current', { email: 'alex@example.com', phone: '+44 7700 900123', location: 'Leeds' }));
  evidence.identity = { fullName: 'Alex McCandidate', headline: 'Platform Engineer', evidenceIds: ['identity-current'] };
  evidence.contact = { email: 'alex@example.com', phone: '+44 7700 900123', location: 'Leeds', evidenceIds: ['contact-old', 'contact-current'] };

  add(structural('role-extracted', 'EMPLOYMENT', 'SOURCE_CV', 'role-1', 'extract-1', { title: 'Platform Engineer', employer: 'Northwind Robotics', startDate: '2023-01' }));
  add(structural('role-current', 'EMPLOYMENT', 'CAREER_PROFILE', 'role-1', 'profile-current', { title: 'Platform Engineer', employer: 'Northwind Robotics', startDate: '2023-01', location: 'Leeds' }));
  evidence.employment.push(
    { id: 'role-extracted', sourceEntityId: 'role-1', label: 'Platform Engineer', details: { title: 'Platform Engineer', employer: 'Northwind Robotics', startDate: '2023-01', excerpt: 'hide' }, evidenceIds: ['role-extracted'] },
    { id: 'role-current', sourceEntityId: 'role-1', label: 'Platform Engineer', details: { title: 'Platform Engineer', employer: 'Northwind Robotics', startDate: '2023-01', location: 'Leeds' }, evidenceIds: ['role-current'] },
  );
  for (const [id, text, source] of [
    ['role-achievement-a', 'Led a safe platform migration.', 'HITL'],
    ['role-achievement-b', '  LED\u00a0A SAFE PLATFORM MIGRATION. ', 'APPLICATION_EVIDENCE'],
  ] as const) add({ id, kind: 'ACHIEVEMENT', field: 'experience.achievement', canonicalText: text, provenance: source, preservationTier: 0, requirementIds: ['r-platform'], sourceEntityId: 'role-1', sourceRefs: [{ sourceType: source, entityType: 'EXPERIENCE', entityId: 'role-1', fieldPath: 'achievement' }] });

  add(structural('project-extracted', 'PROJECT', 'SOURCE_CV', 'project-1', 'extract-1', { name: 'Lighthouse API', repositoryUrl: 'https://github.com/example/lighthouse' }));
  add(structural('project-current', 'PROJECT', 'CAREER_PROFILE', 'project-1', 'profile-current', { name: 'Lighthouse API', repositoryUrl: 'https://github.com/example/lighthouse', technologies: ['TypeScript', 'PostgreSQL'] }));
  evidence.projects.push(
    { id: 'project-extracted', sourceEntityId: 'project-1', label: 'Lighthouse API', details: { name: 'Lighthouse API', repositoryUrl: 'https://github.com/example/lighthouse', skillIds: ['hide'] }, evidenceIds: ['project-extracted'] },
    { id: 'project-current', sourceEntityId: 'project-1', label: 'Lighthouse API', details: { name: 'Lighthouse API', repositoryUrl: 'https://github.com/example/lighthouse', technologies: ['TypeScript', 'PostgreSQL'] }, evidenceIds: ['project-current'] },
  );
  add({ id: 'project-achievement', kind: 'ACHIEVEMENT', field: 'project.achievement', canonicalText: 'Reduced API latency by 35%.', provenance: 'APPLICATION_EVIDENCE', preservationTier: 0, requirementIds: ['r-api'], sourceEntityId: 'project-1', sourceRefs: [{ sourceType: 'APPLICATION_EVIDENCE', entityType: 'PROJECT', entityId: 'project-1', fieldPath: 'achievement' }] });

  add(structural('education-extracted', 'EDUCATION', 'SOURCE_CV', 'education-1', 'extract-1', { degree: 'BSc Data Engineering — adjacent record', institution: 'Wrong fragment' }));
  add(structural('education-current', 'EDUCATION', 'CAREER_PROFILE', 'education-1', 'profile-current', { degree: 'BSc Data Engineering', institution: 'Westbridge Institute' }));
  evidence.education.push(
    { id: 'education-extracted', sourceEntityId: 'education-1', label: 'Education', details: { degree: 'BSc Data Engineering — adjacent record', institution: 'Wrong fragment', reconciliation: { hide: true } }, evidenceIds: ['education-extracted'] },
    { id: 'education-current', sourceEntityId: 'education-1', label: 'BSc Data Engineering', details: { degree: 'BSc Data Engineering', institution: 'Westbridge Institute' }, evidenceIds: ['education-current'] },
  );

  for (const [id, name, category, sourceType, entityId] of [
    ['rust-extracted', 'rust', 'Tools', 'SOURCE_CV', 'rust-source'], ['rust-current', 'Rust', 'Languages', 'CAREER_PROFILE', 'skill-rust'],
    ['svelte-current', 'Svelte', 'Frameworks', 'CAREER_PROFILE', 'skill-svelte'], ['cockroach-current', 'CockroachDB', 'Databases', 'CAREER_PROFILE', 'skill-cockroach'],
  ] as const) {
    add(structural(`${id}-record`, 'SKILL', sourceType, entityId, sourceType === 'SOURCE_CV' ? 'extract-1' : 'profile-current', { name, category }));
    evidence.skills.push({ id, sourceEntityId: entityId, label: name, name, category, details: {}, evidenceIds: [`${id}-record`] });
  }
  add(structural('sparse-rust-record', 'PROJECT', 'SOURCE_CV', 'sparse-rust', 'extract-1', { name: 'Rust' }));
  evidence.projects.push({ id: 'sparse-rust', sourceEntityId: 'sparse-rust', label: 'Rust', details: { name: 'Rust' }, evidenceIds: ['sparse-rust-record'] });

  const links = [
    ['email', 'Email', 'mailto:alex@example.com', 'EMAIL', undefined], ['phone', 'Phone', 'tel:+447700900123', 'PHONE', undefined],
    ['linkedin-a', 'LinkedIn', 'https://LINKEDIN.com/in/alex/', 'LINKEDIN', undefined], ['linkedin-b', 'LinkedIn profile', 'https://linkedin.com/in/alex', 'LINKEDIN', undefined],
    ['live-a', 'Live demo', 'https://lighthouse.example/', 'PROJECT_LIVE', 'project-extracted'], ['live-b', 'Live demo', 'https://LIGHTHOUSE.EXAMPLE', 'PROJECT_LIVE', 'project-current'],
  ] as const;
  for (const [id, label, url, type, projectId] of links) {
    const evidenceId = `${id}-record`;
    add({ id: evidenceId, kind: type === 'EMAIL' || type === 'PHONE' ? 'CONTACT' : 'LINK', field: 'link', canonicalText: url, provenance: 'CAREER_PROFILE', preservationTier: 1, requirementIds: [], sourceRefs: [{ sourceType: 'CAREER_PROFILE', entityType: 'Link', entityId: id, fieldPath: 'url', snapshotId: 'profile-current' }] });
    evidence.professionalLinks.push({ id, label, url, type, evidenceId, projectId });
  }

  const plan: ApprovedCvPlan = {
    schemaVersion: 1, sourceMode: 'JOB_MATCH', atsStrategy: 'STANDARD', targetStrategy: 'EXPERIENCE_FORWARD',
    sectionOrder: ['PROJECTS', 'EXPERIENCE', 'SKILLS', 'EDUCATION'], density: 'BALANCED', targetLength: 'TWO_PAGES',
    includedEvidenceIds: selected, optionalEvidenceIds: [], omittedEvidence: [], professionalLinkIds: ['linkedin-a', 'linkedin-b'], projectLinkIds: ['live-a', 'live-b'],
    coveredRequirementIds: ['r-platform', 'r-api'], unresolvedRequirementIds: [], approvedAt: new Date(0).toISOString(),
  };
  return { evidence, plan, authorityContext: { currentProfileSnapshotId: 'profile-current', matchProfileSnapshotId: 'profile-match' }, expected: { experienceCount: 1, projectCount: 1, educationCount: 1, skillCount: 3 } };
}
