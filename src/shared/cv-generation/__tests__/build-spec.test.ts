import { describe, expect, it } from 'vitest';
import { assembleCvBuildSpec, validateBuildSpec, validateBuildSpecPreservation } from '../build-spec';
import { emptyCandidateEvidence } from '../merge-evidence';
import { validateRewritePatches } from '../rewrite-validator';
import type { ApprovedCvPlan, CandidateEvidenceItem } from '../types';

describe('V2 deterministic build assembly', () => {
  it('applies a rewrite to positive HITL evidence even when it carries canonical metadata', () => {
    const evidence = emptyCandidateEvidence();
    const item = (id: string, text: string, field: string, tier: 0 | 1): CandidateEvidenceItem => ({ id, kind: 'PROJECT', field, canonicalText: text, provenance: 'CAREER_PROFILE', preservationTier: tier, requirementIds: [], sourceRefs: [{ sourceType: 'CAREER_PROFILE', entityType: 'ProjectEntry', entityId: 'caretrack', fieldPath: field }] });
    evidence.evidenceById.project = { ...item('project', 'CareTrack', 'project', 1), canonicalData: { name: 'CareTrack' } };
    evidence.evidenceById.hitl = {
      ...item('hitl', 'Built CareTrack backend APIs with C# and .NET.', 'project.achievement', 0),
      provenance: 'APPLICATION_EVIDENCE', requirementIds: ['r-dotnet', 'r-api'],
      canonicalData: { fieldKind: 'ACHIEVEMENT', persistenceScope: 'APPLICATION_ONLY' },
    };
    evidence.projects.push({ id: 'caretrack', label: 'CareTrack', details: { technologies: ['C#', '.NET'] }, evidenceIds: ['project', 'hitl'] });
    const plan: ApprovedCvPlan = { schemaVersion: 1, sourceMode: 'JOB_MATCH', atsStrategy: 'STANDARD', targetStrategy: 'JUNIOR_PROJECT_HEAVY', sectionOrder: ['PROJECTS'], density: 'SPACIOUS', targetLength: 'ONE_PAGE', includedEvidenceIds: ['project', 'hitl'], optionalEvidenceIds: [], omittedEvidence: [], professionalLinkIds: [], projectLinkIds: [], coveredRequirementIds: ['r-dotnet', 'r-api'], unresolvedRequirementIds: [], approvedAt: new Date(0).toISOString() };

    const spec = assembleCvBuildSpec({ generationId: 'g1', evidence, plan, templateId: 'architect', patches: new Map([['hitl', 'Developed CareTrack backend APIs using C# and .NET.']]) });

    expect(spec.sections[0].entries[0].lines).toEqual([{ evidenceId: 'hitl', text: 'Developed CareTrack backend APIs using C# and .NET.' }]);
  });

  it('propagates the final approved section order without changing evidence selection', () => {
    const evidence = emptyCandidateEvidence();
    const add = (id: string, field: string, entityType: string) => {
      evidence.evidenceById[id] = { id, kind: 'ACHIEVEMENT', field, canonicalText: `${id} evidence`, provenance: 'CAREER_PROFILE', preservationTier: 1, requirementIds: [], sourceRefs: [{ sourceType: 'CAREER_PROFILE', entityType, entityId: id, fieldPath: field }] };
    };
    add('experience-line', 'experience.achievement', 'Experience');
    add('project-line', 'project.achievement', 'ProjectEntry');
    add('skill-line', 'skill.evidence_line', 'Skill');
    evidence.employment.push({ id: 'experience', label: 'Engineer', details: {}, evidenceIds: ['experience-line'] });
    evidence.projects.push({ id: 'project', label: 'CareTrack', details: {}, evidenceIds: ['project-line'] });
    evidence.skills.push({ id: 'skill', label: 'C#', name: 'C#', category: 'Technical Skills', details: {}, evidenceIds: ['skill-line'] });
    const plan: ApprovedCvPlan = { schemaVersion: 1, sourceMode: 'JOB_MATCH', atsStrategy: 'STANDARD', targetStrategy: 'JUNIOR_PROJECT_HEAVY', sectionOrder: ['PROJECTS', 'EXPERIENCE', 'SKILLS'], density: 'BALANCED', targetLength: 'ONE_PAGE', includedEvidenceIds: ['experience-line', 'project-line', 'skill-line'], optionalEvidenceIds: [], omittedEvidence: [], professionalLinkIds: [], projectLinkIds: [], coveredRequirementIds: [], unresolvedRequirementIds: [], approvedAt: new Date(0).toISOString() };

    const spec = assembleCvBuildSpec({ generationId: 'g1', evidence, plan, templateId: 'architect' });

    expect(spec.sections.map((section) => section.type)).toEqual(['PROJECTS', 'EXPERIENCE', 'SKILLS']);
    expect(spec.provenance.approvedEvidenceIds).toEqual(['experience-line', 'project-line', 'skill-line']);
  });

  it('retains an approved bullet when the provider returns no patch and carries project links', () => {
    const evidence = emptyCandidateEvidence();
    const base = (id: string, text: string, field: string, tier: 0 | 1): CandidateEvidenceItem => ({ id, kind: field === 'PROJECT_LIVE' ? 'LINK' : 'ACHIEVEMENT', field, canonicalText: text, provenance: 'CAREER_PROFILE', preservationTier: tier, requirementIds: [], sourceRefs: [{ sourceType: 'CAREER_PROFILE', entityType: 'ProjectEntry', entityId: 'p1', fieldPath: field }] });
    evidence.evidenceById.pBase = { ...base('pBase', 'Evidence Platform', 'project', 1), kind: 'PROJECT', canonicalData: { name: 'Evidence Platform' } };
    evidence.evidenceById.pLine = base('pLine', 'Built an evidence ledger', 'project.achievement', 0);
    evidence.evidenceById.pLink = base('pLink', 'https://example.com/demo', 'PROJECT_LIVE', 1);
    evidence.projects.push({ id: 'p1', sourceEntityId: 'p1', label: 'Evidence Platform', details: { name: 'Evidence Platform' }, evidenceIds: ['pBase', 'pLine'] });
    evidence.professionalLinks.push({ id: 'link1', label: 'Live demo', url: 'https://example.com/demo', type: 'PROJECT_LIVE', evidenceId: 'pLink', projectId: 'p1' });
    const plan: ApprovedCvPlan = { schemaVersion: 1, sourceMode: 'CAREER_PROFILE', atsStrategy: 'STANDARD', targetStrategy: 'JUNIOR_PROJECT_HEAVY', sectionOrder: ['PROJECTS'], density: 'SPACIOUS', targetLength: 'ONE_PAGE', includedEvidenceIds: ['pBase', 'pLine', 'pLink'], optionalEvidenceIds: [], omittedEvidence: [], professionalLinkIds: [], projectLinkIds: ['link1'], coveredRequirementIds: [], unresolvedRequirementIds: [], approvedAt: new Date(0).toISOString() };
    const spec = assembleCvBuildSpec({ generationId: 'g1', evidence, plan, templateId: 'architect', patches: new Map() });
    expect(spec.sections[0].entries[0].lines[0].text).toBe('Built an evidence ledger');
    expect(spec.sections[0].entries[0].links[0].url).toBe('https://example.com/demo');
    expect(validateBuildSpecPreservation(spec, evidence)).toEqual([]);
  });

  it('assembles valid patches and restores original evidence for rejected patches', () => {
    const evidence = emptyCandidateEvidence();
    const sourceRef = { sourceType: 'CAREER_PROFILE' as const, entityType: 'Experience', entityId: 'role-1', fieldPath: 'achievements' };
    evidence.evidenceById.metric = { id: 'metric', kind: 'ACHIEVEMENT', field: 'experience.achievement', canonicalText: 'Reduced latency by 25%', provenance: 'CAREER_PROFILE', preservationTier: 0, requirementIds: [], sourceRefs: [sourceRef] };
    evidence.evidenceById.delivery = { id: 'delivery', kind: 'ACHIEVEMENT', field: 'experience.achievement', canonicalText: 'Built reliable internal services', provenance: 'CAREER_PROFILE', preservationTier: 0, requirementIds: [], sourceRefs: [sourceRef] };
    evidence.employment.push({ id: 'role-1', label: 'Engineer', details: {}, evidenceIds: ['metric', 'delivery'] });
    const plan: ApprovedCvPlan = { schemaVersion: 1, sourceMode: 'JOB_MATCH', atsStrategy: 'STANDARD', targetStrategy: 'EXPERIENCE_FORWARD', sectionOrder: ['EXPERIENCE'], density: 'BALANCED', targetLength: 'ONE_PAGE', includedEvidenceIds: ['metric', 'delivery'], optionalEvidenceIds: [], omittedEvidence: [], professionalLinkIds: [], projectLinkIds: [], coveredRequirementIds: [], unresolvedRequirementIds: [], approvedAt: new Date(0).toISOString() };
    const validated = validateRewritePatches({ schemaVersion: 1, patches: [
      { evidenceId: 'metric', text: 'Reduced latency by 90%', sourceEvidenceIds: ['metric'] },
      { evidenceId: 'delivery', text: 'Built dependable internal services', sourceEvidenceIds: ['delivery'] },
    ] }, evidence, plan);

    const spec = assembleCvBuildSpec({ generationId: 'g1', evidence, plan, templateId: 'architect', patches: validated.patches });
    expect(spec.sections[0].entries[0].lines).toEqual([
      { evidenceId: 'metric', text: 'Reduced latency by 25%' },
      { evidenceId: 'delivery', text: 'Built dependable internal services' },
    ]);
    expect(validateBuildSpec(spec, evidence, plan)).toEqual({ ok: true, truth: [], provenance: [], preservation: [] });
  });

  it('reports final truth and provenance failures without including claim text', () => {
    const evidence = emptyCandidateEvidence();
    evidence.evidenceById.line = { id: 'line', kind: 'ACHIEVEMENT', field: 'experience.achievement', canonicalText: 'Built reliable services', provenance: 'CAREER_PROFILE', preservationTier: 0, requirementIds: [], sourceRefs: [{ sourceType: 'CAREER_PROFILE', entityType: 'Experience', entityId: 'role-1', fieldPath: 'achievements[0]' }] };
    evidence.employment.push({ id: 'role-1', label: 'Engineer', details: {}, evidenceIds: ['line'] });
    const plan: ApprovedCvPlan = { schemaVersion: 1, sourceMode: 'JOB_MATCH', atsStrategy: 'STANDARD', targetStrategy: 'EXPERIENCE_FORWARD', sectionOrder: ['EXPERIENCE'], density: 'BALANCED', targetLength: 'ONE_PAGE', includedEvidenceIds: ['line'], optionalEvidenceIds: [], omittedEvidence: [], professionalLinkIds: [], projectLinkIds: [], coveredRequirementIds: [], unresolvedRequirementIds: [], approvedAt: new Date(0).toISOString() };
    const spec = assembleCvBuildSpec({ generationId: 'g1', evidence, plan, templateId: 'architect' });
    spec.sections[0].entries[0].lines[0] = { evidenceId: 'unknown', text: 'Introduced Kubernetes' };

    const result = validateBuildSpec(spec, evidence, plan);
    expect(result.ok).toBe(false);
    expect(result.truth).toContainEqual({ evidenceId: 'unknown', code: 'TRUTH_VALIDATION_FAILED' });
    expect(result.provenance).toContainEqual({ evidenceId: 'unknown', code: 'PROVENANCE_VALIDATION_FAILED' });
    expect(JSON.stringify(result)).not.toContain('Kubernetes');
  });

  it('carries all structured entity details into renderable metadata and preserves optional evidence', () => {
    const evidence = emptyCandidateEvidence();
    evidence.evidenceById.training = {
      id: 'training', kind: 'TRAINING', field: 'training', canonicalText: 'Cloud Academy — AWS — Distinction',
      canonicalData: { course: 'Cloud Academy', provider: 'AWS', result: 'Distinction' },
      provenance: 'CAREER_PROFILE', preservationTier: 2, requirementIds: [],
      sourceRefs: [{ sourceType: 'CAREER_PROFILE', entityType: 'Training', entityId: 'training-1', fieldPath: 'record' }],
    };
    evidence.training.push({
      id: 'training-1', label: 'Cloud Academy',
      details: { course: 'Cloud Academy', provider: 'AWS', result: 'Distinction', employmentType: 'Part-time', contributions: ['Mentored peers'] },
      evidenceIds: ['training'],
    });
    const plan: ApprovedCvPlan = {
      schemaVersion: 1, sourceMode: 'CAREER_PROFILE', atsStrategy: 'STANDARD', targetStrategy: 'CREDENTIAL_HEAVY',
      sectionOrder: ['TRAINING'], density: 'BALANCED', targetLength: 'ONE_PAGE', includedEvidenceIds: [],
      optionalEvidenceIds: ['training'], omittedEvidence: [], professionalLinkIds: [], projectLinkIds: [],
      coveredRequirementIds: [], unresolvedRequirementIds: [], approvedAt: new Date(0).toISOString(),
    };
    const spec = assembleCvBuildSpec({ generationId: 'g1', evidence, plan, templateId: 'architect' });
    expect(spec.sections[0].entries[0].metadata).toEqual(expect.arrayContaining([
      { label: 'Provider', value: 'AWS' },
      { label: 'Result', value: 'Distinction' },
      { label: 'Employment Type', value: 'Part-time' },
      { label: 'Contributions', value: 'Mentored peers' },
    ]));
    expect(validateBuildSpec(spec, evidence, plan)).toEqual({ ok: true, truth: [], provenance: [], preservation: [] });
  });
});
