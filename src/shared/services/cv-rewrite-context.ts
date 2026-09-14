/**
 * Compact, generation-specific projection of JobMatchDataV2 plus a deterministic
 * prompt-budget layer. This replaces the temporary mandatory/desirable adapter:
 * the rewriter now receives only what generation needs, and unrelated ledger
 * metadata (confidence, deduction points/reasons, UI fields) never reaches the
 * prompt or costs a token.
 *
 * The budget layer trims the LOW-priority end only. Truthfulness rules, essential
 * requirements, contradicted/unclear requirements, and approved profile evidence
 * are never dropped or truncated.
 */
import type { JobMatchDataV2 } from '@/shared/types/ai';
import type { ApprovedProfileEvidenceOverlay } from '@/shared/types/profile-reasoning';
import type { TemplateId } from '@/shared/constants/templates';
import {
  REWRITE_PROMPT_CONTEXT_VERSION,
  type AtsOptimizationData,
  type CompactRewriteContext,
  type LedgerNativeRewriteInput,
  type PromptBudgetLimits,
  type RewriteRequirement,
  type RewritePromptDebug,
  type UserProvidedContext,
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

function truncateChars(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max).trimEnd()}\n…[truncated]`;
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
  maxEvidenceChars: number
): RewriteRequirement[] {
  const approvedByRequirement = new Map<string, string[]>();
  for (const item of approvedProfileEvidence) {
    const list = approvedByRequirement.get(item.requirementId) ?? [];
    list.push(truncateChars(item.resolvedEvidenceText, maxEvidenceChars));
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
      .map((evidence) => truncateChars(evidence.text, maxEvidenceChars)),
    approvedProfileEvidence: approvedByRequirement.get(requirement.id) ?? [],
  }));
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

/**
 * Ordered low-to-high priority reducers. Each is applied at most once, cheapest
 * (lowest-value) content first, until the estimate fits the budget. None of them
 * can touch truth rules, essential requirements, contradicted/unclear
 * requirements, or approved evidence.
 */
const BUDGET_REDUCERS: {
  name: string;
  apply: (context: CompactRewriteContext) => boolean;
}[] = [
  {
    name: 'employer_background',
    apply: (context) => {
      if (context.domainFit && context.domainFit.detail) {
        context.domainFit = { status: context.domainFit.status, detail: '' };
        return true;
      }
      return false;
    },
  },
  {
    name: 'domain_context',
    apply: (context) => {
      if (context.domainFit) {
        context.domainFit = undefined;
        return true;
      }
      return false;
    },
  },
  {
    name: 'desirable_requirements',
    apply: (context) => {
      const before = context.requirements.length;
      context.requirements = context.requirements.filter(
        (requirement) =>
          requirement.importance !== 'desirable' ||
          requirement.status === 'contradicted' ||
          requirement.status === 'unclear'
      );
      return context.requirements.length !== before;
    },
  },
  {
    name: 'eligibility_constraints',
    apply: (context) => {
      if (context.eligibilityConstraints.length > 0) {
        context.eligibilityConstraints = [];
        return true;
      }
      return false;
    },
  },
];

export interface BuildRewriteInputParams {
  jobMatch: JobMatchDataV2;
  approvedProfileEvidence: ApprovedProfileEvidenceOverlay[];
  userContext: UserProvidedContext[];
  cvText: string;
  jobDescription: string;
  template: TemplateId;
  atsOptimizationData?: AtsOptimizationData;
  limits?: PromptBudgetLimits;
}

/**
 * Assemble the ledger-native rewrite input: clean and cap the CV and vacancy,
 * project the compact ledger, then trim the low-priority end until the prompt
 * fits the token budget. Returns the input plus non-user-facing diagnostics.
 */
export function buildRewriteInput(
  params: BuildRewriteInputParams
): { input: LedgerNativeRewriteInput; debug: RewritePromptDebug } {
  const limits = params.limits ?? DEFAULT_PROMPT_BUDGET;

  const cvText = truncateChars(cleanCvText(params.cvText), limits.maxCvChars);
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
    jobDescription: truncateChars(
      cleanJobDescription(params.jobDescription),
      limits.maxJobDescriptionChars
    ),
    rewriteContext: context,
    approvedProfileEvidence: params.approvedProfileEvidence,
    userContext: params.userContext.length > 0 ? params.userContext : undefined,
    template: params.template,
    atsOptimizationData: params.atsOptimizationData,
  };

  const droppedSections: string[] = [];
  let estimate = estimatePromptTokens(composeRewritePrompt(input));
  for (const reducer of BUDGET_REDUCERS) {
    if (estimate <= limits.maxPromptTokens) break;
    if (reducer.apply(context)) {
      droppedSections.push(reducer.name);
      estimate = estimatePromptTokens(composeRewritePrompt(input));
    }
  }

  return {
    input,
    debug: {
      promptContextVersion: REWRITE_PROMPT_CONTEXT_VERSION,
      estimatedPromptTokens: estimate,
      requirementCount: context.requirements.length,
      droppedSections,
    },
  };
}
