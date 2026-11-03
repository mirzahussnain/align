// Prompt composition for the AI evaluation layer. The evaluator template is
// occupation-neutral; everything occupation-shaped — persona, evidence
// priorities, credential checklist, impact guidance, prohibitions — is
// injected from the versioned occupation profile. Profiles are authored and
// reviewed in the repo; no AI ever invents evaluation rules at request time.

import { SECTOR_LABELS } from '@/shared/constants/sector-labels';
import { applicableCredentials } from '@/shared/occupations/credentials';
import type { OccupationProfile } from '@/shared/occupations/types';
import type { Classification } from '@/shared/types/classification';
import type { CVAnalysisResult } from '@/shared/types/cv';

function contextBlock(profile: OccupationProfile, classification: Classification): string {
  return `Candidate context (already classified upstream — do NOT re-classify):
- Occupation: ${profile.label}
- Sector: ${SECTOR_LABELS[classification.sector]}
- Seniority: ${classification.seniority}
- Regulated role: ${classification.regulated ? 'yes' : 'no'}`;
}

function prohibitionsBlock(profile: OccupationProfile): string {
  const lines = [
    ...profile.prohibitedExpectations,
    'Do not apply expectations from unrelated industries or occupations.',
    'Do not penalise the candidate for missing tools, credentials, sections, or achievements that are irrelevant to their field.',
  ];
  return `STRICT PROHIBITIONS — violating any of these makes the evaluation wrong:\n${lines.map(l => `- ${l}`).join('\n')}`;
}

function evaluationProfileBlock(
  profile: OccupationProfile,
  classification: Classification
): string {
  // Gated by appliesWhen, exactly as the deterministic scorer gates it — the
  // prompt must never name a credential the candidate's classification does
  // not actually call for.
  const applicable = applicableCredentials(profile, classification);
  const credentialList = applicable.length
    ? applicable.map(c => `${c.label} (${c.class.replace('_', '-')})`).join('; ')
    : 'none expected for this occupation';

  return `Evaluation profile for ${profile.label}:
- Evidence that matters most, in priority order: ${profile.evidencePriorities.join('; ')}
- Credential checklist: ${credentialList}
- What impact means here: ${profile.impactGuidance}
- Summary guidance: ${profile.summaryGuidance}`;
}

export function composeSemanticPrompt(
  cvText: string,
  baseResult: CVAnalysisResult,
  profile: OccupationProfile,
  classification: Classification
): string {
  return `You are ${profile.persona}. Review this candidate's raw CV text and the base metrics from our local parser.

${contextBlock(profile, classification)}

${evaluationProfileBlock(profile, classification)}

${prohibitionsBlock(profile)}

Provide a detailed semantic evaluation covering:
1. Target Role Title: identify the specific role this CV is aimed at, within the candidate's occupation.
2. Professional Summary: evaluate length (30-60 words target), alignment to the target role, evidence inclusion, and buzzword count, following the summary guidance above.
3. Impact Statements: assess achievement bullets against what impact means for this occupation (see above). Specific action + relevant responsibility + scale, frequency, or outcome where available. Numbers strengthen a bullet but are never mandatory.
4. Credential Observations: note whether expected credentials from the checklist are clearly named, current, and easy to find — and any that appear expired or vague. Do not invent expectations beyond the checklist.
5. HR Red Flags / Gaps: short tenures (< 6 months), employment gaps, or self-employed positioning lacking context.
6. Clichés & Buzzwords: overused, low-credibility words (like "passionate", "motivated", "self-starter").

Raw CV Text:
"""
${cvText}
"""

Base Parser Results:
- Word Count: ${baseResult.rawText.split(/\s+/).filter(w => w.length > 0).length}
- Page Count: ${baseResult.pageCount}
- Detected Keywords: ${JSON.stringify(baseResult.keywords.present.map(k => k.keyword))}
- Missing Keywords (sample): ${JSON.stringify(baseResult.keywords.missing.slice(0, 25).map(k => k.keyword))}

Return ONLY a valid JSON object matching the schema below. Do not include markdown wraps (like \`\`\`json) or extra text outside the JSON block.

Schema:
{
  "summaryScore": number (1 to 10),
  "summaryFeedback": "string detailing summary validation",
  "impactScore": number (1 to 10),
  "impactFeedback": "string assessing achievements against this occupation's impact standards",
  "additionalKeywords": [
    { "keyword": "string — a role-relevant term present in the CV that the parser missed", "category": "string", "count": number }
  ],
  "rewrites": [
    {
      "original": "exact weak bullet point from the CV",
      "suggested": "rewritten bullet using this occupation's own evidence language — never invent numbers or credentials",
      "rationale": "why this is stronger for the target role"
    }
  ],
  "alignmentNote": "string — 2-3 sentences on how well the CV aligns to ${profile.label} expectations in the UK market",
  "detectedRole": "string — the detected target job title (or empty string if none)",
  "credentialObservations": ["string — one observation per checklist credential worth flagging"],
  "riskFlags": ["string listing specific HR red flags or tenure risks found"],
  "clichés": ["string listing detected buzzwords/clichés"]
}`;
}

export function composeJobMatchPrompt(
  cvText: string,
  jobDescription: string,
  profile: OccupationProfile,
  classification: Classification
): string {
  // Depth examples are archetype-appropriate; the tech paradigms only make
  // sense for technical specialists.
  const depthExamples =
    profile.roleArchetype === 'technical_specialist'
      ? `- Classical ML (CatBoost/scikit-learn) differs from deep learning (PyTorch/TensorFlow).
- Vector search (pgvector) differs from knowledge graphs (RDF/SPARQL/ontologies).
- Single-cloud differs from multi-cloud orchestration.`
      : `- A similar duty in another setting is partial; name the setting gap.
- A different credential class/level (reach truck vs counterbalance; Level 2 vs 3) is partial.
- Supervising a duty differs from hands-on delivery.`;

  return `You are ${profile.persona}, a strict, unbiased evaluator. Do not inflate scores; deductions must arithmetically reflect missing critical requirements.

${contextBlock(profile, classification)}

${evaluationProfileBlock(profile, classification)}

${prohibitionsBlock(profile)}

Job Description:
"""
${jobDescription}
"""

Candidate CV:
"""
${cvText}
"""

Complete these steps before output:

STEP 1 — COMPLETE JD INVENTORY
Create ONE canonical requirements array; Each requirement must appear exactly once. Include every named skill, tool, experience, duty, methodology, qualification, certification, licence, eligibility/availability condition, location constraint, shift or work-pattern requirement, and explicit soft skill. Classify each as mandatory/desirable from JD wording. A stated duty implies required experience to check against the CV.

Related requirements may share clusterKey and clusterLabel. Omit otherwise; IDs stay distinct.

STEP 1b — SOURCE SECTION
sourceSection=person_specification only for an explicit person specification or Essential/Desirable criteria list; otherwise job_description. Never create a second criteria list.

STEP 2 — REQUIREMENT MATCHING (item-level, not category-level)
Check every item individually at the specific skill/duty/credential level; broad category claims are insufficient. Evidence must be exact verbatim CV evidence with no invented location. status is met|partial|not_met|contradicted|unclear; contradicted requires explicit conflict, while absence alone is not_met or unclear. Specificity gaps are partial and named in deduction.reason. With no evidence use []; skip nothing.

STEP 3 — DEPTH ASSESSMENT (apply before classifying partials)
For each partial, distinguish demonstrated work from a mention and compare disciplines:
${depthExamples}
Transferable work in the same discipline but another setting is partial, not missed.

STEP 4 — DATE ARITHMETIC
For fixed-term roles calculate the exact end date from stated start/duration, then compare with CV-evidenced visa, right-to-work, registration, or eligibility constraints. State dates and any shortfall in exact months.

STEP 5 — DOMAIN FIT
Name both specific domains and assess duty/discipline overlap. mismatch requires a different core discipline, not merely a different setting.

STEP 6 — DEDUCTION LEDGER
Give every requirement one non-negative integer deduction; use zero/rubric=met when none applies:
- Missing MANDATORY requirement (core to role function): -10 to -12 points
- Missing MANDATORY requirement (supporting): -6 to -8 points
- Confirmed domain mismatch (different discipline): -12 to -15 points
- Partial domain match (same discipline, different setting): -4 to -6 points
- Each unresolved eligibility flag with date evidence: -5 to -8 points
- Partial requirement match (same category, different depth): -3 to -5 points
- Missing DESIRABLE requirement: -2 points

Consistency: domain aligned=0, partial=4-6, mismatch=12-15; requirement met=0. Every deduction explains exact evidence or absence.
- Do NOT calculate or return matchScore. The server owns the final arithmetic.
- Do NOT generate requirement ids. The server assigns them after validation.
- Never infer seniority labels. Describe evidenced experience; independent/self-employed work is real but not senior commercial ownership. Say "not fully evidenced" when needed.

REQUIRED TOP-LEVEL FIELDS: domainFit, matchFeedback, and experienceGap must all be present and non-null. Never omit any of them.

Produce the following JSON:

{
  "jobTitle": "string — the advertised role title, exactly as the JD names it (e.g. 'Senior Data Engineer'). Do NOT return a section heading such as 'About the job' or 'Job description'. If no role title is stated anywhere, return an empty string.",
  "jobCompany": "string — the hiring organisation's name. Empty string if the JD does not name one (many agency listings do not).",
  "schemaVersion": 2,
  "requirements": [
    {
      "text": "string — exact JD requirement, included once",
      "importance": "mandatory | desirable",
      "category": "qualification | experience | skill | tool | methodology | duty | knowledge | value | credential | eligibility | availability | other",
      "sourceSection": "job_description | person_specification",
      "evidenceRequired": boolean,
      "clusterKey": "string",
      "clusterLabel": "string",
      "status": "met | partial | not_met | contradicted | unclear",
      "evidence": [
        {
          "source": "cv",
          "text": "string — exact verbatim CV evidence",
          "location": "string — CV section or role/project name, only when explicit"
        }
      ],
      "confidence": "number from 0 to 1",
      "deduction": {
        "points": "non-negative integer",
        "reason": "string — exact reason grounded in the JD and CV",
        "rubric": "met | mandatory_core_missing | mandatory_supporting_missing | partial_match | desirable_missing | eligibility | other"
      }
    }
  ],
  "domainFit": {
    "roleDomain": "string — specific discipline, not just industry",
    "candidateDomain": "string — specific discipline, not just industry",
    "status": "aligned | partial | mismatch",
    "overlapAreas": ["string — specific transferable duties or disciplines"],
    "detail": "string — precise explanation of alignment or gap",
    "confidence": "number from 0 to 1",
    "deduction": {
      "points": "non-negative integer",
      "reason": "string"
    }
  },
  "matchFeedback": "string — honest 2-3 sentences, cite the strongest evidence for and against, do not soften",
  "experienceGap": "string — specific, not generic",
  "tailoredRewrites": [
    {
      "original": "string — exact bullet from CV",
      "suggested": "string — rewritten version using JD terminology",
      "rationale": "string — which JD requirement this targets and why",
      "caveat": "string — explicitly state if underlying experience is not fully equivalent to what the JD requires"
    }
  ]
}

Return ONLY valid JSON. No markdown. No preamble. No trailing text.`;
}
