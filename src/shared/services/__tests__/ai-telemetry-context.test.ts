import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  generate: vi.fn(),
  serializeRewriteContext: vi.fn((input: { correctionNotes?: string[] }) =>
    input.correctionNotes?.join('|') ?? 'first attempt'
  ),
}));

vi.mock('../ai-orchestrator', () => ({
  generateJSONFromAI: mocks.generate,
  generateJSONFromAIWithProvenance: mocks.generate,
}));
vi.mock('../prompt-composer', () => ({
  composeSemanticPrompt: vi.fn(() => 'semantic prompt'),
  composeJobMatchPrompt: vi.fn(() => 'job match prompt'),
}));
vi.mock('../cv-rewrite-serializer', () => ({
  serializeCanonicalRewriteContext: mocks.serializeRewriteContext,
}));

import { getSemanticCVFeedbackWithProvenance } from '../ai-analyser';
import { rewriteCVWithProvenance } from '../cv-rewriter';
import { makeStructuredRewriteOutput } from './fixtures/structured-rewrite';

describe('AI telemetry context', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.generate.mockResolvedValue(null);
  });

  it('threads the user and operation identifiers through ATS provider attempts', async () => {
    await (getSemanticCVFeedbackWithProvenance as CallableFunction)(
      'CV text', {}, {}, {}, { userId: 'user-1', operationId: 'operation-1' }
    );

    expect(mocks.generate).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', operationId: 'operation-1' })
    );
  });

  it('threads the user and operation identifiers through CV regeneration attempts', async () => {
    await (rewriteCVWithProvenance as CallableFunction)(
      {}, { userId: 'user-2', operationId: 'operation-2' }
    );

    expect(mocks.generate).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-2', operationId: 'operation-2' })
    );
  });

  it('supplies a strict response schema so malformed Gemini JSON can fall through', async () => {
    await (rewriteCVWithProvenance as CallableFunction)({});
    const options = mocks.generate.mock.calls[0][0];
    const valid = makeStructuredRewriteOutput();

    expect(options.structuredOutput).toBeDefined();
    expect(options.structuredOutput.runtimeSchema.safeParse(valid).success).toBe(true);
    expect(options.structuredOutput.runtimeSchema.safeParse({ ...valid, certifications: {} }).success).toBe(false);
    expect(options.structuredOutput.jsonSchema).toMatchObject({
      type: 'object',
      properties: { certifications: { type: 'array' } },
      required: expect.arrayContaining(['certifications']),
      additionalProperties: false,
    });
    const identitySchema = options.structuredOutput.jsonSchema.properties.identity;
    expect(identitySchema).toMatchObject({
      required: expect.arrayContaining([
        'name', 'professionalTitle', 'location', 'contact', 'contactRefs', 'sourceRefs',
      ]),
      additionalProperties: false,
    });
    const nameSchema = identitySchema.properties.name;
    const resolvedNameSchema = nameSchema.$ref
      ? options.structuredOutput.jsonSchema.$defs[nameSchema.$ref.split('/').at(-1)]
      : nameSchema;
    expect(JSON.stringify(resolvedNameSchema)).toContain('null');
  });

  it('reserializes the live rewrite input for every provider or correction attempt', async () => {
    const input = { correctionNotes: undefined } as { correctionNotes?: string[] };
    await (rewriteCVWithProvenance as CallableFunction)(input);
    const options = mocks.generate.mock.calls[0][0];
    const attempt = {
      provider: 'groq', model: 'openai/gpt-oss-120b', attempt: 2,
      fallbackUsed: true,
      requestBudget: { maxCompletionTokens: 3_500, safeRequestTokens: 8_000, safetyMarginTokens: 512 },
    };

    const first = options.serializePrompt(attempt);
    input.correctionNotes = ['Remove unsupported metric.'];
    const corrected = options.serializePrompt(attempt);

    expect(mocks.serializeRewriteContext).toHaveBeenCalledTimes(2);
    expect(first).toBe('first attempt');
    expect(corrected).toBe('Remove unsupported metric.');
  });
});
