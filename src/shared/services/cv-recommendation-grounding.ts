/**
 * User-facing recommendation grounding (demote-to-intent).
 *
 * Several fields shown in the job-match UI are authored by an AI call and could
 * present unverified facts as though they were confirmed: a metric, a skill, a
 * credential, an employer/title/project, or a level of seniority the CV never
 * evidences. This layer is the single, deterministic place that neutralises
 * those claims BEFORE they reach a component — no second AI call, no fragile
 * mid-sentence stripping.
 *
 * It reuses the shared evidence primitives in `cv-evidence.ts` so recommendation
 * grounding and post-generation truthfulness validation can never disagree on
 * what "supported" means. The recommendation text itself is NEVER treated as
 * evidence — only the trusted boundary counts:
 *   - source CV
 *   - ledger CV evidence
 *   - approved profile evidence (where available)
 *   - explicit user context (where available)
 *
 * When a field over-claims, the whole field is demoted to neutral intent. This
 * preserves the future human-in-the-loop workflow: a missing skill is still
 * surfaced — as something to confirm and evidence — never as something possessed.
 */
import type { JobMatchDataV2, TailoredRewrite } from '@/shared/types/ai';
import {
  buildEvidenceCorpus,
  extractImpactMetrics,
  metricSupported,
  normalizeText,
  tokensSupportedLoose,
  type EvidenceCorpus,
} from './cv-evidence';

// ── Signal vocabularies ──────────────────────────────────────────────────────

/**
 * Regulated / high-stakes claims. Softening these into positive wording is never
 * acceptable, so a phrase here that is NOT already in verified evidence forces a
 * demotion. Kept deliberately high-signal to avoid nuking honest guidance.
 */
const REGULATED_TERMS = [
  'certified',
  'certification',
  'chartered',
  'licensed',
  'security clearance',
  'sc cleared',
  'dv cleared',
  'right to work',
  'work visa',
  'visa sponsorship',
  'driving licence',
  'full driving',
  'fluent',
  'native speaker',
  'bilingual',
  'accredited',
];

/**
 * Seniority / specialisation positioning. A summary angle must not upgrade the
 * candidate to a level the evidence does not carry (e.g. "senior Kubernetes
 * platform engineer" against a CV that shows neither).
 */
const SENIORITY_TERMS = [
  'senior',
  'lead',
  'principal',
  'staff',
  'head of',
  'director',
  'chief',
  'expert',
  'specialist',
];

/** Requirement filler that must never be treated as a distinctive gap skill. */
const REQUIREMENT_STOPWORDS = new Set([
  'experience',
  'years',
  'strong',
  'knowledge',
  'skills',
  'ability',
  'working',
  'proven',
  'excellent',
  'understanding',
  'good',
  'demonstrable',
  'essential',
  'desirable',
  'using',
  'with',
  'and',
  'the',
  'for',
]);

/** Requirement statuses whose named skill is NOT evidenced as possessed. */
const UNSUPPORTED_STATUSES = ['not_met', 'contradicted', 'unclear'] as const;

// ── Neutral (demote-to-intent) replacements ──────────────────────────────────

const SAFE_TAILORED_SUGGESTION =
  'Rewrite your original bullet using only experience your CV already evidences for this role.';

const SAFE_SUMMARY_ANGLE =
  'Position the summary around the experience your CV actually evidences for this role.';

const SAFE_LEAD_PROJECT = 'Prioritise the most relevant verified project from your CV.';

const SAFE_MATCH_FEEDBACK =
  'This role has been assessed against your CV. See the requirement breakdown for where you align and where evidence is still missing.';

const SAFE_EXPERIENCE_GAP =
  'Review the requirements not yet evidenced by your CV to see where to focus before applying.';

// ── Detection helpers (all reuse the shared evidence corpus) ──────────────────

/** A gap skill: a distinctive requirement token that is not in verified evidence. */
interface GapTerm {
  token: string;
  /** Original requirement wording, for user-facing caveats. */
  label: string;
}

function normPadded(value: string): string {
  return ` ${normalizeText(value)} `;
}

/** First term from `terms` that appears in the field but not in verified evidence. */
function firstUnsupportedTerm(
  field: string,
  corpus: EvidenceCorpus,
  terms: string[]
): string | null {
  const haystack = normPadded(field);
  for (const term of terms) {
    const needle = ` ${normalizeText(term)} `;
    if (haystack.includes(needle) && !corpus.norm.includes(needle)) return term;
  }
  return null;
}

/** First impact metric in the field that the evidence cannot substantiate. */
function firstUnsupportedMetric(field: string, corpus: EvidenceCorpus): string | null {
  return extractImpactMetrics(field).find((metric) => !metricSupported(corpus, metric)) ?? null;
}

/**
 * Distinctive skills named by unsupported requirements that the evidence does
 * not back. These may still be SURFACED as confirmation opportunities — they
 * must never read as possessed.
 */
function collectGapTerms(
  unsupportedRequirementTerms: string[],
  corpus: EvidenceCorpus
): GapTerm[] {
  const seen = new Map<string, GapTerm>();
  for (const label of unsupportedRequirementTerms) {
    for (const token of normalizeText(label).split(' ')) {
      if (token.length < 4 || REQUIREMENT_STOPWORDS.has(token)) continue;
      if (corpus.norm.includes(` ${token} `)) continue;
      if (!seen.has(token)) seen.set(token, { token, label: label.trim() });
    }
  }
  return [...seen.values()];
}

/** First gap term the field presents (as though possessed). */
function firstGapTerm(field: string, gapTerms: GapTerm[]): GapTerm | null {
  const haystack = normPadded(field);
  return gapTerms.find((gap) => haystack.includes(` ${gap.token} `)) ?? null;
}

function truncateForLog(text: string): string {
  return text.length > 80 ? `${text.slice(0, 77)}…` : text;
}

// ── Public contract ───────────────────────────────────────────────────────────

export interface RecommendationGroundingInput {
  tailoredRewrites: TailoredRewrite[];
  summaryAngle: string;
  leadProject: string;
  matchFeedback: string;
  experienceGap: string;
  /**
   * Verified evidence strings only — source CV, ledger CV evidence, approved
   * profile evidence, explicit user context. Recommendation text is never here.
   */
  evidenceSources: string[];
  /**
   * Texts of requirements NOT evidenced (not_met / contradicted / unclear). A
   * skill named here and absent from evidence must never read as possessed.
   */
  unsupportedRequirementTerms?: string[];
}

export interface RecommendationGroundingResult {
  tailoredRewrites: TailoredRewrite[];
  summaryAngle: string;
  leadProject: string;
  matchFeedback: string;
  experienceGap: string;
  /** Internal diagnostics — never shown to the user. */
  changes: string[];
}

/**
 * Ground every user-facing recommendation field against verified evidence. Any
 * field that over-claims is demoted to neutral intent; supported content passes
 * through untouched. Pure and deterministic — safe to run at read time.
 */
export function groundUserFacingRecommendations(
  input: RecommendationGroundingInput
): RecommendationGroundingResult {
  const corpus = buildEvidenceCorpus(input.evidenceSources);
  const gapTerms = collectGapTerms(input.unsupportedRequirementTerms ?? [], corpus);
  const changes: string[] = [];

  const tailoredRewrites = input.tailoredRewrites.map((rewrite) =>
    groundTailoredRewrite(rewrite, corpus, gapTerms, changes)
  );

  const summaryAngle = groundSummaryAngle(input.summaryAngle, corpus, gapTerms, changes);
  const leadProject = groundLeadProject(input.leadProject, corpus, changes);
  const matchFeedback = groundNarrative(
    input.matchFeedback,
    corpus,
    SAFE_MATCH_FEEDBACK,
    'matchFeedback',
    changes
  );
  const experienceGap = groundNarrative(
    input.experienceGap,
    corpus,
    SAFE_EXPERIENCE_GAP,
    'experienceGap',
    changes
  );

  return { tailoredRewrites, summaryAngle, leadProject, matchFeedback, experienceGap, changes };
}

/**
 * A tailored rewrite's `suggested` body is what would land in the CV, so it is
 * held to the strictest bar: an unverified metric, a regulated claim, or a
 * missing skill presented as possessed demotes the whole body to a neutral
 * directive. The original bullet and rationale are preserved, and a caveat
 * explains the gap so the future HITL flow can act on it.
 */
function groundTailoredRewrite(
  rewrite: TailoredRewrite,
  corpus: EvidenceCorpus,
  gapTerms: GapTerm[],
  changes: string[]
): TailoredRewrite {
  const suggested = rewrite.suggested ?? '';

  const gap = firstGapTerm(suggested, gapTerms);
  const regulated = gap ? null : firstUnsupportedTerm(suggested, corpus, REGULATED_TERMS);
  const metric = gap || regulated ? null : firstUnsupportedMetric(suggested, corpus);

  if (!gap && !regulated && !metric) return rewrite;

  let caveat: string;
  let kind: string;
  if (gap) {
    kind = 'unsupported skill';
    caveat = `${gap.label} is required for this role but is not currently evidenced in your CV. Add it only if you have genuine experience and can provide details.`;
  } else if (regulated) {
    kind = 'regulated claim';
    caveat =
      'The earlier suggestion implied a credential or eligibility your CV does not evidence. Only claim it if you genuinely hold it.';
  } else {
    kind = 'unsupported metric';
    caveat =
      'The earlier suggestion included a figure your CV does not evidence. Only add metrics you can substantiate.';
  }

  changes.push(`Demoted tailored rewrite (${kind}): "${truncateForLog(suggested)}"`);
  return {
    original: rewrite.original,
    suggested: SAFE_TAILORED_SUGGESTION,
    rationale: rewrite.rationale,
    caveat: rewrite.caveat ? `${rewrite.caveat} ${caveat}` : caveat,
  };
}

/**
 * The summary angle is positioning guidance only. It is demoted when it would
 * introduce an unsupported metric, seniority, specialisation, regulated claim,
 * or a gap skill presented as owned.
 */
function groundSummaryAngle(
  summaryAngle: string,
  corpus: EvidenceCorpus,
  gapTerms: GapTerm[],
  changes: string[]
): string {
  if (!summaryAngle.trim()) return summaryAngle;

  const gap = firstGapTerm(summaryAngle, gapTerms);
  const seniority = gap ? null : firstUnsupportedTerm(summaryAngle, corpus, SENIORITY_TERMS);
  const regulated = gap || seniority ? null : firstUnsupportedTerm(summaryAngle, corpus, REGULATED_TERMS);
  const metric = gap || seniority || regulated ? null : firstUnsupportedMetric(summaryAngle, corpus);

  if (!gap && !seniority && !regulated && !metric) return summaryAngle;

  const trigger = gap?.token ?? seniority ?? regulated ?? metric ?? '';
  changes.push(`Demoted summary_angle (unsupported: ${trigger}): "${truncateForLog(summaryAngle)}"`);
  return SAFE_SUMMARY_ANGLE;
}

/**
 * lead_project is kept only when it resolves to a project/experience the
 * evidence actually contains; otherwise it becomes neutral selection guidance so
 * no invented project is displayed as existing. Empty guidance is left as-is.
 */
function groundLeadProject(
  leadProject: string,
  corpus: EvidenceCorpus,
  changes: string[]
): string {
  if (!leadProject.trim()) return leadProject;
  if (tokensSupportedLoose(corpus, leadProject)) return leadProject;

  changes.push(`Demoted lead_project (does not resolve to verified evidence): "${truncateForLog(leadProject)}"`);
  return SAFE_LEAD_PROJECT;
}

/**
 * Narrative feedback is left intact unless it carries an unverifiable impact
 * metric — the one high-signal fabrication worth removing here. Discussing a
 * missing skill or gap is exactly what these fields are for, so gap terms do NOT
 * demote them; that would strip honest feedback.
 */
function groundNarrative(
  field: string,
  corpus: EvidenceCorpus,
  fallback: string,
  fieldName: string,
  changes: string[]
): string {
  if (!field.trim()) return field;
  const metric = firstUnsupportedMetric(field, corpus);
  if (!metric) return field;

  changes.push(`Demoted ${fieldName} (unsupported metric ${metric}): "${truncateForLog(field)}"`);
  return fallback;
}

// ── Presentation-time entry point ─────────────────────────────────────────────

/**
 * The trusted evidence boundary already lives inside a stored ledger: CV
 * evidence, approved profile evidence, and explicit user context are recorded on
 * each requirement. Assemble exactly those, plus the raw CV text when available.
 */
function collectDisplayEvidenceSources(data: JobMatchDataV2, cvText?: string): string[] {
  const sources: string[] = cvText ? [cvText] : [];
  for (const requirement of data.requirements) {
    for (const evidence of requirement.evidence) {
      if (evidence.source === 'cv') sources.push(evidence.text);
      else if (evidence.source === 'profile' && evidence.approved) sources.push(evidence.text);
      else if (evidence.source === 'user_context') sources.push(evidence.text);
    }
  }
  return sources;
}

/**
 * Return a display-safe copy of stored job-match data. Non-mutating: the input
 * (a persisted `Analysis.jobMatchData` blob) is never changed, and the same
 * reference is returned when nothing needed grounding. Historical analyses whose
 * stored recommendations predate this layer are made safe here, at read time.
 */
export function groundJobMatchForDisplay(
  data: JobMatchDataV2,
  cvText?: string
): JobMatchDataV2 {
  const spec = data.cv_build_spec;
  const grounded = groundUserFacingRecommendations({
    tailoredRewrites: data.tailoredRewrites,
    summaryAngle: spec?.summary_angle ?? '',
    leadProject: spec?.lead_project ?? '',
    matchFeedback: data.matchFeedback,
    experienceGap: data.experienceGap,
    evidenceSources: collectDisplayEvidenceSources(data, cvText),
    unsupportedRequirementTerms: data.requirements
      .filter((requirement) =>
        (UNSUPPORTED_STATUSES as readonly string[]).includes(requirement.status)
      )
      .map((requirement) => requirement.text),
  });

  if (grounded.changes.length === 0) return data;

  return {
    ...data,
    matchFeedback: grounded.matchFeedback,
    experienceGap: grounded.experienceGap,
    tailoredRewrites: grounded.tailoredRewrites,
    ...(spec
      ? {
          cv_build_spec: {
            ...spec,
            summary_angle: grounded.summaryAngle,
            lead_project: grounded.leadProject,
          },
        }
      : {}),
  };
}
