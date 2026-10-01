/**
 * Provider-neutral, generation-specific projection of JobMatchDataV2. This
 * replaces the temporary mandatory/desirable adapter:
 * the rewriter now receives only what generation needs, and unrelated ledger
 * metadata (confidence, deduction points/reasons, UI fields) never reaches the
 * prompt or costs a token.
 *
 * No candidate fact, requirement, or evidence is dropped here. Model-specific
 * serializers remove redundancy, then request preflight rejects anything that
 * still cannot fit safely.
 */
import type { JobMatchDataV2 } from '@/shared/types/ai';
import type { ApprovedProfileEvidenceOverlay } from '@/shared/types/profile-reasoning';
import type { TemplateId } from '@/shared/constants/templates';
import {
  REWRITE_PROMPT_CONTEXT_VERSION,
  type AtsOptimizationData,
  type CanonicalEvidenceRecord,
  type CompactRewriteContext,
  type LedgerNativeRewriteInput,
  type PromptBudgetLimits,
  type RewriteRequirement,
  type RewritePromptDebug,
  type UserProvidedContext,
  type RewriteApplicationEvidence,
} from '@/shared/types/cv-rewrite';
import { composeRewritePrompt, estimatePromptTokens } from './cv-rewrite-prompt';
import { buildEvidenceCorpus, collectGenerationEvidenceSources } from './cv-evidence';
import { groundBuildSpec } from './cv-build-spec-grounding';

export const DEFAULT_PROMPT_BUDGET: PromptBudgetLimits = {
  maxPromptTokens: 12000,
  maxRequirementEvidenceChars: 600,
  maxCvChars: 12000,
  maxJobDescriptionChars: 6000,
};

// ── Deterministic text cleaning ──────────────────────────────────────────────

function collapseWhitespace(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/\f/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** PDF/extraction running headers, footers, and page markers. */
const CV_NOISE_PATTERNS = [
  /^\s*page\s+\d+(\s+of\s+\d+)?\s*$/i,
  /^\s*\d+\s*\/\s*\d+\s*$/,
  /^\s*confidential\s*$/i,
  /^\s*curriculum vitae\s*$/i,
];

/**
 * Strip extraction noise and collapse running headers/footers. A line that
 * repeats three or more times and is short is almost always a per-page header or
 * footer; we keep its first occurrence and drop the rest so no real content is
 * lost.
 */
export function cleanCvText(raw: string): string {
  const collapsed = collapseWhitespace(raw);
  const lines = collapsed.split('\n');

  const frequency = new Map<string, number>();
  for (const line of lines) {
    const key = line.trim();
    if (key.length > 0) frequency.set(key, (frequency.get(key) ?? 0) + 1);
  }

  const emitted = new Set<string>();
  const kept: string[] = [];
  for (const line of lines) {
    const key = line.trim();
    if (CV_NOISE_PATTERNS.some((pattern) => pattern.test(key))) continue;

    const repeats = frequency.get(key) ?? 0;
    if (key.length > 0 && key.length <= 60 && repeats >= 3) {
      if (emitted.has(key)) continue;
      emitted.add(key);
    }
    kept.push(line);
  }

  return collapseWhitespace(kept.join('\n'));
}

/** Paragraph-level markers for content a rewriter must not act on. */
const JD_BOILERPLATE_PATTERNS = [
  /equal opportunit/i,
  /diversity and inclusion/i,
  /committed to (creating|building|fostering)?\s*(a\s+)?(diverse|inclusiv)/i,
  /disability confident/i,
  /reasonable adjustment/i,
  /(strictly\s+)?no agencies/i,
  /agencies\s+(will\s+not|need\s+not)/i,
  /regardless of (race|gender|age|religion|sexual|disability|background)/i,
  /^\s*(benefits|perks|what we offer|our benefits)\b/i,
  /^\s*about (us|the company|the team)\b/i,
];

/**
 * Drop equal-opportunities boilerplate, benefits/marketing copy, and other
 * paragraphs a rewriter must never mine for content. Requirements have already
 * been extracted into the ledger, so trimming the vacancy body here is safe.
 */
export function cleanJobDescription(raw: string): string {
  const collapsed = collapseWhitespace(raw);
  const paragraphs = collapsed.split('\n\n');
  const kept = paragraphs.filter((paragraph) => {
    const head = paragraph.slice(0, 160);
    return !JD_BOILERPLATE_PATTERNS.some((pattern) => pattern.test(head));
  });
  return collapseWhitespace((kept.length > 0 ? kept : paragraphs).join('\n\n'));
}

// ── Projection ───────────────────────────────────────────────────────────────

const ELIGIBILITY_CATEGORIES = new Set(['eligibility', 'availability']);

/**
 * Project the ledger into the compact per-requirement view. Only CV-sourced
 * evidence and server-revalidated approved profile evidence are carried; scoring
 * fields are dropped entirely.
 */
export function projectRequirements(
  jobMatch: JobMatchDataV2,
  approvedProfileEvidence: ApprovedProfileEvidenceOverlay[],
  _maxEvidenceChars: number
): RewriteRequirement[] {
  const approvedByRequirement = new Map<string, string[]>();
  for (const item of approvedProfileEvidence) {
    const list = approvedByRequirement.get(item.requirementId) ?? [];
    list.push(item.resolvedEvidenceText);
    approvedByRequirement.set(item.requirementId, list);
  }

  return jobMatch.requirements.map((requirement) => ({
    id: requirement.id,
    text: requirement.text,
    importance: requirement.importance,
    status: requirement.status,
    category: requirement.category,
    cvEvidence: requirement.evidence
      .filter((evidence) => evidence.source === 'cv')
      .map((evidence) => evidence.text),
    approvedProfileEvidence: approvedByRequirement.get(requirement.id) ?? [],
  }));
}

function evidenceKey(source: CanonicalEvidenceRecord['source'], text: string): string {
  return `${source}:${text.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-GB')}`;
}

/** Build one authoritative, stable registry and point requirements at ids. */
export function buildCanonicalEvidenceRegistry(
  requirements: RewriteRequirement[],
  approved: ApprovedProfileEvidenceOverlay[],
  application: RewriteApplicationEvidence[] = []
): CanonicalEvidenceRecord[] {
  const records: CanonicalEvidenceRecord[] = [];
  const byKey = new Map<string, CanonicalEvidenceRecord>();
  let cvSequence = 0;

  const register = (record: CanonicalEvidenceRecord, key: string) => {
    const existing = byKey.get(key);
    if (!existing) {
      records.push(record);
      byKey.set(key, record);
      return record;
    }
    for (const requirementId of record.requirementIds) {
      if (!existing.requirementIds.includes(requirementId)) existing.requirementIds.push(requirementId);
    }
    for (const ref of record.ledgerRefs ?? []) {
      if (!existing.ledgerRefs?.some((item) => item.requirementId === ref.requirementId && item.evidenceIndex === ref.evidenceIndex)) {
        (existing.ledgerRefs ??= []).push(ref);
      }
    }
    return existing;
  };

  for (const requirement of requirements) {
    const ids: string[] = [];
    requirement.cvEvidence.forEach((text, evidenceIndex) => {
      const key = evidenceKey('source_cv', text);
      let existing = byKey.get(key);
      if (!existing) cvSequence += 1;
      existing = register({
        id: existing?.id ?? `E-CV-${cvSequence}`,
        source: 'source_cv',
        text,
        requirementIds: [requirement.id],
        ledgerRefs: [{ requirementId: requirement.id, evidenceIndex }],
      }, key);
      ids.push(existing.id);
    });

    requirement.approvedProfileEvidence.forEach((text, offset) => {
      const match = approved.find((item) =>
        item.requirementId === requirement.id && item.resolvedEvidenceText === text
      );
      const key = match
        ? `approved_profile:${match.evidenceRef.type}:${match.evidenceRef.id}`
        : evidenceKey('approved_profile', text);
      const existing = register({
        id: match ? `E-P-${match.evidenceRef.type}-${match.evidenceRef.id}` : `E-P-${records.length + 1}`,
        source: 'approved_profile',
        text,
        requirementIds: [requirement.id],
        ledgerRefs: [{
          requirementId: requirement.id,
          evidenceIndex: requirement.cvEvidence.length + offset,
        }],
        evidenceRef: match?.evidenceRef,
      }, key);
      ids.push(existing.id);
    });
    requirement.evidenceIds = [...new Set(ids)];
  }

  for (const item of application) {
    const record = register({
      id: `E-A-${item.id}`,
      source: 'application_context',
      text: item.context.text,
      requirementIds: [item.requirementId],
      contextId: item.id,
      label: item.context.label,
    }, `application_context:${item.id}`);
    const requirement = requirements.find((entry) => entry.id === item.requirementId);
    if (requirement && !requirement.evidenceIds?.includes(record.id)) {
      (requirement.evidenceIds ??= []).push(record.id);
    }
  }

  return records;
}

function eligibilityConstraints(jobMatch: JobMatchDataV2) {
  return jobMatch.requirements
    .filter(
      (requirement) =>
        ELIGIBILITY_CATEGORIES.has(requirement.category) && requirement.status !== 'met'
    )
    .map((requirement) => ({
      requirementId: requirement.id,
      text: requirement.text,
      status: requirement.status,
    }));
}

// ── Budgeting ────────────────────────────────────────────────────────────────

export interface BuildRewriteInputParams {
  jobMatch: JobMatchDataV2;
  approvedProfileEvidence: ApprovedProfileEvidenceOverlay[];
  userContext: UserProvidedContext[];
  cvText: string;
  jobDescription: string;
  targetJob?: { title: string; employer: string; location?: string };
  template: TemplateId;
  atsOptimizationData?: AtsOptimizationData;
  applicationEvidence?: RewriteApplicationEvidence[];
  limits?: PromptBudgetLimits;
}

/**
 * Assemble the provider-neutral canonical input without discarding facts.
 * Provider/model preflight owns request limits; this layer never silently drops
 * requirements, evidence, candidate history, or vacancy context to make a fit.
 */
export function buildRewriteInput(
  params: BuildRewriteInputParams
): { input: LedgerNativeRewriteInput; debug: RewritePromptDebug } {
  const limits = params.limits ?? DEFAULT_PROMPT_BUDGET;

  // Tier 0 candidate history is never character-sliced. If the full canonical
  // record cannot fit a model, per-attempt preflight rejects that provider.
  const cvText = cleanCvText(params.cvText);
  const requirements = projectRequirements(
    params.jobMatch,
    params.approvedProfileEvidence,
    limits.maxRequirementEvidenceChars
  );

  // Ground the stored build spec a SECOND time, against the richer generation
  // corpus (source CV + ledger CV evidence + approved profile evidence + user
  // context). This defends historical analyses whose specs predate analysis-time
  // grounding, and lets a metric backed by newly approved evidence or user
  // context survive. It runs on a fresh spec object — `Analysis.jobMatchData` is
  // never mutated.
  const corpus = buildEvidenceCorpus(
    collectGenerationEvidenceSources({
      cvText,
      approvedProfileEvidence: params.approvedProfileEvidence,
      userContext: params.userContext,
      requirementEvidence: requirements.flatMap((requirement) => [
        ...requirement.cvEvidence,
        ...requirement.approvedProfileEvidence,
      ]),
    })
  );
  const groundedSpec = groundBuildSpec(params.jobMatch.cv_build_spec, corpus).spec;

  const context: CompactRewriteContext = {
    requirements,
    domainFit: {
      status: params.jobMatch.domainFit.status,
      detail: params.jobMatch.domainFit.detail,
    },
    eligibilityConstraints: eligibilityConstraints(params.jobMatch),
    cvBuildSpec: groundedSpec,
  };

  const input: LedgerNativeRewriteInput = {
    cvText,
    // Preserve the full cleaned vacancy in canonical memory. The serializer is
    // responsible for eliminating wording already represented by requirements.
    jobDescription: cleanJobDescription(params.jobDescription),
    targetJob: params.targetJob,
    rewriteContext: context,
    approvedProfileEvidence: params.approvedProfileEvidence,
    userContext: params.userContext.length > 0 ? params.userContext : undefined,
    template: params.template,
    atsOptimizationData: params.atsOptimizationData,
    applicationEvidence: params.applicationEvidence,
  };
  input.evidenceRegistry = buildCanonicalEvidenceRegistry(
    requirements,
    params.approvedProfileEvidence,
    params.applicationEvidence
  );

  const estimate = estimatePromptTokens(composeRewritePrompt(input));

  return {
    input,
    debug: {
      promptContextVersion: REWRITE_PROMPT_CONTEXT_VERSION,
      estimatedPromptTokens: estimate,
      requirementCount: context.requirements.length,
      droppedSections: [],
    },
  };
}
