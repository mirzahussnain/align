import {
  Activity,
  BadgeCheck,
  CircleDollarSign,
  Sparkles,
  UserRoundPlus,
  Users,
} from 'lucide-react';
import { AdminPageHeader, MetricCard, capabilityLabel } from '@/features/admin/components/AdminUi';
import { loadAdminOverview } from '@/shared/admin/data';

export default async function AdminOverviewPage() {
  const data = await loadAdminOverview();
  const number = new Intl.NumberFormat('en-GB');

  return (
    <div className="mx-auto max-w-[1440px]">
      <AdminPageHeader
        title="Overview"
        description="A concise operational view of users, access, and AI provider activity."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <MetricCard
          icon={Users}
          label="Total users"
          value={number.format(data.totalUsers)}
          detail={`${number.format(data.newUsersThisMonth)} new this month`}
        />
        <MetricCard
          icon={UserRoundPlus}
          label="Plan mix"
          value={`${number.format(data.proUsers)} Pro`}
          detail={`${number.format(data.freeUsers)} Free users`}
        />
        <MetricCard
          icon={BadgeCheck}
          label="Verification"
          value={`${number.format(data.verifiedUsers)} verified`}
          detail={`${number.format(data.unverifiedUsers)} unverified users`}
        />
        <MetricCard
          icon={Activity}
          label="AI operations this month"
          value={number.format(data.aiOperationsThisMonth)}
          detail={`${number.format(data.successfulAiOperations)} successful · ${number.format(data.failedAiOperations)} failed`}
        />
        <MetricCard
          icon={CircleDollarSign}
          label="Estimated AI cost this month"
          value={
            data.estimatedAiCostUsd == null
              ? 'Unavailable'
              : `$${data.estimatedAiCostUsd.toFixed(4)}`
          }
          detail={
            data.estimatedAiCostUsd == null
              ? 'One or more operations have unknown pricing'
              : 'Based on reported tokens and configured pricing'
          }
        />
        <MetricCard
          icon={Sparkles}
          label="Most-used AI capability"
          value={capabilityLabel(data.mostUsedAiCapability)}
          detail="Highest provider-attempt volume this month"
        />
      </div>

      <section className="mt-6 rounded-2xl border border-border-subtle bg-bg-secondary p-5">
        <h2 className="text-sm font-semibold text-text-primary">Scope of this view</h2>
        <p className="mt-2 max-w-3xl text-sm text-text-secondary">
          AI operation figures represent provider attempts recorded by Align telemetry. A fallback
          request can therefore contribute more than one attempt. Unknown provider pricing remains
          unavailable rather than being estimated.
        </p>
      </section>
    </div>
  );
}
