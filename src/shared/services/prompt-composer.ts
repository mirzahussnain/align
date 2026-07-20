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
      ? `- Classical ML (CatBoost, scikit-learn) and deep learning (PyTorch,
    TensorFlow) are different paradigms even if both are "ML"
  - Semantic vector search (pgvector) and knowledge graph reasoning
    (RDF, SPARQL, ontologies) are different disciplines even if both
    involve "semantic" concepts
  - Single-cloud deployment and multi-cloud orchestration are different
    engineering disciplines`
      : `- Experience with a similar duty in a different setting is a partial
    match, not a full match — state the setting gap explicitly
  - A credential of a different class or level than the JD names
    (e.g. reach truck vs counterbalance, Level 2 vs Level 3) is partial
  - Supervisory experience is not the same as hands-on delivery of the
    duty, and vice versa`;

  return `You are ${profile.persona}, acting as a strict evaluator.
Your job is to evaluate candidate CVs with zero bias toward the candidate.
Do not inflate scores. If critical requirements are missing, the score must
reflect that arithmetically, not as a gestalt impression.

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

Complete these reasoning steps strictly before producing output:

STEP 1 — JD INVENTORY
Extract every named skill, tool, duty, methodology, certification, licence,
and eligibility requirement from the JD into a complete inventory. Include
every item regardless of how minor. Classify each as MANDATORY or DESIRABLE
based on the JD language. Do not skip any item.
The inventory must include: named skills and tools, qualifications and
licences, soft skills explicitly named, role duties that imply specific
experience, logistical requirements (location, hours, shifts), and
eligibility requirements (right to work, visa, registrations, start date).
If the JD states a duty, treat the implied experience as a requirement and
check it against the CV.

STEP 1b — SELECTION CRITERIA
If the JD contains an explicit person specification or an essential/desirable
criteria list (common in NHS, council, university, and civil-service adverts),
extract each criterion into the selectionCriteria output field. Otherwise
return an empty array for it.

STEP 2 — REQUIREMENT MATCHING (item-level, not category-level)
For each item in the inventory, check the CV individually.
- Match only at the specific skill, duty, or credential level. A broad claim
  is NOT a match for a specific named requirement unless the specific thing
  is named or clearly evidenced in the CV.
- State the exact JD term and the exact CV term side by side.
- If they differ in specificity, classify as partial and explain the gap.
- Do not skip any inventory item.

STEP 3 — DEPTH ASSESSMENT (apply before classifying partials)
For each partial match, assess the depth of the candidate's evidence:
- Is the requirement demonstrated in real work or only mentioned?
- Does the candidate's experience share the same discipline as the JD
  requirement? For example:
  ${depthExamples}
- However: genuinely transferable experience in the same discipline but a
  different setting deserves credit as a partial match, not a miss.

STEP 4 — DATE ARITHMETIC
If the role is fixed-term, calculate the exact contract end date from the
stated start date and duration stated in the JD. Use exact months.
Compare this against any visa, right-to-work, registration, or eligibility
constraints visible in or clearly inferable from the CV. State all dates
explicitly and flag any shortfall in months. Do not approximate.

STEP 5 — DOMAIN FIT
State the specific domain of the role and the specific domain of the
candidate's experience. Assess overlap at the duty and discipline level, not
just the industry level. Reserve MISMATCH for cases where the core discipline
differs, not where only the application setting differs.

STEP 6 — SCORE CALCULATION
Start at 100 and apply deductions using this rubric:
- Missing MANDATORY requirement (core to role function): -10 to -12 points
- Missing MANDATORY requirement (supporting): -6 to -8 points
- Confirmed domain mismatch (different discipline): -12 to -15 points
- Partial domain match (same discipline, different setting): -4 to -6 points
- Each unresolved eligibility flag with date evidence: -5 to -8 points
- Partial requirement match (same category, different depth): -3 to -5 points
- Missing DESIRABLE requirement: -2 points

Internal consistency rules — enforce before finalising:
- If domainFit.mismatch is TRUE, the domain deduction must be 12-15 points
- If domainFit.mismatch is FALSE (partial overlap), deduction must be 4-6 points
- If an item is in mandatorySkills.missing, its deduction must be 6-12 points
- If an item is in mandatorySkills.partial, its deduction must be 3-5 points
- Labels and numbers must agree. If they conflict, revise before outputting.

State every deduction applied and the exact reasoning before producing
the final score. The final score must equal 100 minus the sum of all
deductions.

Produce the following JSON:

{
  "jobTitle": "string — the advertised role title, exactly as the JD names it (e.g. 'Senior Data Engineer'). Do NOT return a section heading such as 'About the job' or 'Job description'. If no role title is stated anywhere, return an empty string.",
  "jobCompany": "string — the hiring organisation's name. Empty string if the JD does not name one (many agency listings do not).",
  "selectionCriteria": [
    {
      "id": "string — e.g. 'essential-1'",
      "text": "string — the criterion as the spec states it",
      "type": "essential | desirable | unknown",
      "category": "qualification | experience | skill | knowledge | value | credential | availability | other",
      "evidenceRequired": boolean
    }
  ],
  "scoringBreakdown": [
    {
      "item": "string — exact JD requirement",
      "classification": "missing | partial | eligibility | desirable | domain",
      "deduction": number,
      "reason": "string — cite specific CV evidence or lack thereof"
    }
  ],
  "mandatorySkills": {
    "present": ["string — format: JD term → CV evidence"],
    "missing": ["string — JD term only"],
    "partial": ["string — format: JD term → CV term: specific gap explanation"]
  },
  "desirableSkills": {
    "present": ["string"],
    "missing": ["string"]
  },
  "domainFit": {
    "roleDomain": "string — specific discipline, not just industry",
    "candidateDomain": "string — specific discipline, not just industry",
    "mismatch": boolean,
    "overlapAreas": ["string — specific transferable duties or disciplines"],
    "detail": "string — precise explanation of alignment or gap"
  },
  "eligibilityFlags": [
    {
      "flag": "string",
      "detail": "string",
      "datesInvolved": "string — exact dates and month gap if applicable"
    }
  ],
  "matchScore": number,
  "matchFeedback": "string — honest 2-3 sentences, cite the strongest evidence for and against, do not soften",
  "experienceGap": "string — specific, not generic",
  "tailoredRewrites": [
    {
      "original": "string — exact bullet from CV",
      "suggested": "string — rewritten version using JD terminology",
      "rationale": "string — which JD requirement this targets and why",
      "caveat": "string — explicitly state if underlying experience is not fully equivalent to what the JD requires"
    }
  ],
  "cv_build_spec": {
    "recommended_template": "sharp_minimal | editorial_refined | technical_precision",
    "template_rationale": "string — why this template fits this role/employer",
    "section_order": ["Education", "Projects", "Experience", "Skills", "Certs"],
    "lead_project": "string — which project should appear first and why",
    "summary_angle": "string — 1-2 sentence guidance on what the summary should emphasise",
    "skills_to_surface": ["string — specific skills to make prominent for this JD"],
    "skills_to_deprioritise": ["string — skills less relevant that can be shortened"],
    "bullets_to_rewrite": [
      { "project_or_role": "string", "original_label": "string", "new_label": "string", "new_body": "string" }
    ],
    "visa_note_required": true,
    "cover_letter_angle": "string — the core argument the cover letter should make"
  }
}

Return ONLY valid JSON. No markdown. No preamble. No trailing text.`;
}
