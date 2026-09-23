import 'server-only';

import { prisma } from '@/shared/lib/prisma';
import { resolveBillingAccessForUsers } from '@/shared/billing/access';
import { requireAdminDataAccess } from './authorization';

const DEFAULT_USER_PAGE_SIZE = 20;
const DEFAULT_USAGE_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

export interface AdminOverview {
  totalUsers: number;
  newUsersThisMonth: number;
  freeUsers: number;
  proUsers: number;
  verifiedUsers: number;
  unverifiedUsers: number;
  aiOperationsThisMonth: number;
  successfulAiOperations: number;
  failedAiOperations: number;
  estimatedAiCostUsd: number | null;
  mostUsedAiCapability: string | null;
}

export interface AdminUserRow {
  id: string;
  email: string;
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

export async function loadAdminOverview(now = new Date()): Promise<AdminOverview> {
  await requireAdminDataAccess('/admin');
  const monthStart = startOfUtcMonth(now);

  const [
    totalUsers,
    newUsersThisMonth,
    verifiedUsers,
    users,
    aiOperationsThisMonth,
    successfulAiOperations,
    failedAiOperations,
    unknownCostOperations,
    cost,
    capabilityGroups,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { createdAt: { gte: monthStart } } }),
    prisma.user.count({ where: { emailVerified: true } }),
    prisma.user.findMany({ select: { id: true } }),
    prisma.aiUsageEvent.count({ where: { createdAt: { gte: monthStart } } }),
    prisma.aiUsageEvent.count({ where: { createdAt: { gte: monthStart }, success: true } }),
    prisma.aiUsageEvent.count({ where: { createdAt: { gte: monthStart }, success: false } }),
    prisma.aiUsageEvent.count({
      where: { createdAt: { gte: monthStart }, estimatedCostUsd: null },
    }),
    prisma.aiUsageEvent.aggregate({
      where: { createdAt: { gte: monthStart } },
      _sum: { estimatedCostUsd: true },
    }),
    prisma.aiUsageEvent.groupBy({
      by: ['capability'],
      where: { createdAt: { gte: monthStart } },
      _count: { capability: true },
      orderBy: { _count: { capability: 'desc' } },
      take: 1,
    }),
  ]);

  const plans = await resolveBillingAccessForUsers(users.map(({ id }) => id), now);
  const proUsers = [...plans.values()].filter(
    ({ effectivePlan }) => effectivePlan === 'PRO'
  ).length;

  return {
    totalUsers,
    newUsersThisMonth,
    freeUsers: totalUsers - proUsers,
    proUsers,
    verifiedUsers,
    unverifiedUsers: totalUsers - verifiedUsers,
    aiOperationsThisMonth,
    successfulAiOperations,
    failedAiOperations,
    estimatedAiCostUsd:
      unknownCostOperations > 0 ? null : decimalToNumber(cost._sum.estimatedCostUsd) ?? 0,
    mostUsedAiCapability: capabilityGroups[0]?.capability ?? null,
  };
}

export async function loadAdminUsers(input: {
  search?: string;
  page?: number;
  pageSize?: number;
}): Promise<{
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
  const where = search ? { email: { contains: search, mode: 'insensitive' as const } } : {};

  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (currentPage - 1) * size,
      take: size,
      select: {
        id: true,
        email: true,
        emailVerified: true,
        createdAt: true,
        updatedAt: true,
        onboardedAt: true,
        onboardingState: { select: { status: true, stage: true } },
        sessions: {
          orderBy: { updatedAt: 'desc' },
          take: 1,
          select: { updatedAt: true },
        },
        atsAnalyses: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { createdAt: true },
        },
        jobMatches: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { createdAt: true },
        },
        generatedCVs: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { createdAt: true },
        },
        _count: {
          select: {
            storedCvs: { where: { deletedAt: null } },
            atsAnalyses: true,
            jobMatches: true,
          },
        },
      },
    }),
  ]);

  const plans = await resolveBillingAccessForUsers(users.map(({ id }) => id));
  const rows = users.map((user): AdminUserRow => ({
    id: user.id,
    email: user.email,
    signupDate: user.createdAt,
    emailVerified: user.emailVerified,
    plan: plans.get(user.id)?.effectivePlan ?? 'FREE',
    onboardingState: onboardingLabel(user),
    storedCvCount: user._count.storedCvs,
    analysisCount: user._count.atsAnalyses,
    jobMatchCount: user._count.jobMatches,
    lastActivityAt: latestDate([
      user.updatedAt,
      user.sessions[0]?.updatedAt,
      user.atsAnalyses[0]?.createdAt,
      user.jobMatches[0]?.createdAt,
      user.generatedCVs[0]?.createdAt,
    ]),
  }));

  return {
    rows,
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

export async function loadAdminAiUsage(filters: AdminAiUsageFilters) {
  await requireAdminDataAccess('/admin/ai-usage');
  const currentPage = positiveInteger(filters.page, 1);
  const size = pageSize(filters.pageSize, DEFAULT_USAGE_PAGE_SIZE);
  const where = aiUsageWhere(filters);

  const [total, failed, unknownTokens, unknownCost, aggregate, events, optionRows] =
    await Promise.all([
      prisma.aiUsageEvent.count({ where }),
      prisma.aiUsageEvent.count({ where: { AND: [where, { success: false }] } }),
      prisma.aiUsageEvent.count({
        where: { AND: [where, { OR: [{ inputTokens: null }, { outputTokens: null }] }] },
      }),
      prisma.aiUsageEvent.count({ where: { AND: [where, { estimatedCostUsd: null }] } }),
      prisma.aiUsageEvent.aggregate({
        where,
        _sum: { inputTokens: true, outputTokens: true, estimatedCostUsd: true },
        _avg: { latencyMs: true },
      }),
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

  const inputTokens = aggregate._sum.inputTokens ?? 0;
  const outputTokens = aggregate._sum.outputTokens ?? 0;

  return {
    rows: events.map((event): AdminAiUsageRow => ({
      ...event,
      estimatedCostUsd: decimalToNumber(event.estimatedCostUsd),
    })),
    summary: {
      totalRequests: total,
      totalTokens: unknownTokens > 0 ? null : inputTokens + outputTokens,
      averageLatencyMs:
        aggregate._avg.latencyMs == null ? null : Math.round(aggregate._avg.latencyMs),
      failureRate: total === 0 ? 0 : (failed / total) * 100,
      estimatedCostUsd:
        unknownCost > 0 ? null : decimalToNumber(aggregate._sum.estimatedCostUsd) ?? 0,
    },
    options: {
      capabilities: [...new Set(optionRows.map((row) => row.capability))].sort(),
      providers: [...new Set(optionRows.map((row) => row.provider))].sort(),
      models: [...new Set(optionRows.map((row) => row.model))].sort(),
    },
    page: currentPage,
    pageSize: size,
    total,
    totalPages: Math.max(1, Math.ceil(total / size)),
  };
}
