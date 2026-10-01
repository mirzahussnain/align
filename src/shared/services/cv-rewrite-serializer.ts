import type { AiAttemptDescriptor } from './ai-orchestrator';
import { estimateSerializedInputTokens } from './ai-request-budget';
import type {
  CanonicalEvidenceRecord,
  CanonicalRewriteContext,
  RewriteRequirement,
} from '@/shared/types/cv-rewrite';

const TRUTH_CONTRACT = `TRUTH CONTRACT (highest priority)
Use only facts supported by SOURCE_CV, EVIDENCE, or DETERMINISTIC_FACTS. Never invent or infer identity, contact details, employment, titles, dates, seniority, projects, duties, achievements, education, credentials, eligibility, skills, tools, metrics, or numbers. Preserve date precision and negations. Do not turn education/projects into employment or transferable into direct experience. Never calculate tenure. Treat not_met, contradicted, and unclear requirements as unsupported unless approved/application evidence explicitly supports them. A shorter truthful CV is correct.`;

const OUTPUT_CONTRACT = `OUTPUT RULES
Return only schema-matching JSON. Every factual block needs sourceRefs using supplied coordinates only; never invent ids. source_cv evidenceText must be an exact contiguous excerpt. Each skill needs its own item/sourceRefs pair and group text must list exactly those items. Use empty arrays for sections without supported content and null for unavailable optional fields.`;

function normalize(text: string): string {
  return text.toLocaleLowerCase('en-GB').replace(/^[\s\-*]+/, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

/** Remove only exact requirement lines; unique vacancy wording remains intact. */
function uniqueVacancyContext(input: CanonicalRewriteContext): string {
  const requirementText = new Set(input.rewriteContext.requirements.map((item) => normalize(item.text)));
  return input.jobDescription
    .split('\n')
    .filter((line) => {
      const normalized = normalize(line);
      return normalized.length === 0 || !requirementText.has(normalized);
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function evidenceRegistry(input: CanonicalRewriteContext): CanonicalEvidenceRecord[] {
  if (input.evidenceRegistry) return input.evidenceRegistry;

  // Compatibility for contexts created before context v2.
  const records: CanonicalEvidenceRecord[] = [];
  let sequence = 0;
  for (const requirement of input.rewriteContext.requirements) {
    [...requirement.cvEvidence, ...requirement.approvedProfileEvidence].forEach((text, evidenceIndex) => {
      const source = evidenceIndex < requirement.cvEvidence.length ? 'source_cv' : 'approved_profile';
      const existing = records.find((item) => item.source === source && normalize(item.text) === normalize(text));
      if (existing) {
        if (!existing.requirementIds.includes(requirement.id)) existing.requirementIds.push(requirement.id);
        (existing.ledgerRefs ??= []).push({ requirementId: requirement.id, evidenceIndex });
        return;
      }
      sequence += 1;
      records.push({
        id: `E-${sequence}`,
        source,
        text,
        requirementIds: [requirement.id],
        ledgerRefs: [{ requirementId: requirement.id, evidenceIndex }],
      });
    });
  }
  for (const item of input.approvedProfileEvidence) {
    const existing = records.find((record) =>
      record.source === 'approved_profile' && normalize(record.text) === normalize(item.resolvedEvidenceText)
    );
    if (existing) existing.evidenceRef = item.evidenceRef;
  }
  for (const item of input.applicationEvidence ?? []) {
    records.push({
      id: `E-A-${item.id}`,
      source: 'application_context',
      text: item.context.text,
      label: item.context.label,
      requirementIds: [item.requirementId],
      contextId: item.id,
    });
  }
  return records;
}

function requirementLine(requirement: RewriteRequirement, registry: CanonicalEvidenceRecord[]): string {
  const evidenceIds = requirement.evidenceIds ?? registry
    .filter((record) => record.requirementIds.includes(requirement.id))
    .map((record) => record.id);
  return [
    requirement.id,
    requirement.importance,
    requirement.status,
    requirement.category,
    JSON.stringify(requirement.text),
    `evidence=${evidenceIds.join(',') || 'none'}`,
  ].join('|');
}

function evidenceLine(record: CanonicalEvidenceRecord): string {
  const coordinates = [
    record.ledgerRefs?.length
      ? `ledger=${record.ledgerRefs.map((ref) => `${ref.requirementId}:${ref.evidenceIndex}`).join(',')}`
      : '',
    record.evidenceRef ? `profile=${record.evidenceRef.type}:${record.evidenceRef.id}` : '',
    record.contextId ? `application=${record.contextId}` : '',
  ].filter(Boolean).join('|');
  return `${record.id}|${record.source}|${coordinates}|${JSON.stringify(record.text)}`;
}

function deterministicFacts(input: CanonicalRewriteContext): string {
  const lines: string[] = [];
  if (input.trustedExperienceDuration !== undefined) {
    lines.push(input.trustedExperienceDuration && input.trustedExperienceDuration.months > 0
      ? `experience_months=${input.trustedExperienceDuration.months}`
      : 'experience_months=none');
  }
  for (const conflict of input.unresolvedConflicts ?? []) {
    lines.push(`conflict|${conflict.field}|${conflict.reason}`);
  }
  for (const constraint of input.rewriteContext.eligibilityConstraints) {
    lines.push(`eligibility|${constraint.requirementId}|${constraint.status}|${constraint.text}`);
  }
  return lines.join('\n');
}

function strategy(input: CanonicalRewriteContext, strict: boolean): string {
  const spec = input.rewriteContext.cvBuildSpec;
  const lines = [
    `section_order=${spec.section_order?.join('>') || 'summary>experience>projects>education>skills>certifications'}`,
    spec.lead_project ? `lead_project=${spec.lead_project}` : '',
    spec.summary_angle ? `summary_angle=${spec.summary_angle}` : '',
    spec.skills_to_surface?.length ? `surface=${spec.skills_to_surface.join(',')}` : '',
    spec.skills_to_deprioritise?.length ? `deprioritise=${spec.skills_to_deprioritise.join(',')}` : '',
    spec.visa_note_required ? 'visa_note_required=true (only with evidence)' : '',
  ];
  if (!strict) {
    for (const bullet of spec.bullets_to_rewrite ?? []) {
      lines.push(`emphasise|${bullet.project_or_role}|${bullet.original_label}->${bullet.new_label}`);
    }
    if (input.rewriteContext.domainFit) {
      lines.push(`domain_fit=${input.rewriteContext.domainFit.status}|${input.rewriteContext.domainFit.detail}`);
    }
    if (input.atsOptimizationData?.aiClichesToAvoid.length) {
      lines.push(`avoid_cliches=${input.atsOptimizationData.aiClichesToAvoid.join(',')}`);
    }
  }
  return lines.filter(Boolean).join('\n');
}

/** Provider-neutral profile selected only from the model's available input budget. */
export function serializeCanonicalRewriteContext(
  input: CanonicalRewriteContext,
  attempt: AiAttemptDescriptor
): string {
  const availablePromptTokens = attempt.requestBudget.safeRequestTokens
    - attempt.requestBudget.maxCompletionTokens
    - attempt.requestBudget.safetyMarginTokens
    - (attempt.requestOverheadTokens ?? 0);
  const strict = availablePromptTokens <= 4500;
  const vacancy = uniqueVacancyContext(input);
  const registry = evidenceRegistry(input);
  const facts = deterministicFacts(input);
  const rewriteStrategy = strategy(input, strict);

  const taskSection = 'TASK: Tailor the candidate CV to the target role as structured JSON. Truth outranks completeness and ATS optimisation.';
  const sourceSection = `SOURCE_CV\n${input.cvText}`;
  const targetSection = input.targetJob
    ? `TARGET_JOB\n${input.targetJob.title}|${input.targetJob.employer}${input.targetJob.location ? `|${input.targetJob.location}` : ''}`
    : '';
  const requirementsSection = `REQUIREMENTS (authoritative status/mapping)\n${input.rewriteContext.requirements.map((item) => requirementLine(item, registry)).join('\n')}`;
  const evidenceSection = registry.length
    ? `EVIDENCE_REGISTRY (each record appears once)\n${registry.map(evidenceLine).join('\n')}`
    : '';
  const notesSection = input.userContext?.length
    ? `CANDIDATE_NOTES (explicit user statements; do not infer beyond them)\n${input.userContext.map((item) => `${item.label}|${JSON.stringify(item.text)}`).join('\n')}`
    : '';
  const factsSection = facts ? `DETERMINISTIC_FACTS\n${facts}` : '';
  const correctionSection = input.correctionNotes?.length
    ? `CORRECTION_REQUIRED\n${input.correctionNotes.map((note) => `- ${note}`).join('\n')}`
    : '';
  const requiredSections = [
    taskSection, TRUTH_CONTRACT, sourceSection, targetSection, requirementsSection,
    evidenceSection, notesSection, factsSection, correctionSection, OUTPUT_CONTRACT,
  ].filter(Boolean);
  const strategySection = rewriteStrategy ? `REWRITE_STRATEGY (not evidence)\n${rewriteStrategy}` : '';
  const vacancySection = vacancy ? `UNIQUE_VACANCY_CONTEXT\n${vacancy}` : '';
  const fits = (optionalSections: string[]) => estimateSerializedInputTokens(
    [...requiredSections, ...optionalSections].filter(Boolean).join('\n\n')
  ) <= availablePromptTokens;

  // Advisory rewrite strategy is more directly useful than residual vacancy
  // prose once authoritative requirements have already been serialized.
  const includeStrategy = Boolean(strategySection) && fits([strategySection]);
  const includeVacancy = Boolean(vacancySection) && fits([
    ...(includeStrategy ? [strategySection] : []),
    vacancySection,
  ]);

  return [
    taskSection,
    TRUTH_CONTRACT,
    sourceSection,
    targetSection,
    ...(includeVacancy ? [vacancySection] : []),
    requirementsSection,
    evidenceSection,
    notesSection,
    factsSection,
    ...(includeStrategy ? [strategySection] : []),
    correctionSection,
    OUTPUT_CONTRACT,
  ].filter(Boolean).join('\n\n');
}
