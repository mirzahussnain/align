import { describe, expect, it } from 'vitest';
import { AI_PROVIDER_DEFINITIONS } from '@/shared/config/ai-runtime';
import { preflightAiRequest } from '@/shared/services/ai-request-budget';
import { CV_REWRITE_PATCH_CONTRACT } from '../rewrite-contract';
import { serializeApprovedEvidenceForRewrite } from '../rewrite-serializer';
import { emptyCandidateEvidence } from '../merge-evidence';
import type { ApprovedCvPlan, CandidateEvidenceItem } from '../types';

const ref = (id: string, sourceType: CandidateEvidenceItem['provenance'] = 'CAREER_PROFILE') => ({
  sourceType, entityType: 'ProductionFixture', entityId: `entity-${id}`, fieldPath: 'record', snapshotId: 'fixture-v1',
});

function productionFixture() {
  const evidence = emptyCandidateEvidence();
  const selected: string[] = [];
  for (let index = 0; index < 128; index += 1) {
    const id = `structural-${index}`;
    evidence.evidenceById[id] = {
      id, kind: index % 5 === 0 ? 'SKILL' : index % 5 === 1 ? 'PROJECT' : index % 5 === 2 ? 'EMPLOYMENT' : index % 5 === 3 ? 'EDUCATION' : 'LINK',
      field: index % 5 === 0 ? 'skill' : index % 5 === 1 ? 'project' : index % 5 === 2 ? 'employment' : index % 5 === 3 ? 'education' : 'PORTFOLIO',
      canonicalText: `Structural record ${index} retained locally with verified facts.`,
      canonicalData: { recordIndex: index, stable: true }, provenance: 'CAREER_PROFILE', preservationTier: index % 3 === 0 ? 0 : 1,
      requirementIds: [], sourceRefs: [ref(id)],
    };
    selected.push(id);
  }
  for (let index = 0; index < 26; index += 1) {
    const id = index === 0 ? 'summary' : index === 1 ? 'caretrack-dotnet' : index === 2 ? 'caretrack-api' : `rewriteable-${index}`;
    const applicationOnly = index % 2 === 1;
    evidence.evidenceById[id] = {
      id, kind: index === 0 ? 'OTHER' : index % 3 === 0 ? 'ACHIEVEMENT' : 'PROJECT',
      field: index === 0 ? 'summary' : 'project.achievement',
      canonicalText: index === 1
        ? "Used C# and .NET to build CareTrack's backend, implementing application logic and API endpoints with verified database workflows."
        : index === 2
          ? 'Designed and implemented REST API integrations for CareTrack using approved backend and database evidence.'
          : `Delivered verified application outcome ${index} using approved evidence, documented implementation decisions, stakeholder context and measurable operational impact.`,
      ...(index === 0 ? {} : { canonicalData: { fieldKind: 'ACHIEVEMENT', persistenceScope: applicationOnly ? 'APPLICATION_ONLY' : 'CAREER_PROFILE_AND_APPLICATION' } }),
      sourceEntityId: 'caretrack', provenance: applicationOnly ? 'APPLICATION_EVIDENCE' : 'HITL', preservationTier: index % 4 === 0 ? 1 : 0,
      requirementIds: [`requirement-${index}`, ...(index === 1 ? ['requirement-api'] : [])],
      sourceRefs: [ref(id, applicationOnly ? 'APPLICATION_EVIDENCE' : 'HITL')],
    };
    selected.push(id);
  }
  const plan: ApprovedCvPlan = {
    schemaVersion: 1, sourceMode: 'JOB_MATCH', atsStrategy: 'STANDARD', targetStrategy: 'JUNIOR_PROJECT_HEAVY',
    sectionOrder: ['PROFILE', 'SKILLS', 'PROJECTS', 'EDUCATION', 'EXPERIENCE'], density: 'COMPACT', targetLength: 'TWO_PAGES',
    includedEvidenceIds: selected, optionalEvidenceIds: [], omittedEvidence: [], professionalLinkIds: [], projectLinkIds: [],
    coveredRequirementIds: selected.slice(128).map((_, index) => `requirement-${index}`),
    unresolvedRequirementIds: ['requirement-umbraco', 'requirement-commercial-duration'], approvedAt: new Date(0).toISOString(),
  };
  return { evidence, plan };
}

function fullPrompt(approvedInput: string) {
  const target = {
    jobTitle: 'Full Stack Software Engineer', company: 'Northstar Health', seniority: 'mid',
    requirements: [
      'Build maintainable C# and .NET backend services and typed REST API integrations.',
      'Develop accessible React interfaces using modern front-end engineering practices.',
      'Work with relational databases, troubleshooting, Git workflows and cloud deployment.',
      'Communicate implementation decisions clearly while preserving factual candidate evidence.',
    ],
    vacancyContext: 'The role supports a regulated healthcare platform and values evidence-led delivery, API reliability, maintainable code, database development and collaborative problem solving.',
    targetingNotes: 'Tailor wording to approved evidence while preserving exact scope, seniority, chronology, metrics and technology context. '.repeat(4),
  };
  return [
    'Rewrite only the approved evidence below for the stated target. Return only the strict patch schema. Each patch must target one approved evidenceId and include that same id in sourceEvidenceIds. Never invent, infer, merge, remove, or upgrade a fact. Preserve every metric, date, employer, qualification, credential and eligibility fact exactly. Omit a patch when wording should remain unchanged.',
    `TARGET CONTEXT:\n${JSON.stringify(target)}`,
    `APPROVED INPUT:\n${approvedInput}`,
  ].join('\n\n');
}

function serializeAllApprovedEvidence(evidence: ReturnType<typeof productionFixture>['evidence'], plan: ApprovedCvPlan) {
  return JSON.stringify({
    task: 'Return rewrite patches only. Keep facts, metrics, dates, employers, qualifications and eligibility unchanged. Do not add evidence or omit an item merely because it does not need rewriting.',
    atsStrategy: plan.atsStrategy, targetStrategy: plan.targetStrategy,
    approvedEvidence: plan.includedEvidenceIds.map((id) => {
      const item = evidence.evidenceById[id];
      return { evidenceId: id, kind: item.kind, field: item.field, text: item.canonicalText, requirementIds: item.requirementIds };
    }),
  });
}

describe('production-shaped rewrite payload regression', () => {
  it('reduces 154 approved records to 26 patchable records and fits unchanged Groq limits', () => {
    const { evidence, plan } = productionFixture();
    const compact = serializeApprovedEvidenceForRewrite(evidence, plan);
    const providerEvidence = JSON.parse(compact).approvedEvidence;
    const groq = AI_PROVIDER_DEFINITIONS.find((provider) => provider.provider === 'groq')!;
    const before = preflightAiRequest(fullPrompt(serializeAllApprovedEvidence(evidence, plan)), groq.requestBudget, CV_REWRITE_PATCH_CONTRACT.jsonSchema);
    const after = preflightAiRequest(fullPrompt(compact), groq.requestBudget, CV_REWRITE_PATCH_CONTRACT.jsonSchema);

    expect(plan.includedEvidenceIds).toHaveLength(154);
    expect(providerEvidence).toHaveLength(26);
    expect(providerEvidence.map((item: { evidenceId: string }) => item.evidenceId)).toEqual(expect.arrayContaining(['summary', 'caretrack-dotnet', 'caretrack-api']));
    expect(compact).not.toContain('requirement-umbraco');
    expect(compact).not.toContain('requirement-commercial-duration');
    expect(before.estimatedInputTokens).toBeGreaterThanOrEqual(6_800);
    expect(before.estimatedInputTokens).toBeLessThanOrEqual(7_500);
    expect(after.estimatedInputTokens).toBeGreaterThanOrEqual(2_300);
    expect(after.estimatedInputTokens).toBeLessThanOrEqual(2_500);
    expect(after).toMatchObject({ maxCompletionTokens: 3_500, safetyMarginTokens: 512, allowed: true });
    expect(after.headroomTokens).toBeGreaterThan(0);
    expect(evidence.evidenceById).toHaveProperty('structural-127');
  });
});
