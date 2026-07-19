import { AI_CONFIG } from '@/shared/lib/config';
import { THINKING_BUDGETS } from '@/shared/lib/config';
import type { CVAnalysisResult } from '@/shared/types/cv';
import type { AISemanticOutput, AIJobMatchOutput } from '@/shared/types/ai';
import { INDUSTRY_IDS } from '@/shared/constants/industry-keywords';
import { generateJSONFromAI } from './ai-orchestrator';

export async function getSemanticCVFeedback(
  cvText: string,
  baseResult: CVAnalysisResult
): Promise<AISemanticOutput | null> {
  const prompt = `You are a Staff-Level Technical Recruiter specializing in the UK Tech Market. 
Review this candidate's raw CV text and the base metrics from our local parser. 

Provide a detailed semantic evaluation covering:
1. Target Role Title & Domain: Identify the desired tech role. Determine if this CV actually belongs to a Software Engineering / Tech discipline (set isTechRole to true) or if it belongs to a completely different industry like Marketing/Finance (set isTechRole to false).
1b. Industry Classification: Classify this CV into exactly ONE of the following industry codes, which selects the UK keyword dictionary it will be scored against: ${INDUSTRY_IDS.join(', ')}. Choose the code matching the candidate's actual field, not the one they aspire to. Use "general" only when the CV spans no identifiable industry or none of the specific codes fit.
2. Professional Summary: Evaluate length (30-60 words target), role alignment, metric inclusion, and buzzword count.
3. Impact Statements: Check for quantified metrics using the STAR method (Action + Metric + Tech Stack).
4. UK Tech Stack Relevance: Assess if they list essential UK tech capabilities, specifically checking for testing tools/frameworks (Jest, Cypress, Playwright, Vitest).
5. HR Red Flags / Gaps: Identify short tenures (< 6 months), employment gaps, or self-employed positioning that lacks client context.
6. Clichés & Buzzwords: Identify overused, low-credibility words (like "passionate", "motivated", "self-starter").

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
  "detectedIndustry": "one of: ${INDUSTRY_IDS.join(' | ')}",
  "summaryScore": number (1 to 10),
  "summaryFeedback": "string detailing summary validation",
  "impactScore": number (1 to 10),
  "impactFeedback": "string detailing quantified achievements/STAR method assessment",
  "additionalKeywords": [
    { "keyword": "string", "category": "string", "count": number }
  ],
  "rewrites": [
    {
      "original": "exact weak bullet point from the CV",
      "suggested": "rewritten bullet point incorporating STAR method and specific technologies",
      "rationale": "why this is stronger for UK tech recruiters"
    }
  ],
  "ukTechAlignment": "string summarizing alignment to UK tech expectations",
  "detectedRole": "string representing the detected target job title (or empty string if none)",
  "hasTesting": boolean,
  "isTechRole": boolean,
  "riskFlags": ["string listing specific HR red flags or tenure risk descriptions found"],
  "clichés": ["string listing detected buzzwords/clichés like 'passionate' or 'motivated'"]
}`;

  return generateJSONFromAI<AISemanticOutput>({
    prompt,
    temperature: 0.1,
    thinkingBudget: THINKING_BUDGETS.semanticFeedback,
  });
}

export async function getJobMatchFeedback(
  cvText: string,
  jobDescription: string
): Promise<AIJobMatchOutput | null> {
  const prompt = `You are a strict Staff-Level Technical Recruiter at a top UK tech company.
Your job is to evaluate candidate CVs with zero bias toward the candidate.
Do not inflate scores. If critical requirements are missing, the score must 
reflect that arithmetically, not as a gestalt impression.

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
Extract every named skill, tool, language, framework, methodology, 
certification, and eligibility requirement from the JD into a complete 
inventory. Include every item regardless of how minor. Classify each as 
MANDATORY or DESIRABLE based on the JD language. Do not skip any item.
The inventory must include: technical skills, tools, languages, frameworks, 
qualifications, soft skills explicitly named, role duties that imply 
specific experience (e.g. "write peer-reviewed papers" implies academic 
writing experience), logistical requirements (location, hours), and 
eligibility requirements (visa, ATAS, start date). If the JD states a 
duty, treat the implied experience as a requirement and check it against 
the CV.

STEP 2 — SKILL MATCHING (tool-level, not category-level)
For each item in the inventory, check the CV individually.
- Match only at the specific tool or technique level. "AI/ML experience" 
  is NOT a match for "TensorFlow/PyTorch" unless those exact frameworks 
  are named or clearly evidenced in the CV.
- State the exact JD term and the exact CV term side by side.
- If they differ in specificity, classify as partial and explain the gap.
- Do not skip any inventory item.

STEP 3 — DEPTH ASSESSMENT (apply before classifying partials)
For each partial match, assess the depth of the candidate's evidence:
- Is the skill demonstrated in a production system or only mentioned?
- Does the candidate's implementation share the same computational 
  paradigm as the JD requirement? For example:
  - Classical ML (CatBoost, scikit-learn) and deep learning (PyTorch, 
    TensorFlow) are different paradigms even if both are "ML"
  - Semantic vector search (pgvector) and knowledge graph reasoning 
    (RDF, SPARQL, ontologies) are different disciplines even if both 
    involve "semantic" concepts
  - Single-cloud deployment and multi-cloud orchestration are different 
    engineering disciplines
- However: a production risk scoring system (e.g. medical outcome 
  prediction with confidence scores) shares meaningful technical overlap 
  with other risk scoring domains (e.g. criminal justice risk prediction) 
  even if the domain differs. Credit this as a genuine partial match, 
  not a miss.

STEP 4 — DATE ARITHMETIC
If the role is fixed-term, calculate the exact contract end date from the 
stated start date and duration stated in the JD. Use exact months.
Compare this against any visa, right-to-work, or eligibility constraints 
visible in or clearly inferable from the CV. State all dates explicitly 
and flag any shortfall in months. Do not approximate.

STEP 5 — DOMAIN FIT
State the specific technical domain of the role and the specific domain 
of the candidate's experience. Assess overlap at the technique level, 
not just the industry level. A candidate who has built production ML 
risk-scoring systems in one domain has genuine transferability to 
risk-scoring in another domain — do not classify this as a full mismatch. 
Reserve MISMATCH for cases where the core technical discipline differs 
(e.g. embedded systems vs web development), not where the application 
domain differs (e.g. health vs criminal justice).

STEP 6 — SCORE CALCULATION
Start at 100 and apply deductions using this rubric:
- Missing MANDATORY skill (core to role function): -10 to -12 points
- Missing MANDATORY skill (supporting requirement): -6 to -8 points
- Confirmed domain mismatch (different technical discipline): -12 to -15 points
- Partial domain match (same discipline, different application): -4 to -6 points
- Each unresolved eligibility flag with date evidence: -5 to -8 points
- Partial skill match (same category, different tool/depth): -3 to -5 points
- Missing DESIRABLE skill: -2 points

Internal consistency rules — enforce before finalising:
- If domainFit.mismatch is TRUE, the domain deduction must be 12-15 points
- If domainFit.mismatch is FALSE (partial overlap), deduction must be 4-6 points
- If a skill is in mandatorySkills.missing, its deduction must be 6-12 points
- If a skill is in mandatorySkills.partial, its deduction must be 3-5 points
- Labels and numbers must agree. If they conflict, revise before outputting.

State every deduction applied and the exact reasoning before producing 
the final score. The final score must equal 100 minus the sum of all 
deductions.

Produce the following JSON:

{
  "jobTitle": "string — the advertised role title, exactly as the JD names it (e.g. 'Senior Data Engineer'). Do NOT return a section heading such as 'About the job' or 'Job description'. If no role title is stated anywhere, return an empty string.",
  "jobCompany": "string — the hiring organisation's name. Empty string if the JD does not name one (many agency listings do not).",
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
    "roleDomain": "string — specific technical discipline, not just industry",
    "candidateDomain": "string — specific technical discipline, not just industry",
    "mismatch": boolean,
    "overlapAreas": ["string — specific transferable techniques or paradigms"],
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

  return generateJSONFromAI<AIJobMatchOutput>({
    prompt,
    temperature: 0.1,
    thinkingBudget: THINKING_BUDGETS.jobMatch,
  });
}
