import { describe, expect, it } from 'vitest';
import { buildRewriteInput } from '@/shared/services/cv-rewrite-context';
import { serializeCanonicalRewriteContext } from '@/shared/services/cv-rewrite-serializer';
import type { AiAttemptDescriptor } from '@/shared/services/ai-orchestrator';
import type { JobMatchDataV2, JobRequirementLedgerEntry } from '@/shared/types/ai';
import { GOLDEN_CV_FIXTURES } from '@/shared/stage4/fixtures';
import { composeRewritePrompt } from '@/shared/services/cv-rewrite-prompt';
import { STRUCTURED_CV_REWRITE_JSON_SCHEMA } from '@/shared/schemas/cv-rewrite-output';
import { preflightAiRequest } from '@/shared/services/ai-request-budget';

const FALLBACK_SCHEMA_TOKENS = Math.ceil(JSON.stringify(STRUCTURED_CV_REWRITE_JSON_SCHEMA).length / 4);

const FALLBACK_ATTEMPT = {
  provider: 'groq',
  model: 'openai/gpt-oss-120b',
  attempt: 2,
  fallbackUsed: true,
  requestBudget: {
    maxCompletionTokens: 3500,
    safeRequestTokens: 8000,
    safetyMarginTokens: 512,
  },
  requestOverheadTokens: FALLBACK_SCHEMA_TOKENS,
} as AiAttemptDescriptor & { requestOverheadTokens: number };

function requirement(id: string, text: string, evidenceText?: string): JobRequirementLedgerEntry {
  return {
    id,
    text,
    importance: 'mandatory',
    category: 'skill',
    sourceSection: 'job_description',
    evidenceRequired: true,
    status: evidenceText ? 'met' : 'not_met',
    evidence: evidenceText ? [{ source: 'cv', text: evidenceText }] : [],
    confidence: 0.9,
    deduction: { points: 0, reason: 'fixture', rubric: evidenceText ? 'met' : 'mandatory_core_missing' },
  };
}

function jobMatch(requirements: JobRequirementLedgerEntry[]): JobMatchDataV2 {
  return {
    schemaVersion: 2,
    requirements,
    domainFit: {
      roleDomain: 'Platform engineering', candidateDomain: 'Platform engineering',
      status: 'aligned', overlapAreas: ['distributed systems'], detail: 'Same domain',
      confidence: 0.9, deduction: { points: 0, reason: 'aligned' },
    },
    matchScore: 80,
    matchFeedback: 'Strong evidence-backed fit',
    experienceGap: '',
    tailoredRewrites: [],
    cv_build_spec: {
      recommended_template: 'architect', template_rationale: '', section_order: ['Experience', 'Projects'],
      lead_project: 'Payments platform', summary_angle: 'Platform reliability',
      skills_to_surface: ['Kafka'], skills_to_deprioritise: [], bullets_to_rewrite: [],
      visa_note_required: false, cover_letter_angle: '',
    },
  };
}

function build(args: {
  cvText?: string;
  jobDescription?: string;
  requirements?: JobRequirementLedgerEntry[];
  userContext?: { label: string; text: string }[];
  applicationEvidence?: { id: string; requirementId: string; context: { label: string; text: string } }[];
}) {
  return buildRewriteInput({
    jobMatch: jobMatch(args.requirements ?? [requirement('R1', 'Kafka experience')]),
    approvedProfileEvidence: [],
    userContext: args.userContext ?? [],
    cvText: args.cvText ?? 'Alex Example\nPlatform Engineer\nKafka operations.',
    jobDescription: args.jobDescription ?? 'Platform Engineer\nKafka experience',
    targetJob: { title: 'Platform Engineer', employer: 'Example Payments', location: 'London' },
    template: 'architect',
    applicationEvidence: args.applicationEvidence,
  }).input;
}

describe('canonical CV rewrite serialization', () => {
  it('keeps every Stage 4 fixture plus its native schema inside the fallback request budget', () => {
    const measurements = GOLDEN_CV_FIXTURES.map((fixture) => ({
      before: Math.ceil(composeRewritePrompt(fixture.generationInput).length / 4),
      after: Math.ceil(serializeCanonicalRewriteContext(fixture.generationInput, FALLBACK_ATTEMPT).length / 4),
      preflight: preflightAiRequest(
        serializeCanonicalRewriteContext(fixture.generationInput, FALLBACK_ATTEMPT),
        FALLBACK_ATTEMPT.requestBudget,
        STRUCTURED_CV_REWRITE_JSON_SCHEMA
      ),
    }));
    const before = measurements.map((item) => item.before).sort((a, b) => a - b);
    const after = measurements.map((item) => item.after).sort((a, b) => a - b);
    const metrics = {
      fixtureCount: measurements.length,
      before: { min: before[0], median: before[Math.floor(before.length / 2)], max: before.at(-1) },
      after: { min: after[0], median: after[Math.floor(after.length / 2)], max: after.at(-1) },
    };
    console.info(`[cv-rewrite-budget-benchmark] ${JSON.stringify(metrics)}`);

    expect(measurements).toHaveLength(28);
    expect(measurements.every((item) => item.preflight.allowed)).toBe(true);
    expect(Math.max(...after)).toBeLessThan(Math.max(...before));
  });

  it('stores shared evidence once and references it from multiple requirements', () => {
    const shared = 'Improved throughput from 853 req/s to 1870 req/s using Redis.';
    const input = build({
      cvText: `Alex Example\n${shared}`,
      requirements: [
        requirement('R1', 'Performance optimisation', shared),
        requirement('R2', 'Redis experience', shared),
      ],
    });

    const records = input.evidenceRegistry?.filter((item) => item.text === shared) ?? [];
    expect(records).toHaveLength(1);
    expect(records[0].requirementIds).toEqual(['R1', 'R2']);
    expect(input.rewriteContext.requirements.map((item) => item.evidenceIds)).toEqual([
      [records[0].id],
      [records[0].id],
    ]);

    const prompt = serializeCanonicalRewriteContext(input, FALLBACK_ATTEMPT);
    const requirementsBlock = prompt.split('REQUIREMENTS (authoritative status/mapping)\n')[1].split('\n\n')[0];
    const registry = prompt.split('EVIDENCE_REGISTRY (each record appears once)\n')[1].split('\n\n')[0];
    expect(registry.split(shared)).toHaveLength(2);
    expect(requirementsBlock).toContain('R1|mandatory|met|skill|');
    expect(requirementsBlock).toContain('R2|mandatory|met|skill|');
    expect(requirementsBlock.split('|evidence=' + records[0].id)).toHaveLength(3);
    expect(registry).toContain(records[0].id + '|source_cv|ledger=R1:0,R2:0|');
    expect(registry).not.toContain('requirements=');
  });

  it('keeps a captured production-shaped request within the unchanged fallback budget', () => {
    const requirements = Array.from({ length: 22 }, (_, index) => {
      const number = String(index + 1).padStart(2, '0');
      return requirement(
        `requirement-${number}`,
        `Production-shaped requirement ${number} with role wording`,
        index < 13 ? `Verified source evidence ${number} demonstrating a supported capability.` : undefined
      );
    });
    const evidence = requirements.flatMap((item) => item.evidence.map((entry) => entry.text));
    const cvPrefix = ['Candidate profile', ...evidence].join('\n');
    const cvText = `${cvPrefix}\n${'X'.repeat(4_808 - cvPrefix.length - 1)}`;
    const jobPrefix = ['Target role', ...requirements.map((item) => item.text)].join('\n');
    const jobDescription = `${jobPrefix}\n${'Y'.repeat(3_439 - jobPrefix.length - 1)}`;
    const input = build({
      cvText,
      jobDescription,
      requirements,
      userContext: [{
        label: 'Candidate clarification',
        text: 'Explicit supporting context supplied by the candidate. '.repeat(3).trim(),
      }],
    });

    const prompt = serializeCanonicalRewriteContext(input, FALLBACK_ATTEMPT);
    const preflight = preflightAiRequest(
      prompt,
      FALLBACK_ATTEMPT.requestBudget,
      STRUCTURED_CV_REWRITE_JSON_SCHEMA
    );

    expect(preflight).toMatchObject({
      allowed: true,
      maxCompletionTokens: 3_500,
      safeRequestTokens: 8_000,
      safetyMarginTokens: 512,
    });
    expect(preflight.estimatedInputTokens).toBe(3_939);
    expect(preflight.estimatedRequestTokens + preflight.safetyMarginTokens).toBe(7_951);
  });

  it('preserves the earliest role, latest role, exact dates, metric, and education in a long CV', () => {
    const filler = Array.from({ length: 700 }, (_, index) => `Responsibility ${index}: maintained service ${index}.`).join('\n');
    const cv = [
      'Alex Example | alex@example.com',
      'Earliest Employer | Junior Engineer | Jan 2008 - Mar 2010',
      filler,
      'Latest Employer | Principal Engineer | Apr 2021 - Present',
      'Improved throughput from 853 req/s to 1870 req/s.',
      'BSc Computer Science | Example University | 2004 - 2007',
    ].join('\n');
    const input = build({ cvText: cv });
    const prompt = serializeCanonicalRewriteContext(input, FALLBACK_ATTEMPT);

    expect(input.cvText).not.toContain('[truncated]');
    for (const fact of [
      'Earliest Employer', 'Jan 2008 - Mar 2010', 'Latest Employer', 'Apr 2021 - Present',
      '853 req/s to 1870 req/s', 'BSc Computer Science', 'Example University',
    ]) expect(prompt).toContain(fact);
  });

  it('serializes ID-bearing application evidence once and retains all job requirements', () => {
    const appText = 'Operated Kafka consumers for event processing.';
    const requirements = [
      requirement('R1', 'Kafka experience'),
      requirement('R2', 'Incident response'),
      requirement('R3', 'Capacity planning'),
    ];
    const input = build({
      requirements,
      jobDescription: `Platform Engineer\n${requirements.map((item) => item.text).join('\n')}\nOwn a regulated payments platform.`,
      applicationEvidence: [{
        id: 'context-17', requirementId: 'R1', context: { label: 'Kafka', text: appText },
      }],
    });
    const prompt = serializeCanonicalRewriteContext(input, FALLBACK_ATTEMPT);

    expect(prompt.split(appText)).toHaveLength(2);
    expect(prompt).toContain('application=context-17');
    for (const item of requirements) expect(prompt).toContain(item.text);
    expect(prompt).toContain('Own a regulated payments platform.');
    expect(prompt).toContain('Platform Engineer|Example Payments|London');
  });

  it('drops optional vacancy prose before canonical facts when the complete fallback request is tight', () => {
    const cvText = [
      'Alex Example | alex@example.com',
      'Earliest Employer | Junior Engineer | Jan 2008 - Mar 2010',
      'Latest Employer | Principal Engineer | Apr 2021 - Present',
      'Improved throughput from 853 req/s to 1870 req/s.',
      'BSc Computer Science | Example University | 2004 - 2007',
      'x'.repeat(4_400),
    ].join('\n');
    const optionalVacancyProse = `Company background ${'y'.repeat(5_000)}`;
    const requirements = Array.from({ length: 12 }, (_, index) =>
      requirement(`R${index + 1}`, `Requirement ${index + 1}`)
    );
    const input = build({
      cvText,
      requirements,
      jobDescription: [
        'Platform Engineer',
        ...requirements.map((item) => item.text),
        optionalVacancyProse,
      ].join('\n'),
    });

    const prompt = serializeCanonicalRewriteContext(input, FALLBACK_ATTEMPT);
    const preflight = preflightAiRequest(
      prompt,
      FALLBACK_ATTEMPT.requestBudget,
      STRUCTURED_CV_REWRITE_JSON_SCHEMA
    );

    expect(preflight.allowed).toBe(true);
    expect(prompt).not.toContain(optionalVacancyProse);
    expect(prompt).toContain('Earliest Employer');
    expect(prompt).toContain('Latest Employer');
    expect(prompt).toContain('BSc Computer Science');
    for (const item of requirements) expect(prompt).toContain(item.text);
  });
});
