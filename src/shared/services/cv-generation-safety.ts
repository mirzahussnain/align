/**
 * Generation-boundary enforcement.
 *
 * Stage 1 built the safety primitives (evidence provenance, deterministic
 * derived facts, unsupported-claim detectors, the trusted-generation context).
 * This module is the single place every live CV-generation path funnels its
 * *output* through before that output is allowed to become a downloadable or
 * persisted document. It composes the Stage 1 detectors into one scan and turns
 * the resulting internal flags into a safe, user-facing message.
 *
 * Nothing here trusts AI-authored text, and nothing here silently rewrites a
 * flagged value — a flag always means "refuse this output", never "fix it
 * quietly". The two generation routes decide what to do with the flags
 * (optionally one controlled correction attempt, otherwise reject), but they all
 * agree on WHAT counts as unsupported by using this one scan.
 */
import type { RewrittenCVData } from '@/shared/templates/types';
import type { ProfileData } from '@/features/dashboard/data/load-profile';
import {
  buildEvidenceCorpus,
  collectGenerationEvidenceSources,
  normalizeText,
  type EvidenceCorpus,
} from './cv-evidence';
import type { DerivedFact, ExperienceDuration } from './derived-facts';
import type { TrustedGenerationContext } from './trusted-generation-context';
import type { RewriteRequirement } from '@/shared/types/cv-rewrite';
import {
  detectDateExpansion,
  detectUnsupportedCommercialContext,
  detectUnsupportedMetrics,
  detectUnsupportedSeniority,
  detectUnsupportedTools,
  flagUnsupportedDurationClaims,
  type UnsupportedClaimFlag,
} from './unsupported-claims';

/**
 * Every fragment of a generated CV that *asserts* something about the candidate.
 * Contact details are deliberately excluded — an email or phone number is not a
 * claim about experience, seniority, or tooling. Skills are included so a
 * JD-only tool smuggled in as a "skill" is still caught.
 */
export function collectGeneratedClaimText(cv: RewrittenCVData): string {
  const chunks: string[] = [cv.tagline ?? '', cv.professionalSummary ?? ''];

  for (const education of cv.education ?? []) {
    chunks.push(education.degree ?? '', education.description ?? '');
  }
  for (const project of cv.projects ?? []) {
    chunks.push(project.name ?? '', project.skills ?? '');
    for (const achievement of project.achievements ?? []) {
      chunks.push(achievement.label ?? '', achievement.body ?? '');
    }
  }
  for (const role of cv.experience ?? []) {
    chunks.push(role.jobTitle ?? '', role.type ?? '');
    for (const achievement of role.achievements ?? []) {
      chunks.push(achievement.label ?? '', achievement.body ?? '');
    }
  }
  for (const group of cv.coreSkills ?? []) {
    chunks.push(group.category ?? '', group.skills ?? '');
  }
  for (const certification of cv.certifications ?? []) {
    chunks.push(certification.name ?? '');
  }

  return chunks.filter(Boolean).join('\n');
}

/** The key the trusted context files the deterministic duration fact under. */
const DURATION_FACT_KEY = 'professional_experience_duration';

/**
 * The deterministic professional-experience duration fact, pulled out of a
 * trusted context with its narrow type restored. This is the ONLY value any
 * generation path may use to back a tenure claim; an `insufficient` fact (or a
 * missing one) supports none.
 */
export function experienceDurationFact(
  context: TrustedGenerationContext
): DerivedFact<ExperienceDuration | null> {
  const fact = context.derivedFacts.find((candidate) => candidate.key === DURATION_FACT_KEY);
  if (fact) return fact as DerivedFact<ExperienceDuration | null>;
  return {
    key: DURATION_FACT_KEY,
    value: null,
    derivationRule: 'No duration fact present in the trusted context.',
    supportingFactKeys: [],
    calculatedAt: new Date().toISOString(),
    confidence: 'insufficient',
  };
}

/** One canonical/rendered date pair for range-expansion checking. */
export interface DateEntity {
  canonical: { startDate?: string | null; endDate?: string | null };
  rendered: string;
}

export interface UnsupportedClaimScanInput {
  cv: RewrittenCVData;
  /** The verified evidence corpus — the exact same one the truthfulness validator uses. */
  corpus: EvidenceCorpus;
  /** Deterministic duration fact; the ONLY thing that can support a tenure claim. */
  durationFact: DerivedFact<ExperienceDuration | null>;
  /** Tools named in the JD but not (yet) earned by evidence. Empty for the deterministic path. */
  toolVocabulary?: readonly string[];
  /** Structured canonical dates, present only where records carry them (deterministic path). */
  dateEntities?: DateEntity[];
}

/**
 * Run every Stage 1 unsupported-claim detector against a generated CV and return
 * the union of flags. Pure and deterministic: no model call, no mutation. A
 * non-empty result means the output introduced a claim with no trusted backing
 * and must not be rendered, persisted, or charged for.
 */
export function scanUnsupportedClaims(
  input: UnsupportedClaimScanInput
): UnsupportedClaimFlag[] {
  const { cv, corpus, durationFact, toolVocabulary = [], dateEntities = [] } = input;
  const text = collectGeneratedClaimText(cv);

  const flags: UnsupportedClaimFlag[] = [
    ...flagUnsupportedDurationClaims(text, durationFact),
    ...detectUnsupportedSeniority(text, corpus),
    ...detectUnsupportedCommercialContext(text, corpus),
    ...detectUnsupportedMetrics(text, corpus),
  ];

  if (toolVocabulary.length > 0) {
    flags.push(...detectUnsupportedTools(text, corpus, toolVocabulary));
  }

  for (const entity of dateEntities) {
    const flag = detectDateExpansion(entity.canonical, entity.rendered);
    if (flag) flags.push(flag);
  }

  return flags;
}

const TOOL_STOPWORDS = new Set([
  'experience',
  'knowledge',
  'proficiency',
  'strong',
  'good',
  'excellent',
  'working',
  'hands',
  'skills',
  'using',
  'with',
  'and',
  'the',
  'for',
]);

/**
 * Build the tool vocabulary a generated CV must not silently claim. Only the
 * candidate's *unmet* tool requirements qualify — a tool the candidate already
 * evidences is not a risk, and non-tool requirements are handled by their own
 * detectors. Requirement text is tokenised so "HubSpot CRM experience" yields
 * `hubspot`/`crm`, not one unmatched multi-word phrase.
 */
export function toolVocabularyFromRequirements(
  requirements: readonly RewriteRequirement[]
): string[] {
  const unmet = new Set(['not_met', 'unclear', 'contradicted']);
  const tokens = new Set<string>();
  for (const requirement of requirements) {
    if (requirement.category !== 'tool' || !unmet.has(requirement.status)) continue;
    for (const token of normalizeText(requirement.text).split(' ')) {
      if (token.length >= 3 && !TOOL_STOPWORDS.has(token)) tokens.add(token);
    }
  }
  return [...tokens];
}

/**
 * The verified-evidence corpus for a deterministic Profile CV. The Profile is
 * itself the ground truth here (no uploaded CV, no ledger), so the corpus is
 * assembled from the Profile's own asserted text. A duration or seniority claim
 * that is genuinely in the Profile stays supported; one that is not is flagged.
 */
export function buildProfileEvidenceCorpus(profile: ProfileData): EvidenceCorpus {
  const sources: string[] = [
    profile.personal.professionalSummary,
    profile.personal.targetRoleTitle,
  ];
  for (const role of profile.experience) {
    sources.push(role.jobTitle, role.company, role.type, ...role.achievements);
  }
  for (const project of profile.projects) {
    sources.push(project.name, ...project.achievements, ...(project.skills ?? []).map((s) => s.name));
  }
  for (const education of profile.education) {
    sources.push(education.degree, education.university, education.description);
  }
  for (const group of profile.skills) {
    sources.push(group.category, ...group.skills);
  }
  for (const certification of profile.certifications) {
    sources.push(certification.name, certification.issuer);
  }
  for (const volunteering of profile.volunteering) {
    sources.push(volunteering.role, volunteering.organisation, volunteering.contribution);
  }

  return buildEvidenceCorpus(collectGenerationEvidenceSources({
    cvText: sources.filter(Boolean).join('\n'),
    approvedProfileEvidence: [],
  }));
}

/**
 * Structured date pairs for the deterministic Profile path, so range-expansion
 * is checked against the record's own precision. The rendered value is computed
 * by the caller with the shared date formatter — passed in so this module never
 * decides presentation.
 */
export function profileDateEntities(
  profile: ProfileData,
  renderRange: (start: string, end: string, current: boolean) => string
): DateEntity[] {
  const entities: DateEntity[] = [];
  for (const role of profile.experience) {
    entities.push({
      canonical: { startDate: role.startDate, endDate: role.endDate },
      rendered: renderRange(role.startDate, role.endDate, role.current),
    });
  }
  for (const education of profile.education) {
    entities.push({
      canonical: { startDate: education.startDate, endDate: education.endDate },
      rendered: renderRange(education.startDate, education.endDate, education.current),
    });
  }
  for (const project of profile.projects) {
    entities.push({
      canonical: { startDate: project.startDate, endDate: project.endDate },
      rendered: renderRange(project.startDate, project.endDate, false),
    });
  }
  return entities;
}

// ── User-facing messaging ────────────────────────────────────────────────────

/** Shown when a generated tenure/seniority claim has no trusted backing. */
export const UNSUPPORTED_EXPERIENCE_MESSAGE =
  'We could not generate this CV safely because the output introduced experience details we could not verify against your profile. Please try again.';

/** Shown when a generated date range asserts more than the record supports. */
export const UNSUPPORTED_DATE_MESSAGE =
  'We could not generate this CV safely because it added dates that are not present in your profile. Please try again.';

/** Shown for tool/metric/commercial claims that verified evidence does not support. */
export const UNSUPPORTED_DETAIL_MESSAGE =
  'We could not generate this CV safely because the output introduced details we could not verify against your evidence. Please try again.';

/**
 * Map internal flags to one safe sentence. Never leaks a claim fragment, a
 * prompt, or an evidence id — the diagnostics stay server-side. Date issues take
 * precedence because they are the most concrete for a user to act on.
 */
export function unsupportedClaimUserMessage(flags: readonly UnsupportedClaimFlag[]): string {
  if (flags.some((flag) => flag.kind === 'date_expansion')) {
    return UNSUPPORTED_DATE_MESSAGE;
  }
  if (
    flags.some(
      (flag) => flag.kind === 'experience_duration' || flag.kind === 'seniority'
    )
  ) {
    return UNSUPPORTED_EXPERIENCE_MESSAGE;
  }
  return UNSUPPORTED_DETAIL_MESSAGE;
}
