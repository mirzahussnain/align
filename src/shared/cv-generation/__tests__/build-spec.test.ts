import { describe, expect, it } from 'vitest';
import { assembleCvBuildSpec, validateBuildSpec, validateBuildSpecPreservation } from '../build-spec';
import { emptyCandidateEvidence } from '../merge-evidence';
import { validateRewritePatches } from '../rewrite-validator';
import type { ApprovedCvPlan, CandidateEvidenceItem } from '../types';

function fixture() {
  const evidence = emptyCandidateEvidence();
  const add = (item: CandidateEvidenceItem) => { evidence.evidenceById[item.id] = item; };
  const record = (id: string, kind: CandidateEvidenceItem['kind'], entityId: string, canonicalData: Record<string, unknown>): CandidateEvidenceItem => ({
    id, kind, field: 'record', canonicalText: id, canonicalData, provenance: 'CAREER_PROFILE', preservationTier: 1, requirementIds: [],
    sourceRefs: [{ sourceType: 'CAREER_PROFILE', entityType: kind, entityId, fieldPath: 'record', snapshotId: 'profile-current' }],
  });
  add(record('project-record', 'PROJECT', 'project-1', { name: 'Lighthouse API' }));
  add(record('role-record', 'EMPLOYMENT', 'role-1', { title: 'Platform Engineer', employer: 'Northwind Robotics' }));
  add(record('skill-record', 'SKILL', 'skill-rust', { name: 'Rust', category: 'Languages' }));
  add(record('education-record', 'EDUCATION', 'education-1', { degree: 'BSc Data Engineering', institution: 'Westbridge Institute' }));
  add({ id: 'project-line', kind: 'ACHIEVEMENT', field: 'project.achievement', canonicalText: 'Reduced API latency by 25%.', provenance: 'APPLICATION_EVIDENCE', preservationTier: 0, requirementIds: ['r-api'], sourceEntityId: 'project-1', sourceRefs: [{ sourceType: 'APPLICATION_EVIDENCE', entityType: 'PROJECT', entityId: 'project-1', fieldPath: 'achievement' }] });
  evidence.projects.push({ id: 'project-1', sourceEntityId: 'project-1', label: 'Lighthouse API', details: { name: 'Lighthouse API', excerpt: 'hide', skillIds: ['hide'] }, evidenceIds: ['project-record', 'project-line'] });
  evidence.employment.push({ id: 'role-1', sourceEntityId: 'role-1', label: 'Platform Engineer', details: { title: 'Platform Engineer', employer: 'Northwind Robotics' }, evidenceIds: ['role-record'] });
  evidence.skills.push({ id: 'skill-rust', sourceEntityId: 'skill-rust', label: 'Rust', name: 'Rust', category: 'Languages', details: {}, evidenceIds: ['skill-record'] });
  evidence.education.push({ id: 'education-1', sourceEntityId: 'education-1', label: 'BSc Data Engineering', details: { degree: 'BSc Data Engineering', institution: 'Westbridge Institute' }, evidenceIds: ['education-record'] });
  const plan: ApprovedCvPlan = {
    schemaVersion: 1, sourceMode: 'JOB_MATCH', atsStrategy: 'STANDARD', targetStrategy: 'EXPERIENCE_FORWARD',
    sectionOrder: ['PROJECTS', 'EXPERIENCE', 'SKILLS', 'EDUCATION'], density: 'BALANCED', targetLength: 'ONE_PAGE',
    includedEvidenceIds: ['project-record', 'project-line', 'role-record', 'skill-record', 'education-record'], optionalEvidenceIds: [], omittedEvidence: [],
    professionalLinkIds: [], projectLinkIds: [], coveredRequirementIds: ['r-api'], unresolvedRequirementIds: [], approvedAt: new Date(0).toISOString(),
  };
  return { evidence, plan };
}

describe('V2 normalized build assembly', () => {
  it('emits version 4 in approved order with presentation-safe fields and deliberate bindings', () => {
    const { evidence, plan } = fixture();
    const spec = assembleCvBuildSpec({ generationId: 'g1', evidence, plan, templateId: 'architect', authorityContext: { currentProfileSnapshotId: 'profile-current' } });

    expect(spec.version).toBe(4);
    expect(spec.sections.map(({ type }) => type)).toEqual(['PROJECTS', 'EXPERIENCE', 'SKILLS', 'EDUCATION']);
    expect(new Set(spec.evidenceBindings.flatMap(({ evidenceIds }) => evidenceIds))).toEqual(new Set(plan.includedEvidenceIds));
    expect(JSON.stringify(spec)).not.toMatch(/metadata|Excerpt|Skill Ids|canonicalData|Category:|Company:|Degree:|University:/);
  });

  it('uses bindings for strict preservation and provenance validation', () => {
    const { evidence, plan } = fixture();
    const spec = assembleCvBuildSpec({ generationId: 'g1', evidence, plan, templateId: 'architect' });
    const projectBinding = spec.evidenceBindings.find(({ evidenceIds }) => evidenceIds.includes('project-record'))!;
    projectBinding.evidenceIds = projectBinding.evidenceIds.filter((id) => id !== 'project-record');
    expect(validateBuildSpecPreservation(spec, evidence)).toContain('project-record');

    spec.evidenceBindings.push({ nodeId: 'unknown', evidenceIds: ['not-approved'] });
    expect(validateBuildSpec(spec, evidence, plan).provenance).toContainEqual({ evidenceId: 'not-approved', code: 'PROVENANCE_VALIDATION_FAILED' });
  });

  it('rejects structural presentation text unsupported by its bound evidence', () => {
    const { evidence, plan } = fixture();
    const spec = assembleCvBuildSpec({ generationId: 'g1', evidence, plan, templateId: 'architect' });
    const projects = spec.sections.find((section) => section.type === 'PROJECTS');
    if (projects?.type !== 'PROJECTS') throw new Error('Expected projects section');
    projects.items[0].name = 'Invented Project';

    expect(validateBuildSpec(spec, evidence, plan).truth).toContainEqual({ evidenceId: 'project-record', code: 'TRUTH_VALIDATION_FAILED' });
  });

  it('models selected impact as entity-headed groups', () => {
    const { evidence, plan } = fixture();
    evidence.evidenceById['role-line'] = { id: 'role-line', kind: 'ACHIEVEMENT', field: 'experience.achievement', canonicalText: 'Improved platform reliability.', provenance: 'APPLICATION_EVIDENCE', preservationTier: 0, requirementIds: [], sourceEntityId: 'role-1', sourceRefs: [{ sourceType: 'APPLICATION_EVIDENCE', entityType: 'EXPERIENCE', entityId: 'role-1', fieldPath: 'achievement' }] };
    evidence.employment[0].evidenceIds.push('role-line');
    plan.includedEvidenceIds.push('role-line');
    plan.sectionOrder = ['EXPERIENCE', 'SELECTED_IMPACT'];
    const spec = assembleCvBuildSpec({ generationId: 'g1', evidence, plan, templateId: 'architect' });
    const selectedImpact = spec.sections.find((section) => section.type === 'SELECTED_IMPACT');

    expect(selectedImpact).toEqual(expect.objectContaining({
      type: 'SELECTED_IMPACT',
      items: [expect.objectContaining({ heading: 'Platform Engineer — Northwind Robotics' })],
    }));
  });

  it('uses explicit source order for entities instead of stable hash or entity IDs', () => {
    const { evidence, plan } = fixture();
    const earlier = recordForOrder('role-z-record', 'role-z', 'Earlier Role', 'First Company', 0);
    const later = recordForOrder('role-a-record', 'role-a', 'Later Role', 'Second Company', 1);
    evidence.evidenceById[earlier.id] = earlier;
    evidence.evidenceById[later.id] = later;
    evidence.employment = [
      { id: 'role-z', sourceEntityId: 'role-z', label: 'Earlier Role', details: { title: 'Earlier Role', employer: 'First Company', sortOrder: 0 }, evidenceIds: [earlier.id] },
      { id: 'role-a', sourceEntityId: 'role-a', label: 'Later Role', details: { title: 'Later Role', employer: 'Second Company', sortOrder: 1 }, evidenceIds: [later.id] },
    ];
    plan.includedEvidenceIds = [earlier.id, later.id];
    plan.sectionOrder = ['EXPERIENCE'];

    const spec = assembleCvBuildSpec({ generationId: 'g1', evidence, plan, templateId: 'architect', authorityContext: { currentProfileSnapshotId: 'profile-current' } });
    const section = spec.sections.find((item) => item.type === 'EXPERIENCE');
    expect(section?.items.map((item) => item.title)).toEqual(['Earlier Role', 'Later Role']);
  });

  it('validates a rewritten line through its representative and keeps rejected text unchanged', () => {
    const { evidence, plan } = fixture();
    const validated = validateRewritePatches({ schemaVersion: 1, patches: [
      { evidenceId: 'project-line', text: 'Reduced API latency by 90%.', sourceEvidenceIds: ['project-line'] },
    ] }, evidence, plan);
    const spec = assembleCvBuildSpec({ generationId: 'g1', evidence, plan, templateId: 'architect', patches: validated.patches });
    const projectSection = spec.sections.find((section) => section.type === 'PROJECTS');
    expect(projectSection?.items[0].lines).toEqual([{ id: 'project-line', text: 'Reduced API latency by 25%.' }]);
    expect(validateBuildSpec(spec, evidence, plan)).toEqual({ ok: true, truth: [], provenance: [], preservation: [] });
  });
});

function recordForOrder(id: string, entityId: string, title: string, employer: string, sortOrder: number): CandidateEvidenceItem {
  return {
    id, kind: 'EMPLOYMENT', field: 'record', canonicalText: title,
    canonicalData: { title, employer, sortOrder },
    provenance: 'CAREER_PROFILE', preservationTier: 1, requirementIds: [],
    sourceRefs: [{ sourceType: 'CAREER_PROFILE', entityType: 'Experience', entityId, fieldPath: 'record', snapshotId: 'profile-current' }],
  };
}
