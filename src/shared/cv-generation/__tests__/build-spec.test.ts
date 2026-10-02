import { describe, expect, it } from 'vitest';
import { assembleCvBuildSpec, validateBuildSpecPreservation } from '../build-spec';
import { emptyCandidateEvidence } from '../merge-evidence';
import type { ApprovedCvPlan, CandidateEvidenceItem } from '../types';

describe('V2 deterministic build assembly', () => {
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
});
