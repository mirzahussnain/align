import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const mocks = vi.hoisted(() => ({
  geminiGenerate: vi.fn(),
  groqCreate: vi.fn(),
  telemetryCreate: vi.fn(),
}));

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { generateContent: mocks.geminiGenerate };
  },
}));

vi.mock('groq-sdk', () => ({
  default: class {
    chat = { completions: { create: mocks.groqCreate } };
  },
}));

vi.mock('@/shared/lib/prisma', () => ({
  prisma: { aiUsageEvent: { create: mocks.telemetryCreate } },
}));

async function loadOrchestrator() {
  vi.resetModules();
  return import('@/shared/services/ai-orchestrator');
}

describe('AI orchestrator attempt telemetry', () => {
  beforeEach(() => {
    mocks.geminiGenerate.mockReset();
    mocks.groqCreate.mockReset();
    mocks.telemetryCreate.mockReset().mockResolvedValue({ id: 'usage-1' });
    vi.stubEnv('GEMINI_API_KEY', 'gemini-key');
    vi.stubEnv('GROQ_API_KEY', '');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('records Gemini primary success with provider token usage, pricing, and latency', async () => {
    vi.useFakeTimers();
    mocks.geminiGenerate.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 25));
      return {
        text: '{"ok":true}',
        usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50, thoughtsTokenCount: 10 },
      };
    });
    const { generateJSONFromAIWithProvenance } = await loadOrchestrator();

    const pending = generateJSONFromAIWithProvenance<{ ok: boolean }>({
      capability: 'job_match_analysis',
      prompt: 'return json',
    });
    await vi.advanceTimersByTimeAsync(25);
    const result = await pending;

    expect(result).toEqual({
      data: { ok: true },
      provenance: { provider: 'gemini', model: 'gemini-3.8-flash', attempt: 1, fallbackUsed: false },
      requestDiagnostics: {
        estimatedInputTokens: 3,
        maxCompletionTokens: 8_192,
        estimatedRequestTokens: 8_195,
        safeRequestTokens: 32_768,
        safetyMarginTokens: 512,
        allowed: true,
      },
    });
    expect(mocks.telemetryCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        capability: 'job_match_analysis',
        provider: 'gemini',
        model: 'gemini-3.8-flash',
        inputTokens: 100,
        outputTokens: 60,
        latencyMs: 25,
        success: true,
        errorCode: null,
        fallbackUsed: false,
        attemptNumber: 1,
        estimatedCostUsd: 0.00069,
      }),
    });
  });

  it('records a failed Gemini attempt and successful Groq fallback with correct numbering', async () => {
    vi.stubEnv('GROQ_API_KEY', 'groq-key');
    mocks.geminiGenerate.mockRejectedValue(new Error('provider details must not be persisted'));
    mocks.groqCreate.mockResolvedValue({
      choices: [{ message: { content: '{"ok":true}' } }],
      usage: { prompt_tokens: 80, completion_tokens: 20, total_tokens: 100 },
    });
    const { generateJSONFromAIWithProvenance } = await loadOrchestrator();

    const result = await generateJSONFromAIWithProvenance<{ ok: boolean }>({
      capability: 'cv_regeneration',
      prompt: 'return json',
    });

    expect(result?.provenance).toEqual({
      provider: 'groq',
      model: 'openai/gpt-oss-120b',
      attempt: 2,
      fallbackUsed: true,
    });
    expect(mocks.geminiGenerate).toHaveBeenCalledTimes(1);
    expect(mocks.groqCreate).toHaveBeenCalledTimes(1);
    expect(mocks.telemetryCreate).toHaveBeenCalledTimes(2);
    expect(mocks.telemetryCreate.mock.calls.map(([value]) => value.data)).toEqual([
      expect.objectContaining({
        provider: 'gemini',
        success: false,
        errorCode: 'PROVIDER_ERROR',
        fallbackUsed: false,
        attemptNumber: 1,
        inputTokens: null,
        outputTokens: null,
        estimatedCostUsd: null,
      }),
      expect.objectContaining({
        provider: 'groq',
        success: true,
        errorCode: null,
        fallbackUsed: true,
        attemptNumber: 2,
        inputTokens: 80,
        outputTokens: 20,
        estimatedCostUsd: 0.000024,
      }),
    ]);
  });

  it('translates one structured-output contract for Gemini and strict Groq fallback', async () => {
    vi.stubEnv('GROQ_API_KEY', 'groq-key');
    mocks.geminiGenerate.mockRejectedValue(Object.assign(new Error('busy'), { status: 503 }));
    mocks.groqCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ certifications: [] }) } }],
      usage: { prompt_tokens: 8, completion_tokens: 4, total_tokens: 12 },
    });
    const { generateJSONFromAIWithProvenance } = await loadOrchestrator();
    const jsonSchema = {
      type: 'object',
      properties: { certifications: { type: 'array', items: { type: 'string' } } },
      required: ['certifications'],
      additionalProperties: false,
    };

    const result = await generateJSONFromAIWithProvenance({
      capability: 'cv_regeneration',
      prompt: 'return json',
      structuredOutput: {
        name: 'structured_cv_rewrite',
        runtimeSchema: z.object({ certifications: z.array(z.string()) }),
        jsonSchema,
      },
    });

    expect(result?.data).toEqual({ certifications: [] });
    expect(mocks.geminiGenerate).toHaveBeenCalledWith(expect.objectContaining({
      config: expect.objectContaining({
        responseMimeType: 'application/json',
        responseJsonSchema: jsonSchema,
      }),
    }));
    expect(mocks.groqCreate).toHaveBeenCalledWith(expect.objectContaining({
      reasoning_effort: 'low',
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'structured_cv_rewrite',
          strict: true,
          schema: jsonSchema,
        },
      },
    }), expect.anything());
  });

  it('serializes and preflights each attempt with its model-specific completion cap', async () => {
    vi.stubEnv('GROQ_API_KEY', 'groq-key');
    mocks.geminiGenerate.mockRejectedValue(Object.assign(new Error('busy'), { status: 503 }));
    mocks.groqCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ ok: true }) } }],
      usage: { prompt_tokens: 25, completion_tokens: 10, total_tokens: 35 },
    });
    const serializePrompt = vi.fn(({ provider }: { provider: string }) => `${provider} prompt`);
    const { generateJSONFromAIWithProvenance } = await loadOrchestrator();

    const result = await generateJSONFromAIWithProvenance<{ ok: boolean }>({
      capability: 'cv_regeneration',
      serializePrompt,
    });

    expect(serializePrompt.mock.calls.map(([attempt]) => attempt.provider)).toEqual([
      'gemini',
      'groq',
    ]);
    expect(mocks.geminiGenerate).toHaveBeenCalledWith(
      expect.objectContaining({ contents: 'gemini prompt' })
    );
    expect(mocks.groqCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [{ role: 'user', content: 'groq prompt' }],
        max_tokens: 3_500,
      }),
      expect.anything()
    );
    expect(result?.requestDiagnostics).toEqual({
      estimatedInputTokens: 3,
      maxCompletionTokens: 3_500,
      estimatedRequestTokens: 3_503,
      safeRequestTokens: 8_000,
      safetyMarginTokens: 512,
      allowed: true,
    });
  });

  it('skips a known-over-budget attempt before invoking the provider SDK', async () => {
    vi.stubEnv('GEMINI_API_KEY', '');
    vi.stubEnv('GROQ_API_KEY', 'groq-key');
    const { generateJSONFromAIWithProvenance } = await loadOrchestrator();

    await expect(generateJSONFromAIWithProvenance({
      capability: 'cv_regeneration',
      serializePrompt: () => 'x'.repeat(15_953),
    })).resolves.toBeNull();

    expect(mocks.groqCreate).not.toHaveBeenCalled();
    expect(mocks.telemetryCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        errorCode: 'PAYLOAD_BUDGET_EXCEEDED',
        estimatedInputTokens: 3_989,
        maxOutputTokens: 3_500,
        estimatedRequestTokens: 7_489,
        requestBudgetTokens: 8_000,
        safetyMarginTokens: 512,
      }),
    });
  });

  it.each([
    [413, 'PROVIDER_PAYLOAD_TOO_LARGE'],
    [429, 'PROVIDER_RATE_LIMITED'],
    [503, 'PROVIDER_UNAVAILABLE'],
    [undefined, 'PROVIDER_ERROR'],
  ] as const)('classifies provider status %s as %s', async (status, expectedCode) => {
    const error = Object.assign(new Error('sensitive provider detail'),
      status === undefined ? {} : { status }
    );
    mocks.geminiGenerate.mockRejectedValue(error);
    const { generateJSONFromAI } = await loadOrchestrator();

    await expect(generateJSONFromAI({
      capability: 'cv_regeneration',
      prompt: 'return json',
    })).resolves.toBeNull();

    const data = mocks.telemetryCreate.mock.calls[0][0].data;
    expect(data.errorCode).toBe(expectedCode);
    expect(JSON.stringify(data)).not.toContain('sensitive provider detail');
  });

  it.each([
    'ai_enhanced_ats_analysis',
    'job_match_analysis',
    'cv_regeneration',
  ] as const)('preserves Gemini-to-Groq fallback for %s', async (capability) => {
    vi.stubEnv('GROQ_API_KEY', 'groq-key');
    mocks.geminiGenerate.mockRejectedValue(new Error('unavailable'));
    mocks.groqCreate.mockResolvedValue({
      choices: [{ message: { content: '{"ok":true}' } }],
      usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 },
    });
    const { generateJSONFromAIWithProvenance } = await loadOrchestrator();

    const result = await generateJSONFromAIWithProvenance<{ ok: boolean }>({
      capability,
      prompt: 'return json',
    });

    expect(result?.data).toEqual({ ok: true });
    expect(result?.provenance).toMatchObject({ provider: 'groq', attempt: 2, fallbackUsed: true });
    expect(mocks.groqCreate.mock.calls[0][0].reasoning_effort).toBe(
      capability === 'cv_regeneration' ? 'low' : undefined
    );
    expect(mocks.telemetryCreate).toHaveBeenCalledTimes(2);
  });

  it('categorizes invalid JSON before falling back', async () => {
    vi.stubEnv('GROQ_API_KEY', 'groq-key');
    mocks.geminiGenerate.mockResolvedValue({ text: 'not json' });
    mocks.groqCreate.mockResolvedValue({
      choices: [{ message: { content: '{"ok":true}' } }],
      usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 },
    });
    const { generateJSONFromAI } = await loadOrchestrator();

    await expect(generateJSONFromAI({
      capability: 'job_match_analysis',
      prompt: 'return json',
    })).resolves.toEqual({ ok: true });

    expect(mocks.telemetryCreate.mock.calls[0][0].data.errorCode).toBe('INVALID_JSON');
  });

  it('categorizes schema-invalid JSON before falling back', async () => {
    vi.stubEnv('GROQ_API_KEY', 'groq-key');
    mocks.geminiGenerate.mockResolvedValue({ text: '{"ok":"wrong"}' });
    mocks.groqCreate.mockResolvedValue({
      choices: [{ message: { content: '{"ok":true}' } }],
      usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 },
    });
    const { generateJSONFromAI } = await loadOrchestrator();

    await expect(generateJSONFromAI({
      capability: 'job_match_analysis',
      prompt: 'return json',
      schema: z.object({ ok: z.boolean() }),
    })).resolves.toEqual({ ok: true });

    expect(mocks.telemetryCreate.mock.calls[0][0].data.errorCode).toBe(
      'SCHEMA_VALIDATION_FAILED'
    );
  });

  it('stores null tokens and cost when the provider omits usage', async () => {
    mocks.geminiGenerate.mockResolvedValue({ text: '{"ok":true}' });
    const { generateJSONFromAI } = await loadOrchestrator();

    await expect(
      generateJSONFromAI<{ ok: boolean }>({
        capability: 'profile_reconciliation',
        prompt: 'return json',
      })
    ).resolves.toEqual({ ok: true });

    expect(mocks.telemetryCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        inputTokens: null,
        outputTokens: null,
        estimatedCostUsd: null,
      }),
    });
  });

  it('uses stable timeout and provider error categories without persisting raw errors', async () => {
    vi.useFakeTimers();
    mocks.geminiGenerate.mockImplementation(
      ({ config }: { config: { abortSignal: AbortSignal } }) =>
        new Promise((_resolve, reject) => {
          config.abortSignal.addEventListener('abort', () => reject(new Error('secret timeout detail')));
        })
    );
    const { generateJSONFromAI } = await loadOrchestrator();

    const pending = generateJSONFromAI({
      capability: 'ai_enhanced_ats_analysis',
      prompt: 'return json',
      timeoutMs: 10,
    });
    await vi.advanceTimersByTimeAsync(10);
    await expect(pending).resolves.toBeNull();

    const data = mocks.telemetryCreate.mock.calls[0][0].data;
    expect(data).toMatchObject({ success: false, errorCode: 'TIMEOUT', latencyMs: 10 });
    expect(JSON.stringify(data)).not.toContain('secret timeout detail');
  });

  it('does not let a stalled telemetry database block a successful AI result', async () => {
    mocks.geminiGenerate.mockResolvedValue({ text: '{"ok":true}' });
    mocks.telemetryCreate.mockImplementation(() => new Promise(() => undefined));
    const { generateJSONFromAI } = await loadOrchestrator();

    const outcome = await Promise.race([
      generateJSONFromAI<{ ok: boolean }>({
        capability: 'job_match_analysis',
        prompt: 'return json',
      }).then((result) => ({ kind: 'result' as const, result })),
      new Promise<{ kind: 'blocked' }>((resolve) =>
        setTimeout(() => resolve({ kind: 'blocked' }), 25)
      ),
    ]);

    expect(outcome).toEqual({ kind: 'result', result: { ok: true } });
  });

  it('does not let a telemetry database failure alter a successful AI result', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    mocks.geminiGenerate.mockResolvedValue({
      text: '{"ok":true}',
      usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 },
    });
    mocks.telemetryCreate.mockRejectedValue(new Error('database unavailable'));
    const { generateJSONFromAI } = await loadOrchestrator();

    await expect(
      generateJSONFromAI<{ ok: boolean }>({
        capability: 'cv_import_reconciliation',
        prompt: 'return json',
      })
    ).resolves.toEqual({ ok: true });
  });
});
