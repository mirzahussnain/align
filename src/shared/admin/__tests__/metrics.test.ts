import { describe, expect, it } from 'vitest';

import {
  aggregateAiUsage,
  aggregateCustomerKpis,
  mergeRecentActivity,
} from '../metrics';

const NOW = new Date('2026-09-25T12:00:00.000Z');

describe('admin metrics', () => {
  it('excludes internal users from customer KPIs and counts them separately', () => {
    const result = aggregateCustomerKpis(
      [
        { id: 'admin', isInternal: true, plan: 'PRO', createdAt: new Date('2026-09-01'), lastActivityAt: NOW },
        { id: 'free', isInternal: false, plan: 'FREE', createdAt: new Date('2026-09-02'), lastActivityAt: NOW },
        { id: 'pro', isInternal: false, plan: 'PRO', createdAt: new Date('2026-08-01'), lastActivityAt: NOW },
      ],
      NOW
    );

    expect(result).toMatchObject({
      customerUsers: 2,
      internalUsers: 1,
      freeUsers: 1,
      proUsers: 1,
      conversionRate: 50,
      newUsersThisMonth: 1,
    });
  });

  it('counts active customers in today, 7-day, and 30-day windows', () => {
    const result = aggregateCustomerKpis(
      [
        { id: 'today', isInternal: false, plan: 'FREE', createdAt: NOW, lastActivityAt: new Date('2026-09-25T08:00:00Z') },
        { id: 'week', isInternal: false, plan: 'FREE', createdAt: NOW, lastActivityAt: new Date('2026-09-20T08:00:00Z') },
        { id: 'month', isInternal: false, plan: 'PRO', createdAt: NOW, lastActivityAt: new Date('2026-09-01T08:00:00Z') },
        { id: 'old', isInternal: false, plan: 'FREE', createdAt: NOW, lastActivityAt: new Date('2026-08-01T08:00:00Z') },
        { id: 'admin', isInternal: true, plan: 'PRO', createdAt: NOW, lastActivityAt: NOW },
      ],
      NOW
    );

    expect(result.activeUsers).toEqual({ today: 1, last7Days: 2, last30Days: 3 });
  });

  it('separates explicit feature runs from provider attempts and excludes unattributed history', () => {
    const result = aggregateAiUsage([
      { operationId: 'run-1', provider: 'gemini', inputTokens: 100, outputTokens: 20, latencyMs: 100, success: false, fallbackUsed: false, attemptNumber: 1, estimatedCostUsd: 0.001 },
      { operationId: 'run-1', provider: 'groq', inputTokens: 100, outputTokens: 20, latencyMs: 200, success: true, fallbackUsed: true, attemptNumber: 2, estimatedCostUsd: null },
      { operationId: 'run-2', provider: 'gemini', inputTokens: 50, outputTokens: 10, latencyMs: 300, success: true, fallbackUsed: false, attemptNumber: 1, estimatedCostUsd: 0.002 },
      { operationId: null, provider: 'gemini', inputTokens: 10, outputTokens: 5, latencyMs: 400, success: true, fallbackUsed: false, attemptNumber: 1, estimatedCostUsd: 0.003 },
    ]);

    expect(result).toMatchObject({
      featureRuns: 2,
      providerAttempts: 4,
      unattributedAttempts: 1,
      successfulFeatureRuns: 2,
      aiSuccessRate: 100,
      fallbackFeatureRuns: 1,
      fallbackRate: 50,
      fallbackAttempts: 1,
      providerBreakdown: { gemini: 3, groq: 1 },
      averageLatencyMs: 250,
    });
  });

  it('keeps reused operation IDs distinct across users and capabilities', () => {
    const base = { provider: 'gemini', inputTokens: 10, outputTokens: 5, latencyMs: 100, success: true, fallbackUsed: false, attemptNumber: 1, estimatedCostUsd: 0.001 };
    const result = aggregateAiUsage([
      { ...base, userId: 'user-1', capability: 'job_match_analysis', operationId: 'shared' },
      { ...base, userId: 'user-2', capability: 'job_match_analysis', operationId: 'shared' },
      { ...base, userId: 'user-1', capability: 'ai_enhanced_ats_analysis', operationId: 'shared' },
    ]);

    expect(result).toMatchObject({
      featureRuns: 3,
      providerAttempts: 3,
      successfulFeatureRuns: 3,
    });
  });

  it('sums only known costs and reports coverage across token-bearing attempts', () => {
    const result = aggregateAiUsage([
      { operationId: 'run-1', provider: 'gemini', inputTokens: 100, outputTokens: 20, latencyMs: 100, success: true, fallbackUsed: false, attemptNumber: 1, estimatedCostUsd: 0.0042 },
      { operationId: 'run-2', provider: 'groq', inputTokens: 100, outputTokens: 20, latencyMs: 100, success: true, fallbackUsed: false, attemptNumber: 1, estimatedCostUsd: null },
      { operationId: 'run-3', provider: 'groq', inputTokens: null, outputTokens: null, latencyMs: 100, success: false, fallbackUsed: false, attemptNumber: 1, estimatedCostUsd: null },
    ]);

    expect(result.estimatedCostUsd).toBe(0.0042);
    expect(result.knownCostCoverage).toBe(50);
    expect(result.totalTokens).toBeNull();
  });

  it('merges trustworthy recent activity in reverse chronological order', () => {
    const result = mergeRecentActivity(
      [
        { type: 'user_signed_up', occurredAt: new Date('2026-09-25T09:00:00Z'), subject: 'one@example.com' },
        { type: 'ats_completed', occurredAt: new Date('2026-09-25T11:00:00Z'), subject: 'two@example.com' },
        { type: 'fallback_used', occurredAt: new Date('2026-09-25T10:00:00Z'), subject: 'Job Match' },
      ],
      2
    );

    expect(result.map(({ type }) => type)).toEqual(['ats_completed', 'fallback_used']);
  });
});
