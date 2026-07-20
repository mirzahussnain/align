// Occupation/sector classification — runs BEFORE any scoring so the first
// deterministic pass is already correctly sectored.
//
// Precedence (first confident tier wins):
//   1. Job description title match          (job-match mode, 0.95)
//   2. Profile target occupation/role title (0.9)
//   3. Deterministic CV evidence            (accepts at >= 0.8)
//   4. AI micro-classification              (only when allowed and still ambiguous)
//   5. Generic fallback                     (0.3)
//
// Evidence weighting rule: role titles, day-to-day task patterns, and
// credential evidence rank ABOVE sector vocabulary. Sector terms describe the
// environment, never the occupation — an NHS data analyst CV full of
// "patient/clinical/NHS" must not classify as a nurse. When sector terms are
// the only signal we emit SECTOR_TERMS_ONLY and treat the result as ambiguous.

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
  jobDescription?: string;
  profileTarget?: {
    occupation?: string | null;
    roleTitle?: string | null;
    industry?: string | null;
    seniority?: string | null;
  };
  /** False when the AI tier must not run (quota-degraded ATS still classifies deterministically). */
  aiAllowed: boolean;
}

type AIClassifierFn = typeof aiClassify;

/** Confidence below which the AI tier is consulted. */
const AMBIGUITY_THRESHOLD = 0.8;
/** Score gap within which a runner-up is reported as an alternative. */
const ALTERNATIVE_WINDOW = 0.15;

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

  // Tier 2 — user-declared target on the profile.
  const fromProfile = classifyFromProfileTarget(input);
  if (fromProfile) return fromProfile;

  // Tier 3 — deterministic evidence in the CV itself.
  const evidence = scoreOccupationEvidence(input.cvText);
  if (evidence.confidence >= AMBIGUITY_THRESHOLD) {
    return build(evidence.occupation, 'dictionary_evidence', evidence.confidence, {
      cvText: input.cvText,
      reasonCodes: evidence.reasonCodes,
      alternatives: evidence.alternatives,
    });
  }

  // Tier 4 — AI micro-classification for the genuinely ambiguous.
  if (input.aiAllowed) {
    const ai = await aiClassifier(excerptForClassification(input.cvText), input.profileTarget?.roleTitle ?? undefined);
    if (ai && isKnownOccupation(ai.occupation) && ai.occupation !== 'generic') {
      return build(ai.occupation, 'ai', Math.min(ai.confidence, 0.9), {
        cvText: input.cvText,
        reasonCodes: [...evidence.reasonCodes, 'AI_CLASSIFIED'],
        alternatives: evidence.alternatives,
        sectorOverride: isKnownIndustry(ai.sector) ? ai.sector : undefined,
        seniorityOverride: ai.seniority !== 'unknown' ? ai.seniority : undefined,
      });
    }
  }

  // Tier 5 — generic fallback; keep whatever weak evidence we saw for debugging.
  return build('generic', 'fallback', 0.3, {
    cvText: input.cvText,
    reasonCodes: evidence.reasonCodes.length ? [...evidence.reasonCodes, 'FALLBACK'] : ['FALLBACK'],
    alternatives: evidence.alternatives,
    sectorOverride: evidence.sectorFromDictionaries,
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
  return null;
}

// ---------------------------------------------------------------------------
// Tier 2: profile target
// ---------------------------------------------------------------------------

function classifyFromProfileTarget(input: ClassifyInput): Classification | null {
  const target = input.profileTarget;
  if (!target) return null;

  // The user's declared industry is a stronger signal than the occupation
  // profile's hardcoded default sector — an administrator who declared
  // "Healthcare / NHS" should be scored against NHS vocabulary, not whatever
  // sector the generic administrator profile happens to default to.
  const sectorOverride = isKnownIndustry(target.industry) ? target.industry : undefined;

  if (isKnownOccupation(target.occupation) && target.occupation !== 'generic') {
    return build(target.occupation, 'profile_target', 0.9, {
      cvText: input.cvText,
      reasonCodes: ['PROFILE_TARGET_SET'],
      seniorityOverride: parseSeniority(target.seniority),
      sectorOverride,
    });
  }

  // A free-text role title can still resolve deterministically.
  if (target.roleTitle) {
    for (const profile of nonGenericProfiles()) {
      if (profile.detection.titlePatterns.some(p => p.test(target.roleTitle!))) {
        return build(profile.id, 'profile_target', 0.9, {
          cvText: input.cvText,
          reasonCodes: ['PROFILE_TARGET_SET', 'JOB_TITLE_EXACT_MATCH'],
          seniorityOverride: parseSeniority(target.seniority),
          sectorOverride,
        });
      }
    }
  }

  return null;
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

export function scoreOccupationEvidence(cvText: string): EvidenceResult {
  type Scored = { profile: OccupationProfile; score: number; codes: Set<ReasonCode> };
  const scored: Scored[] = [];

  // Title evidence must come from title-like lines (headlines, role headers),
  // never prose — an HCA's bullet "escalating concerns to the registered
  // nurse" is not a nurse title.
  const titleText = cvText
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length >= 3 && l.length <= 80)
    .join('\n');

  for (const profile of nonGenericProfiles()) {
    const codes = new Set<ReasonCode>();
    let score = 0;

    // Role titles — the strongest signal by design.
    const titleHits = profile.detection.titlePatterns.filter(p => p.test(titleText)).length;
    if (titleHits > 0) {
      score += 0.5 + Math.min(titleHits - 1, 2) * 0.1;
      codes.add('JOB_TITLE_EXACT_MATCH');
    }

    // Day-to-day task/tool evidence.
    const taskHits = profile.detection.taskPatterns.filter(p => p.test(cvText)).length;
    if (taskHits > 0) {
      score += Math.min(taskHits, 4) * 0.08;
      codes.add(taskHits >= 2 ? 'CORE_TASKS_MATCH' : 'TOOLS_MATCH');
    }

    // Credential evidence (an NMC PIN on the CV is strong nurse evidence).
    const credentialHits = profile.credentials.filter(c => c.patterns.some(p => p.test(cvText))).length;
    if (credentialHits > 0) {
      score += Math.min(credentialHits, 2) * 0.1;
      codes.add('CREDENTIAL_EVIDENCE');
    }

    // Sector vocabulary — deliberately the WEAKEST signal, and never
    // sufficient alone: it describes the environment, not the occupation.
    const sectorHitRatio = dictionaryHitRatio(cvText, profile.sector);
    if (sectorHitRatio > 0.05) {
      score += Math.min(sectorHitRatio, 0.3) * 0.33; // caps at ~0.1
      if (codes.size === 0) codes.add('SECTOR_TERMS_ONLY');
    }

    scored.push({ profile, score: Math.min(score, 1), codes });
  }

  scored.sort((a, b) => b.score - a.score);
  const [top, second] = scored;

  const alternatives: ClassificationCandidate[] | undefined =
    second && second.score > 0 && top.score - second.score <= ALTERNATIVE_WINDOW
      ? [{ occupation: second.profile.id, confidence: round2(second.score) }]
      : undefined;

  // Sector terms alone never constitute a confident match.
  const sectorOnly = top.codes.has('SECTOR_TERMS_ONLY');
  const confidence = sectorOnly ? Math.min(top.score, 0.4) : top.score;

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
