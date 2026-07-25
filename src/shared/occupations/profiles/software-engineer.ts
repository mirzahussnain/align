import type { OccupationProfile } from '../types';

export const softwareEngineerProfile: OccupationProfile = {
  id: 'software_engineer',
  version: '1.2.0',
  label: 'Software Engineering',
  sector: 'tech',
  roleArchetype: 'technical_specialist',
  applicationWorkflow: 'cv_led',
  primaryArtifact: 'cv',
  secondaryArtifacts: [],
  regulated: false,

  persona:
    'a UK technical recruiter experienced in hiring software engineers across product companies, agencies, and contract roles',

  sections: {
    rules: [
      { section: 'professional-summary', presence: 'expected' },
      { section: 'core-skills', presence: 'required' },
      { section: 'professional-experience', presence: 'required' },
      { section: 'key-projects', presence: 'expected', note: 'Projects carry the most weight for early-career engineers.' },
      { section: 'education', presence: 'expected' },
      { section: 'certifications', presence: 'optional' },
    ],
    orderConstraints: [
      {
        before: 'core-skills',
        after: 'professional-experience',
        severity: 'suggestion',
        reason: 'A skills snapshot before experience helps recruiters and ATS scans map you to the stack quickly.',
      },
      {
        before: 'professional-experience',
        after: 'education',
        severity: 'warning',
        reason: 'Commercial experience outweighs education once you have any.',
        appliesWhen: c => c.seniority !== 'entry',
      },
      {
        before: 'key-projects',
        after: 'education',
        severity: 'suggestion',
        reason: 'For early-career engineers, projects are stronger evidence than modules.',
        appliesWhen: c => c.seniority === 'entry',
      },
    ],
  },

  evidencePriorities: [
    'shipped production systems and their scale',
    'specific languages, frameworks, and infrastructure used per role',
    'testing practice (unit, integration, end-to-end)',
    'performance, reliability, or cost outcomes',
    'code review, CI/CD, and collaborative engineering practice',
    'open-source or personal projects with real usage',
  ],

  credentialRelevance: 'not_material',
  credentials: [
    {
      id: 'cloud-cert',
      label: 'Cloud certification (AWS/Azure/GCP)',
      class: 'desirable',
      patterns: [/\bAWS Certified\b/i, /\bAzure (?:Fundamentals|Administrator|Developer)\b/i, /\bGoogle Cloud Certified\b/i],
      missingMessage: 'A cloud certification can help for platform-heavy roles, but production experience matters more.',
    },
  ],

  impactPatterns: [
    /\d+%/,
    /\d+x\b/i,
    /£[\d,]+/,
    /\$[\d,]+/,
    // Allow up to three words between the number and its noun —
    // "2,000+ monthly active users", "120+ GitHub stars".
    /\d[\d,]*\+?\s*(?:\w+\s+){0,3}(?:users?|customers?|requests?|deployments?|stars?|venues?|contributors?)/i,
    /(?:reduced|increased|improved|cut|saved)\s+(?:\w+\s+){0,3}(?:by\s+)?\d/i,
    /\d+\s*(?:ms|seconds?)\b/i,
    /\d+%?\s*(?:coverage|uptime)/i,
  ],
  impactGuidance:
    'Strong bullets pair a specific technical action with its stack and a measurable outcome: latency, scale, reliability, delivery speed, revenue, or coverage. STAR-style phrasing works well here.',

  prohibitedExpectations: [
    'Do not expect professional licences or regulated registrations.',
    'Do not penalise the absence of formal certifications — production experience is the primary evidence.',
  ],

  summaryGuidance:
    'Three lines: role and years, core stack, and one concrete shipped outcome. Name the target role family explicitly.',

  detection: {
    titlePatterns: [
      /\b(?:software|frontend|front[- ]end|backend|back[- ]end|full[- ]?stack|web|mobile|platform|devops|cloud)\s+(?:engineer|developer)\b/i,
      /\bsoftware\s+developer\b/i,
      /\b(?:junior|senior|lead|staff|principal)\s+(?:engineer|developer)\b/i,
      /\bsite reliability engineer\b/i,
    ],
    // Cat 2 — defining engineering duties (building/shipping software), NOT the
    // languages, which are shared tools. "Built an API" defines the work;
    // "Python" does not.
    dutyPatterns: [
      /\b(?:built|build|shipp(?:ed|ing)?|deploy(?:ed|ing)?|refactor(?:ed|ing)?|implement(?:ed|ing)?|develop(?:ed|ing)?|maintain(?:ed|ing)?)\b.*\b(?:api|endpoint|service|micro-?service|component|pipeline|feature|codebase|app|application|platform|system|website)\b/i,
      /\b(?:pull requests?|code reviews?|unit tests?|end[- ]to[- ]end tests?|ci\/cd|continuous integration)\b/i,
      /\bfull[- ]?stack\b.*\b(?:app|application|platform|web|booking|system)\b/i,
    ],
    // Cat 3 — distinctive engineering outputs / deliverables.
    outputPatterns: [
      /\b(?:production|live)\b.*\b(?:app|application|service|website|platform|system)\b/i,
      /\bopen[- ]source\b/i,
      /\btest coverage\b|\b\d{1,3}%\s+coverage\b/i,
      /\bCI\b.*\bpipeline\b|\bpipeline\b.*\b(?:lint|tests?|deploy)/i,
    ],
    // Cat 7 — tools & methods: shared, low weight. Python/SQL alone cannot
    // decide software engineering versus analytical work.
    toolPatterns: [
      /\b(?:react|typescript|javascript|node\.?js|golang|\bgo\b|rust|c#|\.net|next\.?js|express|postgres(?:ql)?|prisma|docker|kubernetes|git(?:hub)?)\b/i,
      /\b(?:python|java|sql)\b/i,
    ],
    // Cat 8 — generic transferable skills; never decisive.
    genericSkillPatterns: [
      /\b(?:communication|teamwork|problem[- ]solving|collaborat(?:e|ion)|agile ceremon)/i,
    ],
    // Cat 9 — a clearly non-engineering role title on this CV counts against it.
    negativePatterns: [
      /\b(?:data|business|financial)\s+analyst\b/i,
      /\b(?:staff|registered|charge)\s+nurse\b/i,
      /\bwarehouse\s+operative\b/i,
      /\bhealthcare\s+assistant\b/i,
    ],
    sectorHint: 'tech',
  },
};
