export type AdminPlan = 'FREE' | 'PRO';

export interface CustomerMetricUser {
  id: string;
  isInternal: boolean;
  plan: AdminPlan;
  createdAt: Date;
  lastActivityAt: Date | null;
}

export interface AiMetricEvent {
  userId?: string | null;
  capability?: string;
  operationId: string | null;
  provider: string;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number;
  success: boolean;
  fallbackUsed: boolean;
  attemptNumber: number;
  estimatedCostUsd: number | null;
}

export interface AdminProviderAttempts {
  provider: string;
  attempts: number;
}

export type AdminRecentActivityType =
  | 'user_signed_up'
  | 'ats_completed'
  | 'job_match_completed'
  | 'subscription_activated'
  | 'ai_provider_failed'
  | 'fallback_used';

export interface AdminRecentActivityItem {
  type: AdminRecentActivityType;
  occurredAt: Date;
  subject: string;
}

function startOfUtcDay(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function startOfUtcMonth(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1));
}

export function aggregateCustomerKpis(users: CustomerMetricUser[], now: Date) {
  const customers = users.filter((user) => !user.isInternal);
  const proUsers = customers.filter((user) => user.plan === 'PRO').length;
  const today = startOfUtcDay(now);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const activeSince = (boundary: Date) =>
    customers.filter(
      (user) => user.lastActivityAt && user.lastActivityAt.getTime() >= boundary.getTime()
    ).length;

  return {
    customerUsers: customers.length,
    internalUsers: users.length - customers.length,
    freeUsers: customers.length - proUsers,
    proUsers,
    conversionRate: customers.length === 0 ? 0 : (proUsers / customers.length) * 100,
    newUsersThisMonth: customers.filter(
      (user) => user.createdAt.getTime() >= startOfUtcMonth(now).getTime()
    ).length,
    activeUsers: {
      today: activeSince(today),
      last7Days: activeSince(sevenDaysAgo),
      last30Days: activeSince(thirtyDaysAgo),
    },
  };
}

export function aggregateAiUsage(events: AiMetricEvent[]) {
  const runs = new Map<string, { successful: boolean; usedFallback: boolean }>();
  const providerCounts = new Map<string, number>();
  let latency = 0;
  let totalTokens = 0;
  let hasUnknownTokens = false;
  let knownCost = 0;
  let knownCostAttempts = 0;
  let tokenBearingAttempts = 0;
  let fallbackAttempts = 0;

  for (const event of events) {
    providerCounts.set(event.provider, (providerCounts.get(event.provider) ?? 0) + 1);
    latency += event.latencyMs;
    if (event.inputTokens == null || event.outputTokens == null) {
      hasUnknownTokens = true;
    } else {
      tokenBearingAttempts += 1;
      totalTokens += event.inputTokens + event.outputTokens;
      if (event.estimatedCostUsd != null) knownCostAttempts += 1;
    }
    if (event.estimatedCostUsd != null) knownCost += event.estimatedCostUsd;
    if (event.fallbackUsed || event.attemptNumber > 1) fallbackAttempts += 1;
    if (!event.operationId) continue;
    const runKey = JSON.stringify([event.userId ?? null, event.capability ?? null, event.operationId]);
    const run = runs.get(runKey) ?? { successful: false, usedFallback: false };
    run.successful ||= event.success;
    run.usedFallback ||= event.fallbackUsed || event.attemptNumber > 1;
    runs.set(runKey, run);
  }

  const successfulFeatureRuns = [...runs.values()].filter(({ successful }) => successful).length;
  const fallbackFeatureRuns = [...runs.values()].filter(({ usedFallback }) => usedFallback).length;
  const featureRuns = runs.size;
  const providerBreakdown: AdminProviderAttempts[] = [...providerCounts]
    .map(([provider, attempts]) => ({ provider, attempts }))
    .sort((left, right) =>
      right.attempts - left.attempts || left.provider.localeCompare(right.provider)
    );

  return {
    featureRuns,
    providerAttempts: events.length,
    unattributedAttempts: events.filter(({ operationId }) => !operationId).length,
    successfulFeatureRuns,
    aiSuccessRate: featureRuns === 0 ? null : (successfulFeatureRuns / featureRuns) * 100,
    fallbackFeatureRuns,
    fallbackRate: featureRuns === 0 ? null : (fallbackFeatureRuns / featureRuns) * 100,
    fallbackAttempts,
    providerBreakdown,
    averageLatencyMs: events.length === 0 ? null : Math.round(latency / events.length),
    totalTokens: hasUnknownTokens ? null : totalTokens,
    estimatedCostUsd: events.length > 0 && knownCostAttempts === 0 ? null : knownCost,
    knownCostCoverage:
      tokenBearingAttempts === 0 ? null : (knownCostAttempts / tokenBearingAttempts) * 100,
  };
}

export function mergeRecentActivity(
  items: AdminRecentActivityItem[],
  limit: number
): AdminRecentActivityItem[] {
  return [...items]
    .sort((left, right) => right.occurredAt.getTime() - left.occurredAt.getTime())
    .slice(0, Math.max(0, limit));
}
