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

STEP 1 — COMPLETE JD INVENTORY
Extract every requirement from the JD into ONE canonical requirements array.
Each requirement must appear exactly once. Include every named skill, tool,
experience requirement, duty, methodology, qualification, certification,
licence, eligibility condition, availability condition, location constraint,
shift or work-pattern requirement, and explicitly named soft skill.

Classify each requirement internally as MANDATORY or DESIRABLE from the JD's
own wording. If the JD states a duty, treat the implied experience as a
requirement and check it against the CV.

STEP 1b — SOURCE SECTION
Set sourceSection to person_specification only when the item comes from an
explicit person specification or Essential/Desirable criteria list (common in
NHS, council, university, and civil-service adverts). Use job_description
for every other requirement. Do not return a second criteria list.

STEP 2 — REQUIREMENT MATCHING (item-level, not category-level)
For every requirement in the inventory, check the CV individually.
- Match only at the specific skill, duty, or credential level. A broad claim
  is NOT a match for a specific named requirement unless the specific thing
  is named or clearly evidenced in the CV.
- Put exact, verbatim supporting CV text in the evidence array. Never rewrite
  evidence and never invent a source location.
- Use status met, partial, not_met, contradicted, or unclear.
- contradicted means the CV explicitly conflicts with the requirement;
  absence alone is not_met or unclear.
- If JD and CV differ in specificity, classify as partial and explain the gap
  in deduction.reason.
- Use an empty evidence array when no supporting evidence exists.
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

STEP 6 — DEDUCTION LEDGER
Assign one non-negative integer deduction to every requirement. Use zero with
rubric met when no deduction applies. Apply this rubric:
- Missing MANDATORY requirement (core to role function): -10 to -12 points
- Missing MANDATORY requirement (supporting): -6 to -8 points
- Confirmed domain mismatch (different discipline): -12 to -15 points
- Partial domain match (same discipline, different setting): -4 to -6 points
- Each unresolved eligibility flag with date evidence: -5 to -8 points
- Partial requirement match (same category, different depth): -3 to -5 points
- Missing DESIRABLE requirement: -2 points

Internal consistency rules — enforce before finalising:
- An aligned domain has a zero-point domain deduction
- A partial domain match has a 4-6 point domain deduction
- A domain mismatch has a 12-15 point domain deduction
- A met requirement has a zero-point deduction
- Every deduction must explain the exact evidence or absence behind it
- Do NOT calculate or return matchScore. The server owns the final arithmetic.
- Do NOT generate requirement ids. The server assigns them after validation.
- Do NOT assign the candidate a seniority label (e.g. "entry-level", "junior",
  "senior") that the CV does not explicitly evidence. Describe demonstrated
  experience in grounded terms. Independent or self-employed delivery is real
  experience — do not dismiss it as a hobby, and do not treat it as equivalent
  to senior commercial ownership either. When seniority is not evidenced, say
  it is "not fully evidenced" rather than asserting a level.

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
