/**
 * Deterministic prompt assembly for the ledger-native CV rewriter.
 *
 * Pure and side-effect free: the same input always yields the same string, so
 * the prompt-budget layer can measure it and the route can record an estimate
 * in provenance. The prompt only ever asks the model to restate evidence it was
 * given — every section is written so that inventing a claim is out of bounds.
 */
import type {
  CompactRewriteContext,
  LedgerNativeRewriteInput,
  RewriteRequirement,
} from '@/shared/types/cv-rewrite';
import type { ApprovedProfileEvidenceOverlay } from '@/shared/types/profile-reasoning';
import type { UserProvidedContext } from '@/shared/types/cv-rewrite';
import type { CvBuildSpec } from '@/shared/types/ai';
import type { TemplateId } from '@/shared/constants/templates';

/**
 * The non-negotiable truthfulness contract. This block is always first and is
 * never truncated by the budget layer — it is the thing that makes generation
 * safe. There is deliberately no language permitting inference, plausible
 * metrics, assumed proficiency, or upgraded seniority.
 */
const TRUTH_RULES = `═══ NON-NEGOTIABLE TRUTHFULNESS RULES (read first, apply everywhere) ═══
You are rewriting an existing CV for a specific job. You may sharpen wording,
reorder, and emphasise — but you may NEVER introduce a claim the source
material does not already support.

You must NEVER invent any of the following, in any section, for any reason:
- employment, employers, job titles, dates, or seniority
- projects, responsibilities, or achievements
- qualifications, certifications, licences, or professional registrations
- tools, technologies, or skills presented as possessed
- eligibility or work-authorisation claims
- metrics or numbers

Metrics may ONLY be: (a) copied verbatim from the source CV or approved
evidence, or (b) directly calculated from explicit figures already present in
that source. Do not estimate, infer, or "conservatively" add any number.

Do not convert transferable experience into direct experience. Saying
"experience coordinating time-sensitive requests" is fine; writing
"experienced in purchase ledger" is forbidden unless purchase-ledger evidence
already exists in the source.

If a requirement is not supported by the source CV or approved evidence, leave
it out. A shorter, fully truthful CV is the correct outcome — never pad it with
unverifiable claims to look more complete.`;

/** Per-status directive, spelled out so each requirement's licence is explicit. */
const STATUS_DIRECTIVES: Record<RewriteRequirement['status'], string> = {
  met: 'MET — evidenced already. You may strengthen clarity and emphasis using the existing evidence only. Do not add new facts.',
  partial:
    'PARTIAL — only partly evidenced. Improve the wording within the limits of the actual evidence. Do NOT upgrade it into a full/confident claim.',
  not_met:
    'NOT MET — no supporting evidence. MUST NOT be written as possessed. Do not imply it.',
  contradicted:
    'CONTRADICTED — the CV conflicts with this requirement. MUST NOT be claimed, and MUST NOT be softened into ambiguity.',
  unclear:
    'UNCLEAR — evidence is inconclusive. MUST NOT be treated as confirmed.',
};

function renderRequirement(requirement: RewriteRequirement): string {
  const importance = requirement.importance === 'mandatory' ? 'ESSENTIAL' : 'DESIRABLE';
  const lines = [
    `- [${importance}] "${requirement.text}" (${requirement.category})`,
    `  ${STATUS_DIRECTIVES[requirement.status]}`,
  ];
  if (requirement.cvEvidence.length > 0) {
    lines.push(`  CV evidence: ${requirement.cvEvidence.join(' | ')}`);
  }
  if (requirement.approvedProfileEvidence.length > 0) {
    lines.push(`  Approved profile evidence: ${requirement.approvedProfileEvidence.join(' | ')}`);
  }
  return lines.join('\n');
}

/**
 * Requirements are rendered in truth-priority order (essential first, then
 * contradicted/unclear, then partial, then the rest) so that if a downstream
 * reader ever truncates the string, the safety-critical items survive. The
 * budget layer never truncates this block, but the ordering is a belt-and-braces
 * guarantee.
 */
const STATUS_PRIORITY: Record<RewriteRequirement['status'], number> = {
  contradicted: 0,
  unclear: 1,
  met: 2,
  partial: 3,
  not_met: 4,
};

function renderLedger(context: CompactRewriteContext): string {
  const ordered = [...context.requirements].sort((a, b) => {
    if (a.importance !== b.importance) return a.importance === 'mandatory' ? -1 : 1;
    return STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status];
  });

  const requirementBlock = ordered.length
    ? ordered.map(renderRequirement).join('\n')
    : 'No requirements supplied.';

  const eligibilityBlock = context.eligibilityConstraints.length
    ? `\n\nELIGIBILITY / AVAILABILITY CONSTRAINTS (never assert these unless already evidenced):\n${context.eligibilityConstraints
        .map((c) => `- "${c.text}" — status: ${c.status}`)
        .join('\n')}`
    : '';

  const domainBlock = context.domainFit
    ? `\n\nDOMAIN FIT: ${context.domainFit.status}${
        context.domainFit.detail ? ` — ${context.domainFit.detail}` : ''
      }`
    : '';

  return `═══ COMPACT REQUIREMENT LEDGER ═══
Apply each requirement's status directive exactly.
${requirementBlock}${eligibilityBlock}${domainBlock}`;
}

function renderApprovedEvidence(evidence: ApprovedProfileEvidenceOverlay[]): string {
  if (evidence.length === 0) return '';
  return `\n═══ APPROVED PROFILE EVIDENCE (verified — you MUST include every item) ═══
The candidate reviewed their stored profile against this job and approved
bringing these items in. Each is verified profile data. Place each in the
section matching its type, rewrite for impact and JD alignment, but do NOT add
achievements, metrics, tools, or dates the evidence below does not support.

${evidence
  .map(
    (item, i) =>
      `${i + 1}. Requirement: ${item.requirementText}\n   Source: [${item.evidenceRef.type}] ${item.evidenceLocation}\n   Evidence: ${item.resolvedEvidenceText}`
  )
  .join('\n')}\n`;
}

function renderUserContext(context: UserProvidedContext[] | undefined): string {
  if (!context || context.length === 0) return '';
  return `\n═══ USER-PROVIDED CONTEXT (the candidate's own words) ═══
The candidate typed the notes below about specific requirements. Treat them as
the candidate's own explicit input — NOT as verified profile evidence, and NOT
as licence to invent surrounding detail. Integrate only what the note states.

${context.map((c) => `- ${c.label}: "${c.text}"`).join('\n')}\n`;
}

function renderBuildSpec(spec: CvBuildSpec): string {
  return `═══ CV BUILD SPECIFICATION (structure & emphasis only) ═══
The build specification describes structure, emphasis, and rewrite intent. It is
NOT a source of facts. Every claim, skill, credential, responsibility, and metric
must be supported by verified evidence supplied elsewhere in this prompt.

Recommended Template: ${spec.recommended_template}
Section Order: ${spec.section_order?.join(' → ') || 'summary → education → projects → experience → skills → certifications'}
Lead Project: ${spec.lead_project || 'Use the most relevant existing project for this JD'}
Summary Angle: ${spec.summary_angle || 'Highlight the candidate’s strongest existing fit for the JD'}
Skills to Surface (only where the CV already evidences them): ${spec.skills_to_surface?.join(', ') || 'None specified'}
Skills to Deprioritise: ${spec.skills_to_deprioritise?.join(', ') || 'None specified'}
Visa Note Required: ${spec.visa_note_required ?? false}
Bullets to Rewrite — the label and intent guide WHAT to emphasise; the suggested
phrasing must still be verified against the evidence above, and is not itself
evidence:
${
  spec.bullets_to_rewrite?.length
    ? spec.bullets_to_rewrite
        .map(
          (b, i) =>
            `${i + 1}. ${b.project_or_role}\n   Original Label: ${b.original_label}\n   New Label: ${b.new_label}\n   Suggested phrasing (verify): ${b.new_body}`
        )
        .join('\n')
    : 'None specified'
}`;
}

function renderTemplateExpectations(templateId: TemplateId): string {
  switch (templateId) {
    case 'technical_precision':
      return `═══ TEMPLATE EXPECTATIONS (Technical Precision) ═══
- Use lowercase skill categories (e.g. "ai/ml", "languages", "cloud/devops").
- Keep bullets dense and technical; cut filler. Reflect only real tools and scale.`;
    case 'academic_latex':
      return `═══ TEMPLATE EXPECTATIONS (Academic / LaTeX) ═══
- Format for a classic academic/research role with detailed Projects.
- Include any real research papers, thesis, or publications from the source.
- Keep skill categories traditional (e.g. "Programming & Tools", "Methods").`;
    case 'editorial_refined':
      return `═══ TEMPLATE EXPECTATIONS (Editorial Refined) ═══
- Warm, highly professional corporate tone.
- Skill categories cleanly capitalised (e.g. "AI / ML", "Languages").`;
    case 'architect':
    default:
      return `═══ TEMPLATE EXPECTATIONS (Architect) ═══
- Corporate, UK Staff-Level tone.
- Skill categories cleanly capitalised (e.g. "AI / ML", "Languages").`;
  }
}

/**
 * ATS emphasis, rewritten to be truth-preserving. It surfaces keywords the CV
 * ALREADY has and strips clichés — it never authorises inventing metrics or a
 * tech stack, which the previous version explicitly did.
 */
function renderAtsEmphasis(input: LedgerNativeRewriteInput): string {
  const ats = input.atsOptimizationData;
  if (!ats) return '';

  const present = ats.presentKeywords.length
    ? `\n- Surface these keywords the CV ALREADY contains, where they genuinely apply: ${ats.presentKeywords.join(', ')}.`
    : '';
  const cliches = ats.aiClichesToAvoid.length
    ? `\n- Remove these clichés if present: ${ats.aiClichesToAvoid.join(', ')}.`
    : '';
  const recs = ats.recommendations.length
    ? `\n- Formatting guidance from the analysis: ${ats.recommendations.join('; ')}.`
    : '';

  return `═══ ATS EMPHASIS (truth-preserving) ═══
Optimise structure and phrasing for ATS parsing WITHOUT adding any unverified
content. Specifically:
- Start bullets with strong action verbs (Architected, Led, Delivered).
- Keep the professional summary tight (30–60 words).
- Only include a metric if it already exists in the source; never invent one to
  raise an ATS score.${present}${cliches}${recs}`;
}

const OUTPUT_SCHEMA = `Return ONLY a valid JSON object matching this schema. No markdown fences, no prose.
{
  "fullName": "string",
  "tagline": "string — e.g. Senior Software Engineer · Cloud · 8+ yrs (only if supported)",
  "contact": {
    "email": "string",
    "phone": "string",
    "location": "string",
    "website": "string (optional)",
    "linkedin": "string (optional)",
    "github": "string (optional)",
    "visaStatus": "string (optional — only if evidenced)"
  },
  "professionalSummary": "string — 2 to 4 truthful sentences tailored to the JD",
  "education": [
    { "degree": "string", "university": "string", "startDate": "string", "endDate": "string", "grade": "string", "description": "string" }
  ],
  "projects": [
    { "name": "string", "stack": "string", "startDate": "string", "endDate": "string",
      "achievements": [ { "label": "string (1-3 words)", "body": "string" } ] }
  ],
  "experience": [
    { "jobTitle": "string", "company": "string", "location": "string", "type": "string",
      "startDate": "string", "endDate": "string",
      "achievements": [ { "label": "string (1-3 words)", "body": "string" } ] }
  ],
  "coreSkills": [ { "category": "string", "skills": "string" } ],
  "certifications": [ { "name": "string", "issuer": "string", "year": "string" } ]
}`;

/**
 * Assemble the full rewrite prompt in the fixed, truth-first order:
 * rules → CV → vacancy → ledger → approved evidence → user context →
 * build spec → template/ATS → output schema.
 */
export function composeRewritePrompt(input: LedgerNativeRewriteInput): string {
  return [
    'You are an expert UK technical recruiter rewriting a candidate CV into a structured JSON document tailored to one specific job. Truthfulness is the highest priority, above ATS score, above completeness.',
    TRUTH_RULES,
    `═══ SOURCE CV (the only factual ground truth about the candidate) ═══\n"""\n${input.cvText}\n"""`,
    `═══ TARGET VACANCY ═══\n"""\n${input.jobDescription}\n"""`,
    renderLedger(input.rewriteContext),
    renderApprovedEvidence(input.approvedProfileEvidence),
    renderUserContext(input.userContext),
    renderBuildSpec(input.rewriteContext.cvBuildSpec),
    renderTemplateExpectations(input.template),
    renderAtsEmphasis(input),
    OUTPUT_SCHEMA,
  ]
    .filter((section) => section.trim().length > 0)
    .join('\n\n');
}

/** Rough token estimate (≈4 chars/token) for budgeting and diagnostics. */
export function estimatePromptTokens(prompt: string): number {
  return Math.ceil(prompt.length / 4);
}
