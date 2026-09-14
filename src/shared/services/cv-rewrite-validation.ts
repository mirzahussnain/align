/**
 * Conservative post-generation truthfulness validation.
 *
 * This is a narrow, deterministic backstop — not a semantic verifier. It builds
 * a "source corpus" from the ONLY things that count as verified evidence:
 *
 *   - the source CV
 *   - ledger CV evidence
 *   - approved profile evidence
 *   - explicit user-provided context
 *
 * AI-authored build-spec text (bullet bodies, labels, target roles, lead
 * project, summary angle, skills to surface) is deliberately NOT in the corpus:
 * the build spec directs structure and emphasis, it never establishes a fact.
 *
 * It rejects a generated CV that introduces:
 *   - a new employer, job title, project, degree, university, or certification
 *   - a new impact metric absent from the source
 *   - a skill claimed as possessed while tied only to an unmet requirement
 *   - a positive eligibility claim the ledger contradicts
 *
 * On rejection the route persists nothing and consumes no quota; the user sees a
 * single plain-language message and can retry.
 */
import type { RewrittenCVData } from '@/shared/templates/types';
import type { LedgerNativeRewriteInput } from '@/shared/types/cv-rewrite';
import {
  buildEvidenceCorpus,
  collectGenerationEvidenceSources,
  extractImpactMetrics,
  metricSupported,
  normalizeText,
  phraseSupportedExact,
  tokensSupportedLoose,
  type EvidenceCorpus,
} from './cv-evidence';

export interface TruthfulnessResult {
  ok: boolean;
  /** Internal diagnostics — never shown to the user. */
  reasons: string[];
}

/** Positive work-authorisation phrases we must not let a contradicted ledger emit. */
const ELIGIBILITY_CLAIMS = [
  /right to work/,
  /eligible to work/,
  /work authoris/,
  /permanent resident/,
  /british citizen/,
  /indefinite leave/,
  /fully eligible/,
  /no visa (required|needed|sponsorship)/,
];

/**
 * Assemble the evidence corpus for validation. Only verified sources — never any
 * build-spec field — so an earlier AI call can never whitelist a claim.
 */
export function buildValidationCorpus(input: LedgerNativeRewriteInput): EvidenceCorpus {
  return buildEvidenceCorpus(
    collectGenerationEvidenceSources({
      cvText: input.cvText,
      approvedProfileEvidence: input.approvedProfileEvidence,
      userContext: input.userContext,
      requirementEvidence: input.rewriteContext.requirements.flatMap((requirement) => [
        ...requirement.cvEvidence,
        ...requirement.approvedProfileEvidence,
      ]),
    })
  );
}

function collectOutputText(cv: RewrittenCVData): string[] {
  const chunks: string[] = [cv.professionalSummary ?? '', cv.tagline ?? ''];
  for (const group of [...(cv.projects ?? []), ...(cv.experience ?? [])]) {
    for (const achievement of group.achievements ?? []) {
      chunks.push(achievement.label ?? '', achievement.body ?? '');
    }
  }
  return chunks.filter(Boolean);
}

/**
 * Validate a generated CV against the exact verified material the model was
 * allowed to draw on. Returns `ok: false` with internal reasons when a check
 * fails; the caller must neither persist the CV nor record usage in that case.
 */
export function validateRewrittenCv(
  cv: RewrittenCVData,
  input: LedgerNativeRewriteInput
): TruthfulnessResult {
  const corpus = buildValidationCorpus(input);
  const reasons: string[] = [];

  // Employers and job titles.
  for (const role of cv.experience ?? []) {
    if (role.company && !phraseSupportedExact(corpus, role.company)) {
      reasons.push(`New employer not in source evidence: "${role.company}".`);
    }
    if (role.jobTitle && !tokensSupportedLoose(corpus, role.jobTitle)) {
      reasons.push(`New job title not in source evidence: "${role.jobTitle}".`);
    }
  }

  // Projects.
  for (const project of cv.projects ?? []) {
    if (project.name && !tokensSupportedLoose(corpus, project.name)) {
      reasons.push(`New project not in source evidence: "${project.name}".`);
    }
  }

  // Qualifications.
  for (const education of cv.education ?? []) {
    if (education.degree && !tokensSupportedLoose(corpus, education.degree)) {
      reasons.push(`New qualification not in source evidence: "${education.degree}".`);
    }
    if (education.university && !phraseSupportedExact(corpus, education.university)) {
      reasons.push(`New institution not in source evidence: "${education.university}".`);
    }
  }

  // Certifications, licences, registrations — proper nouns, exact match required.
  for (const certification of cv.certifications ?? []) {
    if (certification.name && !phraseSupportedExact(corpus, certification.name)) {
      reasons.push(`New certification not in source evidence: "${certification.name}".`);
    }
  }

  // Impact metrics that are neither present in nor derivable from the source.
  for (const text of collectOutputText(cv)) {
    for (const metric of extractImpactMetrics(text)) {
      if (!metricSupported(corpus, metric)) {
        reasons.push(`Unverifiable metric not in source evidence: "${metric}".`);
      }
    }
  }

  // Skills claimed as possessed while tied only to an unmet requirement.
  const unmetRequirementTexts = input.rewriteContext.requirements
    .filter((requirement) =>
      ['not_met', 'contradicted', 'unclear'].includes(requirement.status)
    )
    .map((requirement) => normalizeText(requirement.text))
    .filter((text) => text.length > 0);

  for (const group of cv.coreSkills ?? []) {
    for (const skill of (group.skills ?? '').split(/[,/]/)) {
      const skillNorm = normalizeText(skill);
      if (skillNorm.length < 3) continue;
      if (corpus.norm.includes(skillNorm)) continue;
      if (unmetRequirementTexts.some((requirement) => requirement.includes(skillNorm))) {
        reasons.push(`Skill claimed but tied to an unmet requirement: "${skill.trim()}".`);
      }
    }
  }

  // Positive eligibility claim contradicting the ledger.
  const contradictedEligibility = input.rewriteContext.requirements.some(
    (requirement) =>
      (requirement.category === 'eligibility' || requirement.category === 'availability') &&
      (requirement.status === 'contradicted' || requirement.status === 'not_met')
  );
  if (contradictedEligibility) {
    const claimText = normalizeText(
      `${cv.professionalSummary ?? ''} ${cv.contact?.visaStatus ?? ''}`
    );
    for (const claim of ELIGIBILITY_CLAIMS) {
      if (claim.test(claimText) && !claim.test(corpus.norm)) {
        reasons.push('Eligibility claim contradicts the requirement ledger.');
        break;
      }
    }
  }

  return { ok: reasons.length === 0, reasons };
}

/** The single message the user ever sees for a truthfulness rejection. */
export const TRUTHFULNESS_FAILURE_MESSAGE =
  'The generated draft included claims that Align could not verify, so it was not saved or charged.';
