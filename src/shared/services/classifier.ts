// Occupation/sector classification — runs BEFORE any scoring so the first
// deterministic pass is already correctly sectored.
//
// Precedence (first confident tier wins):
//   1. Job description title match          (job-match mode, 0.95)
//   2. Profile target occupation/role title (0.9)
//   3. Deterministic CV evidence            (accepts at >= 0.8)
//   4. AI micro-classification              (flagged OFF by default; see below)
//   5. Generic fallback                     (0.3)
//
// Ordinary target detection is fully DETERMINISTIC and cost-free: tier 4 (the
// AI micro-classifier) is gated behind AI_TARGET_CLASSIFICATION_ENABLED, which
// is off by default and never enabled by the live ATS/job-match flow. A CV that
// the deterministic tiers cannot resolve falls to the generic fallback rather
// than making a silent, billable AI call.
//
// Evidence weighting rule (see scoreOccupationEvidence): evidence is scored by
// category and the categories carry very different DISCRIMINATING weight.
//
//   DEFINING signals (can make a match confident):
//     1. role/title evidence          — strongest
//     2. occupation-defining duties    — strong
//     3. distinctive work outputs      — strong-to-medium
//     5. mandatory credential evidence — strong for regulated occupations
//   SUPPORTING signals (never decide alone):
//     4. domain / sector terminology   — weak (environment, not occupation)
//     7. tools & methods               — low (Python, SQL, Excel are shared)
//     8. generic transferable skills   — near-zero (everyone has them)
//   NEGATIVE signals:
//     9. a competing occupation's title on this CV counts AGAINST the match
//
// A classification is CONFIDENT only when at least one defining signal is present
// AND the evidence spans two-plus independent categories. Consequences that fall
// straight out of this model: an NHS data-analyst CV full of "patient/clinical/
// NHS" scores only sector terms for nurse → ambiguous, not a nurse; Python/SQL
// alone is a tool signal, never Software Engineering; a lone title or a lone duty
// is INSUFFICIENT_DIVERSITY and falls through to the generic fallback. When sector
// terms are the only signal we emit SECTOR_TERMS_ONLY and cap confidence hard.

import {
  getIndustryDictionary,
  isKnownIndustry,
  INDUSTRY_IDS,
  type Sector,
} from '@/shared/constants/sector-keywords';
import { OCCUPATION_PROFILES, getOccupationProfile, isKnownOccupation } from '@/shared/occupations/registry';
import type { OccupationProfile } from '@/shared/occupations/types';
import { buildKeywordRegex } from '@/shared/utils/scoring/keywords';
import type {
  Classification,
  ClassificationCandidate,
  ClassificationSource,
  OccupationId,
  ReasonCode,
  Seniority,
} from '@/shared/types/classification';
import { getClassification as aiClassify } from './ai-analyser';

export interface ClassifyInput {
  cvText: string;
  /**
   * Which analysis this is. In `job_match` the TARGET is the job description,
   * and the CV is only evidence — so a job match never derives its target from
   * CV content. Defaults to `ats`, which keeps the CV-evidence tiers active.
   */
  mode?: 'ats' | 'job_match';
  jobDescription?: string;
  /**
   * An explicitly chosen target for THIS run. The caller decides whether to
   * pass one — the active Profile is passed here only after the user confirms
   * it (ATS) or as an explicit per-analysis choice. It is never auto-applied by
   * this function.
   */
  profileTarget?: {
    occupation?: string | null;
    roleTitle?: string | null;
    industry?: string | null;
    seniority?: string | null;
  };
  /** False when the AI tier must not run (quota-degraded ATS still classifies deterministically). */
  aiAllowed: boolean;
  /**
   * Per-call opt-in to the AI micro-classification tier. Defaults to
   * {@link AI_TARGET_CLASSIFICATION_ENABLED} (off), so ordinary detection never
   * makes an AI call. The live flow never sets this; it exists only so the tier
   * can be exercised in tests and re-enabled behind an explicit future flag.
   */
  aiClassificationEnabled?: boolean;
}

type AIClassifierFn = typeof aiClassify;

/**
 * Feature flag: AI micro-classification of genuinely ambiguous CVs. OFF by
 * default and unused by the live ATS/job-match flow, so ordinary target
 * detection stays fully deterministic and cost-free — no silent AI call, no
 * quota consumed. Kept so the tier can be re-enabled behind an explicit future
 * product decision without reintroducing AI into the default detection path.
 */
export const AI_TARGET_CLASSIFICATION_ENABLED = false;

/** Confidence below which the AI tier is consulted (and at/above which a
 * deterministic evidence match is accepted). */
const AMBIGUITY_THRESHOLD = 0.8;
/** Score gap within which a runner-up is reported as an alternative. */
const ALTERNATIVE_WINDOW = 0.15;

/**
 * Category weights for the deterministic evidence model. The ordering encodes
 * the calibration intent: DEFINING categories (title/duty/output/mandatory
 * credential) carry weight that can, in combination, exceed the confidence
 * threshold; SUPPORTING categories (domain/tool/generic) are capped so low that
 * no combination of them alone can. Tuning note: `titleFirst + duty*2` ≈ 0.82,
 * i.e. a title plus two defining duties is the minimum confident shape.
 */
const WEIGHTS = {
  titleFirst: 0.5,
  titleExtra: 0.08,
  titleExtraCap: 2,
  duty: 0.16,
  dutyCap: 3,
  output: 0.1,
  outputCap: 2,
  mandatoryCredential: 0.18,
  otherCredential: 0.06,
  credentialCap: 2,
  domainScale: 0.33, // × min(ratio, 0.3) ⇒ caps at ~0.1
  tool: 0.04,
  toolCap: 3,
  generic: 0.01,
  genericCap: 3,
  negative: 0.2,
  negativeCap: 3,
  /** Added when 2+ defining categories co-occur (independent corroboration). */
  corroboration: 0.1,
} as const;

/** A lone defining category (no independent second signal) is never confident. */
const SINGLE_SIGNAL_CAP = 0.75;
/** Tools / generic skills without any defining signal cannot classify. */
const NON_DEFINING_CAP = 0.5;
/** Sector vocabulary as the sole signal is the classic false-positive shape. */
const SECTOR_ONLY_CAP = 0.4;
/** How much a genuine two-way tie between real occupations lowers confidence. */
const AMBIGUITY_PENALTY = 0.1;
/** Sector dictionary hit ratio above which domain terminology counts as present. */
const DOMAIN_PRESENT_RATIO = 0.05;

export async function classifyCV(
  input: ClassifyInput,
  // Injectable for tests; production callers never pass it.
  aiClassifier: AIClassifierFn = aiClassify
): Promise<Classification> {
  // Tier 1 — job description title.
  if (input.jobDescription) {
    const fromJd = classifyFromJobDescription(input.jobDescription, input.cvText);
    if (fromJd) return fromJd;
  }

  // Tier 2 — an explicitly chosen target (see ClassifyInput.profileTarget). An
  // explicit, user-confirmed target is authoritative and is RETAINED even for a
  // regulated occupation the CV does not corroborate — the regulated activation
  // guard applies to automatic detection below, not to an explicit choice.
  const fromProfile = classifyFromProfileTarget(input);
  if (fromProfile) return fromProfile;

  // Job-match target isolation: the target is the job description, and the CV is
  // evidence — never the target. So once the JD and any explicit target are
  // exhausted, a job match falls straight to generic rather than deriving its
  // target family from CV content (which would re-introduce the leak in the
  // other direction, letting the candidate's own history redefine the vacancy).
  if (input.mode === 'job_match') {
    return build('generic', 'fallback', 0.3, {
      cvText: input.cvText,
      reasonCodes: ['FALLBACK'],
    });
  }

  // Tier 3 — deterministic evidence in the CV itself. Automatic detection may
  // never ACTIVATE a regulated occupation the CV does not corroborate (a
  // matching regulated title or the mandatory credential); vague clinical or
  // sector wording must not silently turn an unregistered candidate into a
  // nurse. An uncorroborated regulated top hit falls through to the fallback.
  const evidence = scoreOccupationEvidence(input.cvText);
  if (evidence.confidence >= AMBIGUITY_THRESHOLD) {
    const evidenceProfile = getOccupationProfile(evidence.occupation);
    if (!evidenceProfile.regulated || hasRegulatedCorroboration(input.cvText, evidenceProfile)) {
      return build(evidence.occupation, 'dictionary_evidence', evidence.confidence, {
        cvText: input.cvText,
        reasonCodes: evidence.reasonCodes,
        alternatives: evidence.alternatives,
        ...(evidenceProfile.regulated ? { regulatedEvidence: 'present' as const } : {}),
      });
    }
  }

  // Tier 4 — AI micro-classification for the genuinely ambiguous. Gated behind
  // the feature flag so it never runs in the default detection path: only an
  // explicit per-call opt-in (tests / a future flagged path) reaches it, and it
  // still requires the AI to be allowed at all.
  const aiTierEnabled = input.aiClassificationEnabled ?? AI_TARGET_CLASSIFICATION_ENABLED;
  if (aiTierEnabled && input.aiAllowed) {
    const ai = await aiClassifier(excerptForClassification(input.cvText), input.profileTarget?.roleTitle ?? undefined);
    if (ai && isKnownOccupation(ai.occupation) && ai.occupation !== 'generic') {
      const aiProfile = getOccupationProfile(ai.occupation);
      // Same corroboration principle as the profile-target tier: the AI may
      // suggest a regulated occupation, but it is only activated when the CV
      // corroborates it. Otherwise ignore the suggestion and fall through.
      if (!aiProfile.regulated || hasRegulatedCorroboration(input.cvText, aiProfile)) {
        return build(ai.occupation, 'ai', Math.min(ai.confidence, 0.9), {
          cvText: input.cvText,
          reasonCodes: [...evidence.reasonCodes, 'AI_CLASSIFIED'],
          alternatives: evidence.alternatives,
          sectorOverride: isKnownIndustry(ai.sector) ? ai.sector : undefined,
          seniorityOverride: ai.seniority !== 'unknown' ? ai.seniority : undefined,
          ...(aiProfile.regulated ? { regulatedEvidence: 'present' as const } : {}),
        });
      }
    }
  }

  // Tier 5 — generic fallback; keep whatever weak evidence we saw for debugging.
  return build('generic', 'fallback', 0.3, {
    cvText: input.cvText,
    reasonCodes: [...evidence.reasonCodes, 'FALLBACK'],
    alternatives: evidence.alternatives,
    sectorOverride: evidence.sectorFromDictionaries,
  });
}

/**
 * A deliberately occupation-neutral classification. Used when the user asks for
 * a general review — the scoring engine then applies the generic profile's rules
 * rather than any occupation's. Confidence is `1` because there is no ambiguity:
 * "generic" is the chosen target, not a low-confidence guess. Seniority is still
 * read from the CV so a general review can still reflect it.
 */
export function classifyAsGeneric(cvText: string): Classification {
  return build('generic', 'fallback', 1, {
    cvText,
    reasonCodes: ['USER_SELECTED_GENERIC'],
  });
}

// ---------------------------------------------------------------------------
// Tier 1: job description
// ---------------------------------------------------------------------------

function classifyFromJobDescription(jobDescription: string, cvText: string): Classification | null {
  // Titles live near the top of a listing; cap how deep we look so a
  // requirements bullet naming another occupation can't hijack the match.
  const head = jobDescription.slice(0, 1200);

  for (const profile of nonGenericProfiles()) {
    if (profile.detection.titlePatterns.some(p => p.test(head))) {
      return build(profile.id, 'job_description', 0.95, {
        cvText,
        reasonCodes: ['JOB_TITLE_EXACT_MATCH'],
      });
    }
  }

  // No title match — read the JD's own body (duties, tools, credentials) with
  // the same deterministic evidence scorer. Still entirely JD-derived, so this
  // never pulls the target from the CV or the active Profile. Held to the same
  // ambiguity threshold so a JD that only mentions sector vocabulary stays
  // unresolved (and the caller falls back to generic).
  const evidence = scoreOccupationEvidence(jobDescription);
  if (evidence.confidence >= AMBIGUITY_THRESHOLD) {
    return build(evidence.occupation, 'job_description', evidence.confidence, {
      cvText,
      reasonCodes: evidence.reasonCodes,
      alternatives: evidence.alternatives,
    });
  }
  return null;
}

// ---------------------------------------------------------------------------
// Tier 2: profile target
// ---------------------------------------------------------------------------

/**
 * The profile-target tier. Returns a classification when the target names a
 * known occupation, or null when it names nothing resolvable (so the caller
 * falls through to CV evidence).
 *
 * This tier is only ever reached for an EXPLICIT, user-confirmed target (the
 * resolver passes `profileTarget` only for a custom role or a confirmed active/
 * saved Profile). An explicit choice is authoritative: a regulated occupation
 * is retained even when the CV does not corroborate it. We do NOT infer that the
 * candidate holds the registration — we record that regulated corroboration is
 * absent (`regulatedEvidence: 'absent'` + `REGULATED_TARGET_UNCORROBORATED`) so
 * the analysis can report the registration as missing/unclear against the target
 * the user deliberately chose. The activation guard instead governs automatic
 * detection (the CV-evidence and AI tiers).
 */
function classifyFromProfileTarget(input: ClassifyInput): Classification | null {
  const target = input.profileTarget;
  if (!target) return null;

  // The user's declared industry is a stronger signal than the occupation
  // profile's hardcoded default sector — an administrator who declared
  // "Healthcare / NHS" should be scored against NHS vocabulary, not whatever
  // sector the generic administrator profile happens to default to.
  const sectorOverride = isKnownIndustry(target.industry) ? target.industry : undefined;

  // Resolve which occupation the target names — either the structured value or
  // a free-text role title that matches a profile's own title patterns.
  let candidate: OccupationId | null = null;
  const reasonCodes: ReasonCode[] = ['PROFILE_TARGET_SET'];

  if (isKnownOccupation(target.occupation) && target.occupation !== 'generic') {
    candidate = target.occupation;
  } else if (target.roleTitle) {
    for (const profile of nonGenericProfiles()) {
      if (profile.detection.titlePatterns.some(p => p.test(target.roleTitle!))) {
        candidate = profile.id;
        reasonCodes.push('JOB_TITLE_EXACT_MATCH');
        break;
      }
    }
  }

  if (!candidate) return null;

  const profile = getOccupationProfile(candidate);

  // For a regulated target, record whether the CV corroborates it — but retain
  // the target either way. `absent` marks a missing/unclear registration to be
  // reported; it is never an assertion that the candidate is registered.
  let regulatedEvidence: 'present' | 'absent' | undefined;
  if (profile.regulated) {
    if (hasRegulatedCorroboration(input.cvText, profile)) {
      regulatedEvidence = 'present';
    } else {
      regulatedEvidence = 'absent';
      reasonCodes.push('REGULATED_TARGET_UNCORROBORATED');
    }
  }

  return build(candidate, 'profile_target', 0.9, {
    cvText: input.cvText,
    reasonCodes,
    seniorityOverride: parseSeniority(target.seniority),
    sectorOverride,
    regulatedEvidence,
  });
}

// ---------------------------------------------------------------------------
// Tier 3: deterministic CV evidence
// ---------------------------------------------------------------------------

interface EvidenceResult {
  occupation: OccupationId;
  confidence: number;
  reasonCodes: ReasonCode[];
  alternatives?: ClassificationCandidate[];
  /** Best sector guess from dictionary hits, for the generic fallback. */
  sectorFromDictionaries?: Sector;
}

/**
 * Title-like lines only (headlines, role headers), never prose — an HCA's
 * bullet "escalating concerns to the registered nurse" is not a nurse title,
 * and it sits on a line far longer than any real title header.
 */
function titleLinesOf(cvText: string): string {
  return cvText
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length >= 3 && l.length <= 80)
    .join('\n');
}

/**
 * Whether the CV independently corroborates a REGULATED occupation the user
 * declared as their target. Corroboration is deliberately narrow: only a
 * matching regulated job title (in a title-like line) or evidence of the
 * occupation's own MANDATORY professional credential counts. Task-pattern
 * overlap, sector vocabulary, and general domain experience are excluded by
 * construction — they are exactly what makes an HCA CV look nurse-adjacent
 * without the person being a nurse. Reuses the profile's existing detection
 * and credential patterns; no second regulator taxonomy is introduced.
 */
function hasRegulatedCorroboration(cvText: string, profile: OccupationProfile): boolean {
  const titleMatch = profile.detection.titlePatterns.some(p => p.test(titleLinesOf(cvText)));
  if (titleMatch) return true;

  const mandatoryCredentials = profile.credentials.filter(c => c.class === 'mandatory');
  return mandatoryCredentials.some(c => c.patterns.some(p => p.test(cvText)));
}

/** Per-occupation evidence tally, with the diversity bookkeeping the gate needs. */
interface ScoredOccupation {
  profile: OccupationProfile;
  score: number;
  codes: Set<ReasonCode>;
  /** Count of DEFINING categories present: title, duty, output, mandatory credential. */
  definingCount: number;
  /** Distinct categories present overall (defining + independent supporting ones). */
  supportingCount: number;
  hasDefining: boolean;
}

/**
 * Every `[start, end)` span a pattern matches in `text`. A fresh global clone is
 * used so no `lastIndex` state leaks between calls and every occurrence (not just
 * the first) is reported — the double-counting guard needs all of them.
 */
function matchSpansOf(pattern: RegExp, text: string): Array<[number, number]> {
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
  const global = new RegExp(pattern.source, flags);
  const spans: Array<[number, number]> = [];
  for (const m of text.matchAll(global)) {
    if (m.index === undefined) continue;
    spans.push([m.index, m.index + m[0].length]);
  }
  return spans;
}

/** True when `[start, end)` overlaps any span in `spans` (half-open intervals). */
function spanOverlaps(a: [number, number], spans: ReadonlyArray<[number, number]>): boolean {
  return spans.some(([s, e]) => a[0] < e && s < a[1]);
}

function scoreSingleOccupation(profile: OccupationProfile, cvText: string, titleText: string): ScoredOccupation {
  const d = profile.detection;
  const codes = new Set<ReasonCode>();
  let score = 0;

  // Cat 1 — role titles (strongest). Matched against title-like lines only.
  const titleHits = d.titlePatterns.filter(p => p.test(titleText)).length;
  if (titleHits > 0) {
    score += WEIGHTS.titleFirst + Math.min(titleHits - 1, WEIGHTS.titleExtraCap) * WEIGHTS.titleExtra;
    codes.add('JOB_TITLE_EXACT_MATCH');
  }

  // Cat 2 — occupation-defining duties. Capture WHERE each duty matched so the
  // distinctive-output category below can be held to genuinely separate text.
  const dutySpans: Array<[number, number]> = [];
  let dutyHits = 0;
  for (const p of d.dutyPatterns) {
    const spans = matchSpansOf(p, cvText);
    if (spans.length > 0) {
      dutyHits++;
      dutySpans.push(...spans);
    }
  }
  if (dutyHits > 0) {
    score += Math.min(dutyHits, WEIGHTS.dutyCap) * WEIGHTS.duty;
    codes.add('CORE_TASKS_MATCH');
  }

  // Cat 3 — distinctive work outputs. GUARD (no double-counting): an output only
  // counts when it matches text a defining duty did NOT already claim. The same
  // vague fragment must not be scored as both a duty AND an output — that would
  // fabricate the independent-evidence diversity the corroboration bonus and the
  // confidence gate depend on. An output pattern still counts whenever it matches
  // a genuinely SEPARATE span (a distinct occupational signal).
  let outputHits = 0;
  for (const p of d.outputPatterns ?? []) {
    const independent = matchSpansOf(p, cvText).some(s => !spanOverlaps(s, dutySpans));
    if (independent) outputHits++;
  }
  if (outputHits > 0) {
    score += Math.min(outputHits, WEIGHTS.outputCap) * WEIGHTS.output;
    codes.add('DISTINCTIVE_OUTPUT_MATCH');
  }

  // Cat 5 — qualifications / licences / registrations. Mandatory credentials
  // (an NMC PIN) are a DEFINING signal; desirable/role-dependent ones only support.
  const mandatoryCredHits = profile.credentials.filter(
    c => c.class === 'mandatory' && c.patterns.some(p => p.test(cvText))
  ).length;
  const otherCredHits = profile.credentials.filter(
    c => c.class !== 'mandatory' && c.patterns.some(p => p.test(cvText))
  ).length;
  if (mandatoryCredHits + otherCredHits > 0) {
    score +=
      Math.min(mandatoryCredHits, WEIGHTS.credentialCap) * WEIGHTS.mandatoryCredential +
      Math.min(otherCredHits, WEIGHTS.credentialCap) * WEIGHTS.otherCredential;
    codes.add('CREDENTIAL_EVIDENCE');
  }

  // Cat 4 — domain / sector terminology. The WEAKEST positive signal: it
  // describes the environment, not the occupation.
  const domainRatio = dictionaryHitRatio(cvText, profile.sector);
  const domainPresent = domainRatio > DOMAIN_PRESENT_RATIO;
  if (domainPresent) {
    score += Math.min(domainRatio, 0.3) * WEIGHTS.domainScale; // caps at ~0.1
  }

  // Cat 7 — tools & methods. Low discriminating weight; shared across occupations.
  const toolHits = (d.toolPatterns ?? []).filter(p => p.test(cvText)).length;
  if (toolHits > 0) {
    score += Math.min(toolHits, WEIGHTS.toolCap) * WEIGHTS.tool;
    // Mark TOOLS_MATCH only when tools are the notable signal — i.e. no defining
    // duty/output already fired. This keeps the code meaning "tool-dominant
    // evidence" (the Python/SQL-only shape), not "tools happened to appear".
    if (!codes.has('CORE_TASKS_MATCH') && !codes.has('DISTINCTIVE_OUTPUT_MATCH')) {
      codes.add('TOOLS_MATCH');
    }
  }

  // Cat 8 — generic transferable skills. Near-zero weight; never decisive.
  const genericHits = (d.genericSkillPatterns ?? []).filter(p => p.test(cvText)).length;
  if (genericHits > 0) {
    score += Math.min(genericHits, WEIGHTS.genericCap) * WEIGHTS.generic;
  }

  // Cat 9 — negative / conflicting evidence: a competing occupation's title on
  // this CV's own title lines counts against the match.
  const negativeHits = (d.negativePatterns ?? []).filter(p => p.test(titleText)).length;
  if (negativeHits > 0) {
    score -= Math.min(negativeHits, WEIGHTS.negativeCap) * WEIGHTS.negative;
    codes.add('CONFLICTING_EVIDENCE');
  }

  const definingCount =
    (titleHits > 0 ? 1 : 0) +
    (dutyHits > 0 ? 1 : 0) +
    (outputHits > 0 ? 1 : 0) +
    (mandatoryCredHits > 0 ? 1 : 0);
  const hasDefining = definingCount > 0;

  // Corroboration bonus: two-plus INDEPENDENT defining categories reinforce each
  // other. This is exactly the "require multiple independent supporting signals"
  // rule — it lets a title-less but clearly-evidenced CV (strong duties AND
  // distinctive outputs) clear the confidence bar, while a lone defining signal
  // never does (see the single-signal cap in scoreOccupationEvidence).
  if (definingCount >= 2) score += WEIGHTS.corroboration;

  score = Math.max(0, score);
  // Supporting diversity: defining categories plus any INDEPENDENT weaker ones.
  const supportingCount =
    definingCount +
    (otherCredHits > 0 && mandatoryCredHits === 0 ? 1 : 0) +
    (domainPresent ? 1 : 0) +
    (toolHits > 0 ? 1 : 0);

  // Sector vocabulary as the ONLY signal is the archetypal false positive.
  if (!hasDefining && toolHits === 0 && genericHits === 0 && domainPresent) {
    codes.add('SECTOR_TERMS_ONLY');
  }

  return { profile, score: Math.min(score, 1), codes, definingCount, supportingCount, hasDefining };
}

export function scoreOccupationEvidence(cvText: string): EvidenceResult {
  const titleText = titleLinesOf(cvText);
  const scored = nonGenericProfiles().map(p => scoreSingleOccupation(p, cvText, titleText));

  scored.sort((a, b) => b.score - a.score);
  const [top, second] = scored;

  const closeAlt = Boolean(second && second.score > 0 && top.score - second.score <= ALTERNATIVE_WINDOW);
  const alternatives: ClassificationCandidate[] | undefined = closeAlt
    ? [{ occupation: second.profile.id, confidence: round2(second.score) }]
    : undefined;

  // --- Confidence gating: the calibration core -----------------------------
  // 1. No defining signal → tools/generic/sector can never decide. Cap hard.
  // 2. A lone defining category → require independent corroboration. Cap below
  //    the threshold so a single strong-but-narrow signal falls to generic.
  // 3. A genuine two-way tie between real occupations → nudge down so a marginal
  //    winner cannot masquerade as a confident classification.
  let confidence = top.score;
  if (top.score === 0) {
    confidence = 0;
  } else if (!top.hasDefining) {
    confidence = Math.min(top.score, top.codes.has('SECTOR_TERMS_ONLY') ? SECTOR_ONLY_CAP : NON_DEFINING_CAP);
  } else if (top.supportingCount < 2) {
    confidence = Math.min(top.score, SINGLE_SIGNAL_CAP);
    top.codes.add('INSUFFICIENT_DIVERSITY');
  }
  if (closeAlt && top.hasDefining && second.hasDefining && confidence > AMBIGUITY_THRESHOLD - AMBIGUITY_PENALTY) {
    confidence = Math.max(0, confidence - AMBIGUITY_PENALTY);
  }

  return {
    occupation: top.score > 0 ? top.profile.id : 'generic',
    confidence: round2(confidence),
    reasonCodes: [...top.codes],
    alternatives,
    sectorFromDictionaries: bestSectorByDictionary(cvText),
  };
}

/** Fraction of a sector dictionary's terms present in the text (cheap scan). */
function dictionaryHitRatio(cvText: string, sector: Sector): number {
  const dictionary = getIndustryDictionary(sector);
  if (!dictionary) return 0;

  let total = 0;
  let hits = 0;
  for (const category of Object.values(dictionary.categories)) {
    for (const term of category.terms) {
      total++;
      const forms = [term.canonical, ...(term.aliases ?? [])];
      if (forms.some(form => buildKeywordRegex(form).test(cvText))) hits++;
    }
  }
  return total === 0 ? 0 : hits / total;
}

function bestSectorByDictionary(cvText: string): Sector | undefined {
  let best: { sector: Sector; ratio: number } | undefined;
  for (const sector of INDUSTRY_IDS) {
    if (sector === 'general') continue;
    const ratio = dictionaryHitRatio(cvText, sector);
    if (ratio > 0.08 && (!best || ratio > best.ratio)) best = { sector, ratio };
  }
  return best?.sector;
}

// ---------------------------------------------------------------------------
// Shared assembly
// ---------------------------------------------------------------------------

interface BuildExtras {
  cvText: string;
  reasonCodes: ReasonCode[];
  alternatives?: ClassificationCandidate[];
  sectorOverride?: Sector;
  seniorityOverride?: Seniority;
  /** For a regulated occupation, whether the CV corroborated it. */
  regulatedEvidence?: 'present' | 'absent';
}

function build(
  occupation: OccupationId,
  source: ClassificationSource,
  confidence: number,
  extras: BuildExtras
): Classification {
  const profile = getOccupationProfile(occupation);

  return {
    occupation,
    sector: extras.sectorOverride ?? profile.sector,
    roleArchetype: profile.roleArchetype,
    applicationWorkflow: profile.applicationWorkflow,
    primaryArtifact: profile.primaryArtifact,
    secondaryArtifacts: profile.secondaryArtifacts,
    seniority: extras.seniorityOverride ?? deriveSeniority(extras.cvText),
    regulated: profile.regulated,
    ...(profile.regulated && extras.regulatedEvidence
      ? { regulatedEvidence: extras.regulatedEvidence }
      : {}),
    confidence: round2(confidence),
    source,
    ...(extras.alternatives?.length ? { alternatives: extras.alternatives } : {}),
    reasonCodes: extras.reasonCodes,
  };
}

function parseSeniority(value: string | null | undefined): Seniority | undefined {
  return value === 'entry' || value === 'mid' || value === 'senior' || value === 'lead' ? value : undefined;
}

/** Cheap title-word heuristic; profiles refine this later where it matters. */
export function deriveSeniority(cvText: string): Seniority {
  const head = cvText.slice(0, 2000);
  if (/\b(?:principal|staff|head of|director)\b/i.test(head)) return 'lead';
  if (/\b(?:senior|lead)\b/i.test(head)) return 'senior';
  if (/\b(?:junior|graduate|trainee|apprentice|intern(?:ship)?|entry[- ]level)\b/i.test(head)) return 'entry';

  const yearsMatch = cvText.match(/(\d+)\+?\s*years[''']?\s*(?:of\s+)?experience/i);
  if (yearsMatch) {
    const years = parseInt(yearsMatch[1], 10);
    if (years >= 8) return 'senior';
    if (years >= 2) return 'mid';
    return 'entry';
  }

  return 'unknown';
}

/** The classification signal lives in the headline/summary/first role. */
function excerptForClassification(cvText: string): string {
  return cvText.slice(0, 1500);
}

function nonGenericProfiles(): OccupationProfile[] {
  return Object.values(OCCUPATION_PROFILES).filter(p => p.id !== 'generic');
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
