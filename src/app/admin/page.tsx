import {
  Activity,
  BadgeCheck,
  CircleDollarSign,
  Clock3,
  HeartPulse,
  Sparkles,
  UserRoundCheck,
  Users,
} from 'lucide-react';
import {
  AdminPageHeader,
  StatusPill,
  capabilityLabel,
  formatAdminDateTime,
} from '@/features/admin/components/AdminUi';
import { loadAdminOverview } from '@/shared/admin/data';
import type { AdminRecentActivityType } from '@/shared/admin/metrics';
import { formatProviderBreakdown } from '@/shared/admin/presentation';
import { loadAdminSystemHealth } from '@/shared/admin/system-health';

const activityLabels: Record<AdminRecentActivityType, string> = {
  user_signed_up: 'User signed up',
  ats_completed: 'AI ATS completed',
  job_match_completed: 'Job Match completed',
  subscription_activated: 'Subscription activated',
  ai_provider_failed: 'AI provider failed',
  fallback_used: 'Fallback used',
};

function percentage(value: number | null): string {
  return value == null ? 'Unavailable' : `${value.toFixed(1)}%`;
}

function Stat({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="min-w-0 border-l-2 border-border-subtle pl-4">
      <p className="text-xs font-semibold text-text-secondary">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-text-primary tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-text-tertiary">{detail}</p>
    </div>
  );
}

export default async function AdminOverviewPage() {
  const [data, health] = await Promise.all([loadAdminOverview(), loadAdminSystemHealth()]);
  const number = new Intl.NumberFormat('en-GB');

  return (
    <div className="mx-auto max-w-[1440px]">
      <AdminPageHeader
        title="Overview"
        description="Customer activity, conversion, AI reliability, and service readiness in one operational view."
      />

      <section className="rounded-2xl border border-border-subtle bg-bg-secondary p-5 sm:p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-text-primary">
              <Users className="h-4 w-4 text-accent-cyan" />
              <h2 className="text-sm font-semibold">Customer overview</h2>
            </div>
            <p className="mt-1 text-xs text-text-tertiary">Internal and admin accounts are excluded from customer KPIs.</p>
          </div>
          <StatusPill tone="neutral">{number.format(data.internalUsers)} internal</StatusPill>
        </div>

        <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Customer accounts" value={number.format(data.customerUsers)} detail={`${number.format(data.newUsersThisMonth)} new this month`} />
          <Stat label="Active today" value={number.format(data.activeUsers.today)} detail="Best available server-side activity signal" />
          <Stat label="Active last 7 days" value={number.format(data.activeUsers.last7Days)} detail="Distinct customer accounts" />
          <Stat label="Active last 30 days" value={number.format(data.activeUsers.last30Days)} detail="Distinct customer accounts" />
        </div>

        <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 border-t border-border-subtle pt-4 text-xs text-text-secondary">
          <span><strong className="font-semibold text-text-primary">{percentage(data.conversionRate)}</strong> Free → Pro conversion</span>
          <span><strong className="font-semibold text-text-primary">{number.format(data.proUsers)}</strong> Pro</span>
          <span><strong className="font-semibold text-text-primary">{number.format(data.freeUsers)}</strong> Free</span>
          <span><strong className="font-semibold text-text-primary">{number.format(data.verifiedUsers)}</strong> verified</span>
          <span><strong className="font-semibold text-text-primary">{number.format(data.unverifiedUsers)}</strong> unverified</span>
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-border-subtle bg-bg-secondary p-5 sm:p-6">
        <div className="flex items-start gap-2 text-text-primary">
          <Sparkles className="mt-0.5 h-4 w-4 text-accent-cyan" />
          <div>
            <h2 className="text-sm font-semibold">AI usage health</h2>
            <p className="mt-1 text-xs text-text-tertiary">Feature runs use explicit operation IDs; provider attempts include retries and fallbacks.</p>
          </div>
        </div>

        <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Feature runs this month" value={number.format(data.aiFeatureRunsThisMonth)} detail={`${number.format(data.unattributedAttemptsThisMonth)} unattributed attempts excluded`} />
          <Stat label="Provider attempts this month" value={number.format(data.providerAttemptsThisMonth)} detail={`${number.format(data.fallbackAttemptsThisMonth)} fallback attempts`} />
          <Stat label="AI success rate" value={percentage(data.aiSuccessRate)} detail="Successful feature runs" />
          <Stat label="Fallback rate" value={percentage(data.fallbackRate)} detail="Feature runs using fallback" />
        </div>

        <div className="mt-6 grid gap-4 border-t border-border-subtle pt-5 md:grid-cols-2 xl:grid-cols-4">
          <div className="flex items-center gap-3">
            <Clock3 className="h-4 w-4 text-text-tertiary" />
            <div><p className="text-xs text-text-tertiary">Average latency</p><p className="text-sm font-semibold text-text-primary tabular-nums">{data.averageLatencyMs == null ? 'Unavailable' : `${number.format(data.averageLatencyMs)} ms`}</p></div>
          </div>
          <div className="flex items-center gap-3">
            <Activity className="h-4 w-4 text-text-tertiary" />
            <div><p className="text-xs text-text-tertiary">Provider breakdown</p><p className="text-sm font-semibold text-text-primary tabular-nums">{formatProviderBreakdown(data.providerBreakdown)}</p></div>
          </div>
          <div className="flex items-center gap-3">
            <CircleDollarSign className="h-4 w-4 text-text-tertiary" />
            <div><p className="text-xs text-text-tertiary">Estimated AI cost this month</p><p className="text-sm font-semibold text-text-primary tabular-nums">{data.estimatedAiCostUsd == null ? 'Unavailable' : `$${data.estimatedAiCostUsd.toFixed(4)}`}</p></div>
          </div>
          <div className="flex items-center gap-3">
            <BadgeCheck className="h-4 w-4 text-text-tertiary" />
            <div><p className="text-xs text-text-tertiary">Known cost coverage</p><p className="text-sm font-semibold text-text-primary tabular-nums">{percentage(data.knownCostCoverage)}</p></div>
          </div>
        </div>

        <p className="mt-4 text-xs text-text-tertiary">Most-used capability: <span className="font-semibold text-text-secondary">{capabilityLabel(data.mostUsedAiCapability)}</span>. Unknown pricing is excluded from the known-cost total.</p>
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <section className="rounded-2xl border border-border-subtle bg-bg-secondary p-5">
          <div className="flex items-center gap-2">
            <UserRoundCheck className="h-4 w-4 text-accent-cyan" />
            <h2 className="text-sm font-semibold text-text-primary">Recent activity</h2>
          </div>
          <div className="mt-4 divide-y divide-border-subtle">
            {data.recentActivity.map((item, index) => (
              <div key={`${item.type}-${item.occurredAt.toISOString()}-${index}`} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0"><p className="text-sm font-medium text-text-primary">{activityLabels[item.type]}</p><p className="truncate text-xs text-text-tertiary">{item.subject}</p></div>
                <time className="shrink-0 text-xs text-text-secondary" dateTime={item.occurredAt.toISOString()}>{formatAdminDateTime(item.occurredAt)}</time>
              </div>
            ))}
            {data.recentActivity.length === 0 ? <p className="py-8 text-center text-sm text-text-secondary">No trustworthy recent activity records yet.</p> : null}
          </div>
        </section>

        <section className="rounded-2xl border border-border-subtle bg-bg-secondary p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-2"><HeartPulse className="h-4 w-4 text-accent-cyan" /><h2 className="text-sm font-semibold text-text-primary">System health</h2></div>
            <time className="text-xs text-text-tertiary" dateTime={health.checkedAt.toISOString()}>Checked {formatAdminDateTime(health.checkedAt)}</time>
          </div>
          <p className="mt-2 text-xs text-text-tertiary">Reachability is shown only for lightweight live probes; configured providers are not presented as live connections.</p>
          <div className="mt-4 divide-y divide-border-subtle">
            {health.services.map((service) => (
              <div key={service.name} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                <div><p className="text-sm font-medium text-text-primary">{service.name}</p><p className="text-xs text-text-tertiary">{service.detail}</p></div>
                <StatusPill tone={service.status === 'reachable' ? 'success' : service.status === 'configured' ? 'accent' : 'error'}>{service.status === 'reachable' ? 'Reachable' : service.status === 'configured' ? 'Configured' : 'Unavailable'}</StatusPill>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
