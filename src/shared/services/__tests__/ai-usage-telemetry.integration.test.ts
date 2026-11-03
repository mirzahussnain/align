import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';

const databaseUrl = process.env.DATABASE_URL ?? '';
const isLocalDb = /@(localhost|127\.0\.0\.1|host\.docker\.internal)[:/]/.test(databaseUrl);
const { prisma } = isLocalDb
  ? await import('@/shared/lib/prisma')
  : { prisma: null as never };
const { recordAiUsageAttempt } = await import('../ai-usage-telemetry');

const operationPrefix = `test_ai_usage_${randomUUID()}`;

describe.skipIf(!isLocalDb)('AI usage telemetry — real PostgreSQL', () => {
  afterEach(async () => {
    await prisma.aiUsageEvent.deleteMany({
      where: { operationId: { startsWith: operationPrefix } },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('persists failure, retry, success, preflight skip, and nullable actual usage', async () => {
    const base = {
      capability: 'job_match_analysis' as const,
      model: 'telemetry-integration-model',
      inputTokens: null,
      outputTokens: null,
      latencyMs: 12,
      fallbackUsed: false,
      attemptNumber: 1,
      estimatedInputTokens: 3_898,
      maxOutputTokens: 3_500,
      estimatedRequestTokens: 7_398,
      requestBudgetTokens: 8_000,
      safetyMarginTokens: 512,
      requestHeadroomTokens: 90,
      requestOverflowTokens: 0,
    };

    await recordAiUsageAttempt({
      ...base,
      operationId: `${operationPrefix}_failed`,
      provider: 'gemini',
      success: false,
      errorCode: 'SERVICE_UNAVAILABLE',
      providerFailureReason: 'SERVICE_UNAVAILABLE',
      upstreamStatusCode: 503,
      providerAttemptNumber: 3,
      retryNumber: 2,
      outcome: 'TRANSIENT_FAILURE',
    });
    await recordAiUsageAttempt({
      ...base,
      operationId: `${operationPrefix}_retry`,
      provider: 'gemini',
      success: false,
      errorCode: 'SERVICE_UNAVAILABLE',
      providerFailureReason: 'SERVICE_UNAVAILABLE',
      upstreamStatusCode: 503,
      providerAttemptNumber: 2,
      retryNumber: 1,
      backoffMs: 500,
      outcome: 'TRANSIENT_FAILURE',
    });
    await recordAiUsageAttempt({
      ...base,
      operationId: `${operationPrefix}_success`,
      provider: 'groq',
      inputTokens: 3_850,
      outputTokens: 1_100,
      actualTotalTokens: 4_950,
      success: true,
      errorCode: null,
      providerCandidateNumber: 2,
      providerAttemptNumber: 1,
      outcome: 'SUCCESS',
    });
    await recordAiUsageAttempt({
      ...base,
      operationId: `${operationPrefix}_skip`,
      provider: 'groq',
      success: false,
      errorCode: 'PAYLOAD_BUDGET_EXCEEDED',
      providerFailureReason: 'PAYLOAD_BUDGET_EXCEEDED',
      providerAttemptNumber: 0,
      retryNumber: 0,
      outcome: 'SKIPPED',
      preflightOutcome: 'SKIPPED',
      requestHeadroomTokens: 0,
      requestOverflowTokens: 1,
    });
    await recordAiUsageAttempt({
      ...base,
      operationId: `${operationPrefix}_null_usage`,
      provider: 'gemini',
      actualTotalTokens: null,
      success: true,
      errorCode: null,
      outcome: 'SUCCESS',
    });

    const rows = await prisma.aiUsageEvent.findMany({
      where: { operationId: { startsWith: operationPrefix } },
      orderBy: { operationId: 'asc' },
    });

    expect(rows).toHaveLength(5);
    expect(rows.find((row) => row.operationId?.endsWith('_failed'))).toMatchObject({
      providerFailureReason: 'SERVICE_UNAVAILABLE',
      upstreamStatusCode: 503,
      providerAttemptNumber: 3,
      retryNumber: 2,
      outcome: 'TRANSIENT_FAILURE',
    });
    expect(rows.find((row) => row.operationId?.endsWith('_retry'))).toMatchObject({
      retryNumber: 1,
      backoffMs: 500,
    });
    expect(rows.find((row) => row.operationId?.endsWith('_success'))).toMatchObject({
      success: true,
      inputTokens: 3_850,
      outputTokens: 1_100,
      actualTotalTokens: 4_950,
      outcome: 'SUCCESS',
    });
    expect(rows.find((row) => row.operationId?.endsWith('_skip'))).toMatchObject({
      errorCode: 'PAYLOAD_BUDGET_EXCEEDED',
      providerAttemptNumber: 0,
      preflightOutcome: 'SKIPPED',
      requestOverflowTokens: 1,
    });
    expect(rows.find((row) => row.operationId?.endsWith('_null_usage'))).toMatchObject({
      inputTokens: null,
      outputTokens: null,
      actualTotalTokens: null,
    });
  });
});
