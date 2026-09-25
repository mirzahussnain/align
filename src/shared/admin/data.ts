import 'server-only';

import { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/shared/lib/prisma';
import { resolveBillingAccessForUsers } from '@/shared/billing/access';
import { configuredAdminEmails } from './admin-runtime';
import { requireAdminDataAccess } from './authorization';
import {
  mergeRecentActivity,
  type AdminProviderAttempts,
  type AdminRecentActivityItem,
} from './metrics';

const DEFAULT_USER_PAGE_SIZE = 20;
const DEFAULT_USAGE_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
const RECENT_ACTIVITY_LIMIT = 10;

const ACTIVITY_SELECT = {
  id: true,
  email: true,
  emailVerified: true,
  createdAt: true,
  updatedAt: true,
  onboardedAt: true,
  onboardingState: { select: { status: true, stage: true } },
  sessions: { orderBy: { updatedAt: 'desc' }, take: 1, select: { updatedAt: true } },
  atsAnalyses: { orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } },
  jobMatches: { orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } },
  generatedCVs: { orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } },
  aiUsageEvents: { orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } },
  _count: {
    select: {
      storedCvs: { where: { deletedAt: null } },
      atsAnalyses: true,
      jobMatches: true,
    },
  },
} satisfies Prisma.UserSelect;

type ActivityUser = Prisma.UserGetPayload<{ select: typeof ACTIVITY_SELECT }>;

const OVERVIEW_USER_SELECT = {
  id: true,
  email: true,
  emailVerified: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

export interface AdminOverview {
  customerUsers: number;
  internalUsers: number;
  newUsersThisMonth: number;
  freeUsers: number;
  proUsers: number;
  conversionRate: number;
  verifiedUsers: number;
  unverifiedUsers: number;
  activeUsers: { today: number; last7Days: number; last30Days: number };
  aiFeatureRunsThisMonth: number;
  providerAttemptsThisMonth: number;
  unattributedAttemptsThisMonth: number;
  aiSuccessRate: number | null;
  fallbackRate: number | null;
  fallbackAttemptsThisMonth: number;
  averageLatencyMs: number | null;
  providerBreakdown: AdminProviderAttempts[];
  estimatedAiCostUsd: number | null;
  knownCostCoverage: number | null;
  mostUsedAiCapability: string | null;
  recentActivity: AdminRecentActivityItem[];
}

export interface AdminUserRow {
  id: string;
  email: string;
  isInternal: boolean;
  signupDate: Date;
  emailVerified: boolean;
  plan: 'FREE' | 'PRO';
  onboardingState: string;
  storedCvCount: number;
  analysisCount: number;
  jobMatchCount: number;
  lastActivityAt: Date | null;
}

export interface AdminAiUsageRow {
  id: string;
  capability: string;
  provider: string;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number;
  success: boolean;
  errorCode: string | null;
  fallbackUsed: boolean;
  attemptNumber: number;
  estimatedCostUsd: number | null;
  createdAt: Date;
}

export interface AdminAiUsageFilters {
  from?: string;
  to?: string;
  capability?: string;
  provider?: string;
  model?: string;
  success?: boolean;
  page?: number;
  pageSize?: number;
}

export interface AdminUserFilters {
  search?: string;
  page?: number;
  pageSize?: number;
  sort?: 'signup' | 'last_activity';
  direction?: 'asc' | 'desc';
}

function positiveInteger(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value) || value == null || value < 1) return fallback;
  return Math.floor(value);
}

function pageSize(value: number | undefined, fallback: number): number {
  return Math.min(positiveInteger(value, fallback), MAX_PAGE_SIZE);
}

function startOfUtcMonth(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export function defaultAdminAiUsageFrom(now = new Date()): string {
  return startOfUtcMonth(now).toISOString().slice(0, 10);
}

function decimalToNumber(
  value: { toString(): string } | number | null | undefined
): number | null {
  if (value == null) return null;
  const parsed = Number(value.toString());
  return Number.isFinite(parsed) ? parsed : null;
}

function validDate(value: string | undefined): Date | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function nextUtcDay(date: Date): Date {
  return new Date(date.getTime() + 24 * 60 * 60 * 1000);
}

function latestDate(values: Array<Date | null | undefined>): Date | null {
  const timestamps = values
    .filter((value): value is Date => value instanceof Date)
    .map((value) => value.getTime());
  return timestamps.length > 0 ? new Date(Math.max(...timestamps)) : null;
}

function lastActivityAt(user: ActivityUser): Date | null {
  return latestDate([
    user.updatedAt,
    user.sessions[0]?.updatedAt,
    user.atsAnalyses[0]?.createdAt,
    user.jobMatches[0]?.createdAt,
    user.generatedCVs[0]?.createdAt,
    user.aiUsageEvents[0]?.createdAt,
  ]);
}

function onboardingLabel(user: {
  onboardedAt: Date | null;
  onboardingState: { status: string; stage: string } | null;
}): string {
  if (user.onboardedAt || user.onboardingState?.status === 'COMPLETED') return 'Completed';
  if (user.onboardingState?.status === 'BLOCKED') return 'Blocked';
  if (user.onboardingState?.status === 'IN_PROGRESS') return 'In progress';
  if (user.onboardingState?.status === 'DISMISSED') return 'Dismissed';
  return 'Not started';
}

function customerEmailWhere(internalEmails: string[]) {
  return internalEmails.length > 0 ? { notIn: internalEmails } : undefined;
}

async function loadActiveCustomerCounts(now: Date, internalEmails: string[]) {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const internalFilter = internalEmails.length > 0
    ? Prisma.sql`AND LOWER(u."email") NOT IN (${Prisma.join(internalEmails.map((email) => email.toLowerCase()))})`
    : Prisma.empty;
  const rows = await prisma.$queryRaw<Array<{ today: bigint; last7Days: bigint; last30Days: bigint }>>(Prisma.sql`
    WITH activity AS (
      SELECT
        u."id",
        GREATEST(
          u."updatedAt",
          COALESCE((SELECT MAX(s."updatedAt") FROM "session" s WHERE s."userId" = u."id"), u."updatedAt"),
          COALESCE((SELECT MAX(a."createdAt") FROM "ats_analysis" a WHERE a."userId" = u."id"), u."updatedAt"),
          COALESCE((SELECT MAX(j."createdAt") FROM "job_match" j WHERE j."userId" = u."id"), u."updatedAt"),
          COALESCE((SELECT MAX(g."createdAt") FROM "generated_cv" g WHERE g."userId" = u."id"), u."updatedAt"),
          COALESCE((SELECT MAX(e."createdAt") FROM "ai_usage_event" e WHERE e."userId" = u."id"), u."updatedAt")
        ) AS "lastActivityAt"
      FROM "user" u
      WHERE TRUE ${internalFilter}
    )
    SELECT
      COUNT(*) FILTER (WHERE "lastActivityAt" >= ${today})::bigint AS "today",
      COUNT(*) FILTER (WHERE "lastActivityAt" >= ${sevenDaysAgo})::bigint AS "last7Days",
      COUNT(*) FILTER (WHERE "lastActivityAt" >= ${thirtyDaysAgo})::bigint AS "last30Days"
    FROM activity
  `);
  const row = rows[0];
  return {
    today: Number(row?.today ?? 0),
    last7Days: Number(row?.last7Days ?? 0),
    last30Days: Number(row?.last30Days ?? 0),
  };
}

async function loadRecentActivity(internalEmails: string[]): Promise<AdminRecentActivityItem[]> {
  const email = customerEmailWhere(internalEmails);
  const linkedAiWhere = internalEmails.length > 0
    ? { OR: [{ userId: null }, { user: { is: { email: { notIn: internalEmails } } } }] }
    : {};
  const [signups, ats, matches, subscriptions, failures, fallbacks] = await Promise.all([
    prisma.user.findMany({
      where: email ? { email } : {},
      orderBy: { createdAt: 'desc' },
      take: RECENT_ACTIVITY_LIMIT,
      select: { email: true, createdAt: true },
    }),
    prisma.atsAnalysis.findMany({
      where: email ? { user: { email } } : {},
      orderBy: { createdAt: 'desc' },
      take: RECENT_ACTIVITY_LIMIT,
      select: { createdAt: true, user: { select: { email: true } } },
    }),
    prisma.jobMatch.findMany({
      where: email ? { user: { email } } : {},
      orderBy: { createdAt: 'desc' },
      take: RECENT_ACTIVITY_LIMIT,
      select: { createdAt: true, user: { select: { email: true } } },
    }),
    prisma.billingPurchase.findMany({
      where: {
        provider: 'STRIPE',
        arrangement: 'RECURRING',
        status: { in: ['ACTIVE', 'TRIALING'] },
        accessStartsAt: { not: null },
        ...(email ? { billingAccount: { user: { email } } } : {}),
      },
      orderBy: { accessStartsAt: 'desc' },
      take: RECENT_ACTIVITY_LIMIT,
      select: {
        accessStartsAt: true,
        billingAccount: { select: { user: { select: { email: true } } } },
      },
    }),
    prisma.aiUsageEvent.findMany({
      where: { ...linkedAiWhere, success: false },
      orderBy: { createdAt: 'desc' },
      take: RECENT_ACTIVITY_LIMIT,
      select: { createdAt: true, capability: true },
    }),
    prisma.aiUsageEvent.findMany({
      where: { ...linkedAiWhere, fallbackUsed: true },
      orderBy: { createdAt: 'desc' },
      take: RECENT_ACTIVITY_LIMIT,
      select: { createdAt: true, capability: true },
    }),
  ]);

  return mergeRecentActivity(
    [
      ...signups.map((row) => ({ type: 'user_signed_up' as const, occurredAt: row.createdAt, subject: row.email })),
      ...ats.map((row) => ({ type: 'ats_completed' as const, occurredAt: row.createdAt, subject: row.user.email })),
      ...matches.map((row) => ({ type: 'job_match_completed' as const, occurredAt: row.createdAt, subject: row.user.email })),
      ...subscriptions.flatMap((row) => row.accessStartsAt ? [{ type: 'subscription_activated' as const, occurredAt: row.accessStartsAt, subject: row.billingAccount.user.email }] : []),
      ...failures.map((row) => ({ type: 'ai_provider_failed' as const, occurredAt: row.createdAt, subject: row.capability })),
      ...fallbacks.map((row) => ({ type: 'fallback_used' as const, occurredAt: row.createdAt, subject: row.capability })),
    ],
    RECENT_ACTIVITY_LIMIT
  );
}

export async function loadAdminOverview(now = new Date()): Promise<AdminOverview> {
  await requireAdminDataAccess('/admin');
  const monthStart = startOfUtcMonth(now);
  const internalEmails = [...configuredAdminEmails()];

  const [users, ai, capabilityGroups, recentActivity, activeUsers] = await Promise.all([
    prisma.user.findMany({ select: OVERVIEW_USER_SELECT }),
    loadAiUsageSummary({ from: monthStart.toISOString().slice(0, 10) }),
    prisma.aiUsageEvent.groupBy({
      by: ['capability'],
      where: { createdAt: { gte: monthStart } },
      _count: { capability: true },
      orderBy: { _count: { capability: 'desc' } },
      take: 1,
    }),
    loadRecentActivity(internalEmails),
    loadActiveCustomerCounts(now, internalEmails),
  ]);

  const plans = await resolveBillingAccessForUsers(users.map(({ id }) => id), now);
  const internalSet = new Set(internalEmails);
  const customerUsers = users.filter((user) => !internalSet.has(user.email.toLowerCase()));
  const proUsers = customerUsers.filter((user) => plans.get(user.id)?.effectivePlan === 'PRO').length;

  return {
    customerUsers: customerUsers.length,
    internalUsers: users.length - customerUsers.length,
    newUsersThisMonth: customerUsers.filter((user) => user.createdAt >= monthStart).length,
    freeUsers: customerUsers.length - proUsers,
    proUsers,
    conversionRate: customerUsers.length === 0 ? 0 : (proUsers / customerUsers.length) * 100,
    activeUsers,
    verifiedUsers: customerUsers.filter(({ emailVerified }) => emailVerified).length,
    unverifiedUsers: customerUsers.filter(({ emailVerified }) => !emailVerified).length,
    aiFeatureRunsThisMonth: ai.featureRuns,
    providerAttemptsThisMonth: ai.providerAttempts,
    unattributedAttemptsThisMonth: ai.unattributedAttempts,
    aiSuccessRate: ai.aiSuccessRate,
    fallbackRate: ai.fallbackRate,
    fallbackAttemptsThisMonth: ai.fallbackAttempts,
    averageLatencyMs: ai.averageLatencyMs,
    providerBreakdown: ai.providerBreakdown,
    estimatedAiCostUsd: ai.estimatedCostUsd,
    knownCostCoverage: ai.knownCostCoverage,
    mostUsedAiCapability: capabilityGroups[0]?.capability ?? null,
    recentActivity,
  };
}

function userWhere(search: string | undefined) {
  return search ? { email: { contains: search, mode: 'insensitive' as const } } : {};
}

async function sortedUserIds(input: {
  search?: string;
  page: number;
  size: number;
  direction: 'asc' | 'desc';
}): Promise<string[]> {
  const searchFilter = input.search
    ? Prisma.sql`WHERE u."email" ILIKE ${`%${input.search}%`}`
    : Prisma.empty;
  const direction = input.direction === 'asc' ? Prisma.raw('ASC') : Prisma.raw('DESC');
  const offset = (input.page - 1) * input.size;
  const rows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT u."id"
    FROM "user" u
    ${searchFilter}
    ORDER BY GREATEST(
      u."updatedAt",
      COALESCE((SELECT MAX(s."updatedAt") FROM "session" s WHERE s."userId" = u."id"), u."updatedAt"),
      COALESCE((SELECT MAX(a."createdAt") FROM "ats_analysis" a WHERE a."userId" = u."id"), u."updatedAt"),
      COALESCE((SELECT MAX(j."createdAt") FROM "job_match" j WHERE j."userId" = u."id"), u."updatedAt"),
      COALESCE((SELECT MAX(g."createdAt") FROM "generated_cv" g WHERE g."userId" = u."id"), u."updatedAt"),
      COALESCE((SELECT MAX(e."createdAt") FROM "ai_usage_event" e WHERE e."userId" = u."id"), u."updatedAt")
    ) ${direction}, u."id" ${direction}
    LIMIT ${input.size} OFFSET ${offset}
  `);
  return rows.map(({ id }) => id);
}

function toAdminUserRow(
  user: ActivityUser,
  plans: Awaited<ReturnType<typeof resolveBillingAccessForUsers>>,
  internalEmails: ReadonlySet<string>
): AdminUserRow {
  return {
    id: user.id,
    email: user.email,
    isInternal: internalEmails.has(user.email.toLowerCase()),
    signupDate: user.createdAt,
    emailVerified: user.emailVerified,
    plan: plans.get(user.id)?.effectivePlan ?? 'FREE',
    onboardingState: onboardingLabel(user),
    storedCvCount: user._count.storedCvs,
    analysisCount: user._count.atsAnalyses,
    jobMatchCount: user._count.jobMatches,
    lastActivityAt: lastActivityAt(user),
  };
}

export async function loadAdminUsers(input: AdminUserFilters): Promise<{
  rows: AdminUserRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}> {
  await requireAdminDataAccess('/admin/users');
  const currentPage = positiveInteger(input.page, 1);
  const size = pageSize(input.pageSize, DEFAULT_USER_PAGE_SIZE);
  const search = input.search?.trim();
  const where = userWhere(search);
  const sort = input.sort ?? 'signup';
  const direction = input.direction ?? 'desc';

  const total = await prisma.user.count({ where });
  let users: ActivityUser[];
  if (sort === 'last_activity') {
    const ids = await sortedUserIds({ search, page: currentPage, size, direction });
    const unordered = await prisma.user.findMany({
      where: { AND: [where, { id: { in: ids } }] },
      select: ACTIVITY_SELECT,
    });
    const byId = new Map(unordered.map((user) => [user.id, user]));
    users = ids.flatMap((id) => {
      const user = byId.get(id);
      return user ? [user] : [];
    });
  } else {
    users = await prisma.user.findMany({
      where,
      orderBy: [{ createdAt: direction }, { id: direction }],
      skip: (currentPage - 1) * size,
      take: size,
      select: ACTIVITY_SELECT,
    });
  }

  const plans = await resolveBillingAccessForUsers(users.map(({ id }) => id));
  const internalEmails = configuredAdminEmails();

  return {
    rows: users.map((user) => toAdminUserRow(user, plans, internalEmails)),
    page: currentPage,
    pageSize: size,
    total,
    totalPages: Math.max(1, Math.ceil(total / size)),
  };
}

function aiUsageWhere(filters: AdminAiUsageFilters) {
  const from = validDate(filters.from);
  const to = validDate(filters.to);
  return {
    ...(from || to
      ? {
          createdAt: {
            ...(from ? { gte: from } : {}),
            ...(to ? { lt: nextUtcDay(to) } : {}),
          },
        }
      : {}),
    ...(filters.capability ? { capability: filters.capability } : {}),
    ...(filters.provider ? { provider: filters.provider } : {}),
    ...(filters.model ? { model: filters.model } : {}),
    ...(filters.success === undefined ? {} : { success: filters.success }),
  };
}

function aiUsageSqlConditions(filters: AdminAiUsageFilters): Prisma.Sql {
  const conditions: Prisma.Sql[] = [Prisma.sql`TRUE`];
  const from = validDate(filters.from);
  const to = validDate(filters.to);
  if (from) conditions.push(Prisma.sql`"createdAt" >= ${from}`);
  if (to) conditions.push(Prisma.sql`"createdAt" < ${nextUtcDay(to)}`);
  if (filters.capability) conditions.push(Prisma.sql`"capability" = ${filters.capability}`);
  if (filters.provider) conditions.push(Prisma.sql`"provider" = ${filters.provider}`);
  if (filters.model) conditions.push(Prisma.sql`"model" = ${filters.model}`);
  if (filters.success !== undefined) conditions.push(Prisma.sql`"success" = ${filters.success}`);
  return Prisma.join(conditions, ' AND ');
}

interface AiUsageSummaryRow {
  featureRuns: number;
  providerAttempts: number;
  unattributedAttempts: number;
  successfulFeatureRuns: number;
  fallbackFeatureRuns: number;
  fallbackAttempts: number;
  averageLatencyMs: number | null;
  totalTokens: bigint | null;
  estimatedCostUsd: Prisma.Decimal | number | null;
  knownCostAttempts: number;
  tokenBearingAttempts: number;
  providerBreakdown: AdminProviderAttempts[] | null;
}

async function loadAiUsageSummary(filters: AdminAiUsageFilters) {
  const conditions = aiUsageSqlConditions(filters);
  const rows = await prisma.$queryRaw<AiUsageSummaryRow[]>(Prisma.sql`
    WITH filtered AS (
      SELECT "userId", "capability", "operationId", "provider", "inputTokens",
        "outputTokens", "latencyMs", "success", "fallbackUsed", "attemptNumber",
        "estimatedCostUsd"
      FROM "ai_usage_event"
      WHERE ${conditions}
    ), runs AS (
      SELECT "userId", "capability", "operationId",
        BOOL_OR("success") AS successful,
        BOOL_OR("fallbackUsed" OR "attemptNumber" > 1) AS fallback
      FROM filtered
      WHERE "operationId" IS NOT NULL
      GROUP BY "userId", "capability", "operationId"
    ), providers AS (
      SELECT "provider", COUNT(*)::int AS total
      FROM filtered
      GROUP BY "provider"
    ), attempts AS (
      SELECT
        COUNT(*)::int AS "providerAttempts",
        COUNT(*) FILTER (WHERE "operationId" IS NULL)::int AS "unattributedAttempts",
        COUNT(*) FILTER (WHERE "fallbackUsed" OR "attemptNumber" > 1)::int AS "fallbackAttempts",
        ROUND(AVG("latencyMs"))::int AS "averageLatencyMs",
        CASE WHEN BOOL_OR("inputTokens" IS NULL OR "outputTokens" IS NULL)
          THEN NULL ELSE COALESCE(SUM("inputTokens" + "outputTokens"), 0)::bigint END AS "totalTokens",
        SUM("estimatedCostUsd") AS "estimatedCostUsd",
        COUNT(*) FILTER (WHERE "inputTokens" IS NOT NULL AND "outputTokens" IS NOT NULL
          AND "estimatedCostUsd" IS NOT NULL)::int AS "knownCostAttempts",
        COUNT(*) FILTER (WHERE "inputTokens" IS NOT NULL AND "outputTokens" IS NOT NULL)::int AS "tokenBearingAttempts"
      FROM filtered
    ), run_totals AS (
      SELECT COUNT(*)::int AS "featureRuns",
        COUNT(*) FILTER (WHERE successful)::int AS "successfulFeatureRuns",
        COUNT(*) FILTER (WHERE fallback)::int AS "fallbackFeatureRuns"
      FROM runs
    )
    SELECT run_totals.*, attempts.*,
      COALESCE((
        SELECT JSONB_AGG(
          JSONB_BUILD_OBJECT('provider', "provider", 'attempts', total)
          ORDER BY total DESC, "provider"
        )
        FROM providers
      ), '[]'::jsonb) AS "providerBreakdown"
    FROM run_totals CROSS JOIN attempts
  `);
  const row = rows[0] ?? {
    featureRuns: 0, providerAttempts: 0, unattributedAttempts: 0,
    successfulFeatureRuns: 0, fallbackFeatureRuns: 0, fallbackAttempts: 0,
    averageLatencyMs: null, totalTokens: BigInt(0), estimatedCostUsd: null,
    knownCostAttempts: 0, tokenBearingAttempts: 0, providerBreakdown: [],
  };
  return {
    featureRuns: Number(row.featureRuns),
    providerAttempts: Number(row.providerAttempts),
    unattributedAttempts: Number(row.unattributedAttempts),
    successfulFeatureRuns: Number(row.successfulFeatureRuns),
    aiSuccessRate: row.featureRuns === 0 ? null : (Number(row.successfulFeatureRuns) / Number(row.featureRuns)) * 100,
    fallbackFeatureRuns: Number(row.fallbackFeatureRuns),
    fallbackRate: row.featureRuns === 0 ? null : (Number(row.fallbackFeatureRuns) / Number(row.featureRuns)) * 100,
    fallbackAttempts: Number(row.fallbackAttempts),
    providerBreakdown: row.providerBreakdown ?? [],
    averageLatencyMs: row.averageLatencyMs == null ? null : Number(row.averageLatencyMs),
    totalTokens: row.totalTokens == null ? null : Number(row.totalTokens),
    estimatedCostUsd: row.providerAttempts > 0 && row.knownCostAttempts === 0 ? null : decimalToNumber(row.estimatedCostUsd) ?? 0,
    knownCostCoverage: row.tokenBearingAttempts === 0 ? null : (Number(row.knownCostAttempts) / Number(row.tokenBearingAttempts)) * 100,
  };
}

export async function loadAdminAiUsage(filters: AdminAiUsageFilters) {
  await requireAdminDataAccess('/admin/ai-usage');
  const currentPage = positiveInteger(filters.page, 1);
  const size = pageSize(filters.pageSize, DEFAULT_USAGE_PAGE_SIZE);
  const where = aiUsageWhere(filters);

  const [summary, events, optionRows] = await Promise.all([
    loadAiUsageSummary(filters),
    prisma.aiUsageEvent.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (currentPage - 1) * size,
      take: size,
      select: {
        id: true,
        capability: true,
        provider: true,
        model: true,
        inputTokens: true,
        outputTokens: true,
        latencyMs: true,
        success: true,
        errorCode: true,
        fallbackUsed: true,
        attemptNumber: true,
        estimatedCostUsd: true,
        createdAt: true,
      },
    }),
    prisma.aiUsageEvent.findMany({
      distinct: ['capability', 'provider', 'model'],
      select: { capability: true, provider: true, model: true },
    }),
  ]);

  return {
    rows: events.map((event): AdminAiUsageRow => ({
      ...event,
      estimatedCostUsd: decimalToNumber(event.estimatedCostUsd),
    })),
    summary,
    options: {
      capabilities: [...new Set(optionRows.map((row) => row.capability))].sort(),
      providers: [...new Set(optionRows.map((row) => row.provider))].sort(),
      models: [...new Set(optionRows.map((row) => row.model))].sort(),
    },
    page: currentPage,
    pageSize: size,
    total: summary.providerAttempts,
    totalPages: Math.max(1, Math.ceil(summary.providerAttempts / size)),
  };
}
