import { beforeEach, describe, expect, it, vi } from 'vitest';

const create = vi.hoisted(() => vi.fn());

vi.mock('@/shared/lib/prisma', () => ({
  prisma: { aiUsageEvent: { create } },
}));

import {
  recordAiUsageAttempt,
  safeAiUsagePersistenceDiagnostic,
} from '@/shared/services/ai-usage-telemetry';

describe('AI usage telemetry persistence diagnostics', () => {
  beforeEach(() => {
    create.mockReset();
  });

  it('whitelists Prisma code, class, model, and affected fields only', () => {
    const error = Object.assign(new Error('secret prompt and database detail'), {
      name: 'PrismaClientKnownRequestError',
      code: 'P2002',
      meta: {
        modelName: 'AiUsageEvent',
        target: ['operationId', 'providerAttemptNumber'],
        cause: 'secret response content',
      },
    });

    const diagnostic = safeAiUsagePersistenceDiagnostic(error);

    expect(diagnostic).toEqual({
      errorClass: 'PrismaClientKnownRequestError',
      prismaCode: 'P2002',
      model: 'AiUsageEvent',
      fields: ['operationId', 'providerAttemptNumber'],
    });
    expect(JSON.stringify(diagnostic)).not.toMatch(/secret|prompt|response|database detail/i);
  });

  it('logs no raw error message or telemetry payload when persistence fails', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    create.mockRejectedValue(
      Object.assign(new Error('secret CV JD provider response'), {
        name: 'PrismaClientKnownRequestError',
        code: 'P2022',
        meta: { field_name: 'actualTotalTokens', cause: 'raw database body' },
      })
    );

    await recordAiUsageAttempt({
      operationId: 'secret-operation-value',
      capability: 'job_match_analysis',
      provider: 'groq',
      model: 'openai/gpt-oss-120b',
      inputTokens: null,
      outputTokens: null,
      actualTotalTokens: null,
      latencyMs: 10,
      success: false,
      errorCode: 'SCHEMA_VALIDATION_FAILED',
      fallbackUsed: true,
      attemptNumber: 2,
    });

    expect(warning).toHaveBeenCalledWith(
      '[ai-usage-telemetry] Failed to persist AI usage event.',
      {
        errorClass: 'PrismaClientKnownRequestError',
        prismaCode: 'P2022',
        model: 'AiUsageEvent',
        fields: ['actualTotalTokens'],
      }
    );
    expect(JSON.stringify(warning.mock.calls)).not.toMatch(
      /secret CV|secret-operation-value|provider response|raw database body/i
    );
  });
});
