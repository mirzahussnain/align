import type { RewrittenCVData } from '../templates/types';
import type { ProfileCandidate } from '@/shared/types/profile-reasoning';
import { generateJSONFromAI } from './ai-orchestrator';
import { THINKING_BUDGETS } from '@/shared/lib/config';

export async function rewriteCV(
  originalCvText: string,
  jobDescription: string,
  jobMatchFeedbackStr: string,
  templateId: string,
  hitlContext: Record<string, string> = {},
  atsOptimizationData?: string | null,
  /**
   * Profile items the user approved bringing into this CV. Already re-resolved
   * from the stored profile by the caller, so every entry is real.
   */
  approvedProfileItems: ProfileCandidate[] = []
): Promise<RewrittenCVData | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let feedbackData: Record<string, any> = {};
  try {
    feedbackData = JSON.parse(jobMatchFeedbackStr);
  } catch {
    console.warn('[cv-rewriter] Failed to parse jobMatchFeedback — empty spec will be used.');
  }

  const cv_build_spec = feedbackData?.cv_build_spec ?? null;
  const mandatorySkills = feedbackData?.mandatorySkills ?? { missing: [], partial: [] };

  const buildSpecSection = cv_build_spec ? `
═══ CV BUILD SPECIFICATION (follow these instructions exactly) ═══
Recommended Template: ${cv_build_spec.recommended_template}
Section Order: ${cv_build_spec.section_order?.join(' → ') ?? 'summary → education → projects → experience → skills → certifications'}
Lead Project: ${cv_build_spec.lead_project ?? 'Use most technically relevant project for this JD'}
Summary Angle: ${cv_build_spec.summary_angle ?? 'Highlight core strengths for JD'}
Skills to Surface: ${cv_build_spec.skills_to_surface?.join(', ') ?? 'None specified'}
Skills to Deprioritise: ${cv_build_spec.skills_to_deprioritise?.join(', ') ?? 'None specified'}
Visa Note Required: ${cv_build_spec.visa_note_required ?? false}

Bullets to Rewrite (use these exact labels and rewrite the body):
${cv_build_spec.bullets_to_rewrite?.map((b: any, i: number) =>
  `${i + 1}. Project/Role: ${b.project_or_role}
     Original Label: ${b.original_label}
     New Label: ${b.new_label}
     New Body: ${b.new_body}`
).join('\n') ?? 'None specified'}
` : `
═══ CV BUILD SPECIFICATION ═══
No build spec available. Use your judgment based on the JD and analysis.
Default section order: summary → education → projects → experience → skills → certifications
`;

  let templateInstructions = "";
  if (templateId === 'technical_precision') {
    templateInstructions = `
═══ TEMPLATE EXPECTATIONS (Technical Precision) ═══
- Use lowercase style for skill categories (e.g., "ai/ml", "languages", "cloud/devops").
- Keep bullet points incredibly dense and technical.
- Eliminate filler words; focus entirely on tools, scale, and impact.
`;
  } else if (templateId === 'academic_latex') {
    templateInstructions = `
═══ TEMPLATE EXPECTATIONS (Academic / LaTeX) ═══
- Format for a classic academic/research role. 
- You MUST ensure the 'Projects' section includes heavy technical detail.
- If the original CV has research papers, thesis, or publications, include them in the 'Projects' or 'Experience' section with academic language.
- Keep skill categories traditional (e.g., "Programming & Tools", "Machine Learning Methods", "Healthcare AI").
`;
  } else if (templateId === 'editorial_refined') {
    templateInstructions = `
═══ TEMPLATE EXPECTATIONS (Editorial Refined) ═══
- Use a warmer, highly professional corporate tone.
- Skill categories should be cleanly capitalized (e.g., "AI / ML", "Languages", "Cloud / DevOps").
`;
  } else {
    templateInstructions = `
═══ TEMPLATE EXPECTATIONS (Architect) ═══
- Maintain a highly corporate, UK Staff-Level tone.
- Skill categories should be cleanly capitalized (e.g., "AI / ML", "Languages", "Cloud / DevOps").
`;
  }

  const hitlEntries = Object.entries(hitlContext)
    .filter(([_, text]) => text.trim().length > 0)
    .map(([skill, text]) => `- Skill: "${skill}"\n  User Context: "${text}"`)
    .join('\n\n');

  const hitlSection = hitlEntries.length > 0 ? `
═══ USER HITL CONTEXT (CRITICAL) ═══
The candidate was asked about missing skills and provided the following context. You MUST integrate this experience into their CV. 
- If the user context refers to an existing role/project, add or modify a bullet point there.
- If the user context refers to a completely new project or role not currently on the CV, you MUST create a new entry for it in the "Key Projects" or "Experience" section.
- If the context is brief, ensure the skill is heavily highlighted in the Professional Summary and Core Skills.

User Context:
${hitlEntries}
` : '';

  // Approved profile items. Their text comes from the user's own stored profile,
  // so unlike the free-text HITL context this is verified content — but the
  // model must still not embellish it into claims the profile does not make.
  const profileBridgeSection = approvedProfileItems.length > 0 ? `
═══ APPROVED PROFILE ITEMS (CRITICAL — must appear in the CV) ═══
The candidate reviewed their full profile against this job and approved bringing
the following items into this CV. Each one is verified profile data, not a claim
to be checked. You MUST include every one of them:

${approvedProfileItems
  .map((item, i) => `${i + 1}. [${item.kind}] ${item.label}\n   Detail: ${item.detail || '(none recorded)'}`)
  .join('\n')}

Rules:
- Place each item in the section matching its type (project → Key Projects,
  experience → Experience, education → Education, skill → Core Skills,
  certification → Certifications).
- Where an approved item covers the same ground as a weaker entry already on the
  CV, lead with the approved item and shorten or drop the weaker one.
- Rewrite the wording for impact and JD alignment, but do NOT add achievements,
  metrics, tools or dates that the profile detail above does not support.
` : '';

  const atsSection = atsOptimizationData ? `
═══ ATS COMPOSITE OPTIMIZATION ═══
The candidate opted-in to the Composite ATS Optimization. You MUST aggressively optimize the CV to score 95+ on standard ATS scanners.
Follow these RULES absolutely:
1. **Quantified Impact (CRITICAL)**: You MUST include numbers/metrics in at least 8 bullet points. Use patterns like "increased by X%", "reduced by X%", "X+ users", "£X million", or "Xx performance". If the original CV lacks metrics, infer conservative, plausible metrics (e.g., "improved efficiency by 20%") to ensure the ATS triggers a high impact score.
2. **Action Verbs**: Start EVERY bullet point with a strong, high-tier action verb (e.g., Architected, Orchestrated, Spearheaded, Engineered).
3. **Keyword Density**: Organically weave in generic UK Tech Market engineering practices (e.g., CI/CD, Agile, TDD, Microservices, Testing, Docker, System Design) to maximize keyword coverage. ONLY inject specific languages/frameworks (like React, AWS, Node.js) IF they are explicitly requested in the Job Description or present in the original CV. Do NOT hallucinate an irrelevant tech stack just for points.
4. **Professional Summary**: Must be between 30 and 60 words. Include a number/metric, and target keywords. DO NOT use clichés like "passionate", "team player", "synergy", or "results-driven".
5. **No Clichés**: Remove any fluffy corporate jargon. Replace them with hard technical facts.
` : '';

  // The full stored job-match blob is ~1,600 tokens, and most of it is either
  // useless to a rewriter or already spelled out above. `cv_build_spec` is
  // rendered field-by-field in buildSpecSection, `mandatorySkills` has its own
  // section, and `scoringBreakdown` is post-hoc audit detail explaining how the
  // score was reached — none of it should be paid for twice.
  const slimFeedback = {
    domainFit: feedbackData?.domainFit,
    experienceGap: feedbackData?.experienceGap,
    desirableSkills: feedbackData?.desirableSkills,
    eligibilityFlags: feedbackData?.eligibilityFlags,
  };

  const prompt = `You are an expert UK Staff-Level Technical Recruiter and ATS Optimization Specialist.
Your task is to completely rewrite the provided candidate's CV into a highly structured JSON format that perfectly matches a specific target Job Description.

${buildSpecSection}

${templateInstructions}

${atsSection}

${profileBridgeSection}

${hitlSection}

═══ MANDATORY MISSING SKILLS (do NOT fabricate these) ═══
${mandatorySkills.missing?.join(', ') || 'None'}

═══ PARTIAL SKILLS (reframe honestly, do not overstate) ═══  
${mandatorySkills.partial?.join(', ') || 'None'}

═══ MATCH CONTEXT ═══
${JSON.stringify(slimFeedback, null, 0)}

Raw Candidate CV:
"""
${originalCvText}
"""

Target Job Description:
"""
${jobDescription}
"""

INSTRUCTIONS:
1. Extract and map the data exactly to the JSON schema below.
2. Rewrite the Professional Summary to be highly targeted (2-4 sentences) and impactful, addressing the core needs of the JD.
3. For Key Projects and Experience, REWRITE the bullets using the STAR method (Situation, Task, Action, Result). Quantify everything possible.
4. Inject keywords from the Job Description naturally into the bullet points.
5. If the feedback indicates missing mandatory skills that the candidate actually possesses (or can be reasonably inferred from their domain), ensure they are explicitly highlighted.
6. The "label" for achievements should be a 1-3 word keyword (e.g. "Scalability", "API Design", "Team Leadership").
7. Ensure ATS compliance: No fluff, extremely professional tone.

Return ONLY a valid JSON object matching the schema below. Do not include markdown wraps (like \`\`\`json) or extra text outside the JSON block.

Schema:
{
  "fullName": "string",
  "tagline": "string - e.g. Senior Software Engineer · Cloud Architecture · 10+ Yrs",
  "contact": {
    "email": "string",
    "phone": "string",
    "location": "string",
    "website": "string (optional)",
    "linkedin": "string (optional)",
    "github": "string (optional)",
    "visaStatus": "string (optional)"
  },
  "professionalSummary": "string - 2 to 4 impactful sentences tailored to the JD",
  "education": [
    {
      "degree": "string",
      "university": "string",
      "startDate": "string (e.g. Sep 2018)",
      "endDate": "string (e.g. May 2022)",
      "grade": "string (e.g. First Class Honours)",
      "description": "string"
    }
  ],
  "projects": [
    {
      "name": "string",
      "stack": "string (e.g. React · Node.js · AWS)",
      "startDate": "string",
      "endDate": "string",
      "achievements": [
        {
          "label": "string (1-3 words)",
          "body": "string (STAR format bullet)"
        }
      ]
    }
  ],
  "experience": [
    {
      "jobTitle": "string",
      "company": "string",
      "location": "string",
      "type": "string (e.g. Full-time, Contract)",
      "startDate": "string",
      "endDate": "string",
      "achievements": [
        {
          "label": "string (1-3 words)",
          "body": "string (STAR format bullet)"
        }
      ]
    }
  ],
  "coreSkills": [
    {
      "category": "string (e.g. Backend, Cloud, Languages)",
      "skills": "string (e.g. Node.js, Python, Go)"
    }
  ],
  "certifications": [
    {
      "name": "string",
      "issuer": "string",
      "year": "string"
    }
  ]
}`;

  return generateJSONFromAI<RewrittenCVData>({
    prompt,
    temperature: 0.2,
    thinkingBudget: THINKING_BUDGETS.rewrite,
  });
}
