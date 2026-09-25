import Link from 'next/link';
import { Activity, CircleDollarSign, Clock3, Gauge, Sigma, Workflow } from 'lucide-react';
import {
  AdminPageHeader,
  MetricCard,
  Pagination,
  StatusPill,
  capabilityLabel,
  formatAdminDateTime,
} from '@/features/admin/components/AdminUi';
import { defaultAdminAiUsageFrom, loadAdminAiUsage } from '@/shared/admin/data';

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AdminAiUsagePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const requestedFrom = single(params.from);
  const from = requestedFrom ?? defaultAdminAiUsageFrom();
  const to = single(params.to) ?? '';
  const capability = single(params.capability) ?? '';
  const provider = single(params.provider) ?? '';
  const model = single(params.model) ?? '';
  const successParam = single(params.success) ?? '';
  const success = successParam === 'true' ? true : successParam === 'false' ? false : undefined;
  const page = Number(single(params.page) ?? '1');
  const data = await loadAdminAiUsage({ from, to, capability, provider, model, success, page });
  const number = new Intl.NumberFormat('en-GB');
  const hasFilters = Boolean(requestedFrom || to || capability || provider || model || successParam);
  const percentage = (value: number | null) => value == null ? 'Unavailable' : `${value.toFixed(1)}%`;
  const providerAttempts = (name: string) => data.summary.providerBreakdown[name] ?? 0;

  return (
    <div className="mx-auto max-w-[1800px]">
      <AdminPageHeader
        title="AI usage"
        description="Provider-attempt telemetry for operational monitoring. Prompts and generated content are never included."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <MetricCard icon={Workflow} label="Feature runs" value={number.format(data.summary.featureRuns)} detail={`${number.format(data.summary.unattributedAttempts)} unattributed attempts excluded`} />
        <MetricCard icon={Activity} label="Provider attempts" value={number.format(data.summary.providerAttempts)} detail={`${number.format(data.summary.fallbackAttempts)} fallback attempts`} />
        <MetricCard icon={Gauge} label="AI success rate" value={percentage(data.summary.aiSuccessRate)} detail="Successful feature runs" />
        <MetricCard icon={Gauge} label="Fallback rate" value={percentage(data.summary.fallbackRate)} detail="Feature runs using fallback" />
        <MetricCard icon={Sigma} label="Total tokens" value={data.summary.totalTokens == null ? 'Unavailable' : number.format(data.summary.totalTokens)} detail={data.summary.totalTokens == null ? 'Some providers did not report usage' : 'Reported input and output tokens'} />
        <MetricCard icon={Clock3} label="Average latency" value={data.summary.averageLatencyMs == null ? 'Unavailable' : `${number.format(data.summary.averageLatencyMs)} ms`} detail="Across filtered provider attempts" />
        <MetricCard icon={CircleDollarSign} label="Estimated cost" value={data.summary.estimatedCostUsd == null ? 'Unavailable' : `$${data.summary.estimatedCostUsd.toFixed(4)}`} detail="Known pricing only; unknown pricing excluded" />
        <MetricCard icon={CircleDollarSign} label="Known cost coverage" value={percentage(data.summary.knownCostCoverage)} detail="Token-bearing attempts with configured pricing" />
        <MetricCard icon={Activity} label="Provider breakdown" value={`Gemini ${number.format(providerAttempts('gemini'))}`} detail={`Groq ${number.format(providerAttempts('groq'))} · Fallback ${number.format(data.summary.fallbackAttempts)}`} />
      </div>

      <p className="mt-4 text-xs text-text-tertiary">
        Feature runs are counted only when telemetry has an explicit operation ID. Historical unattributed rows remain visible as provider attempts and are never guessed into feature totals.
      </p>

      <form method="get" className="mt-6 grid gap-3 rounded-2xl border border-border-subtle bg-bg-secondary p-4 sm:grid-cols-2 xl:grid-cols-6">
        <label className="text-xs font-semibold text-text-secondary">From<input type="date" name="from" defaultValue={from} className="mt-1.5 w-full" /></label>
        <label className="text-xs font-semibold text-text-secondary">To<input type="date" name="to" defaultValue={to} className="mt-1.5 w-full" /></label>
        <label className="text-xs font-semibold text-text-secondary">Capability<select name="capability" defaultValue={capability} className="mt-1.5 w-full"><option value="">All capabilities</option>{data.options.capabilities.map((value) => <option key={value} value={value}>{capabilityLabel(value)}</option>)}</select></label>
        <label className="text-xs font-semibold text-text-secondary">Provider<select name="provider" defaultValue={provider} className="mt-1.5 w-full"><option value="">All providers</option>{data.options.providers.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        <label className="text-xs font-semibold text-text-secondary">Model<select name="model" defaultValue={model} className="mt-1.5 w-full"><option value="">All models</option>{data.options.models.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        <label className="text-xs font-semibold text-text-secondary">Outcome<select name="success" defaultValue={successParam} className="mt-1.5 w-full"><option value="">All outcomes</option><option value="true">Successful</option><option value="false">Failed</option></select></label>
        <div className="flex gap-2 sm:col-span-2 xl:col-span-6 xl:justify-end">
          {hasFilters ? <Link href="/admin/ai-usage" className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border-subtle px-4 text-sm font-semibold text-text-secondary hover:border-border-default hover:text-text-primary">Clear filters</Link> : null}
          <button type="submit" className="min-h-11 rounded-xl bg-brand-primary px-5 text-sm font-semibold text-bg-secondary transition-colors hover:bg-brand-primary-hover">Apply filters</button>
        </div>
      </form>

      <section className="mt-4 overflow-hidden rounded-2xl border border-border-subtle bg-bg-secondary">
        <div className="overflow-x-auto">
          <table className="min-w-[1420px] w-full border-collapse text-left text-xs">
            <thead className="bg-bg-tertiary text-text-secondary"><tr>{['Timestamp', 'Capability', 'Provider', 'Model', 'Input tokens', 'Output tokens', 'Latency', 'Outcome', 'Fallback', 'Attempt', 'Estimated cost'].map((heading) => <th key={heading} scope="col" className="px-4 py-3 font-semibold">{heading}</th>)}</tr></thead>
            <tbody className="divide-y divide-border-subtle">
              {data.rows.map((event) => (
                <tr key={event.id} className="hover:bg-bg-primary">
                  <td className="whitespace-nowrap px-4 py-3.5 text-text-secondary">{formatAdminDateTime(event.createdAt)}</td>
                  <td className="px-4 py-3.5 font-semibold text-text-primary">{capabilityLabel(event.capability)}</td>
                  <td className="px-4 py-3.5 capitalize text-text-secondary">{event.provider}</td>
                  <td className="px-4 py-3.5 font-mono text-[11px] text-text-secondary">{event.model}</td>
                  <td className="px-4 py-3.5 text-text-primary tabular-nums">{event.inputTokens == null ? 'Unavailable' : number.format(event.inputTokens)}</td>
                  <td className="px-4 py-3.5 text-text-primary tabular-nums">{event.outputTokens == null ? 'Unavailable' : number.format(event.outputTokens)}</td>
                  <td className="px-4 py-3.5 text-text-primary tabular-nums">{number.format(event.latencyMs)} ms</td>
                  <td className="px-4 py-3.5"><StatusPill tone={event.success ? 'success' : 'error'}>{event.success ? 'Success' : event.errorCode ?? 'Failed'}</StatusPill></td>
                  <td className="px-4 py-3.5"><StatusPill tone={event.fallbackUsed ? 'warning' : 'neutral'}>{event.fallbackUsed ? 'Used' : 'No'}</StatusPill></td>
                  <td className="px-4 py-3.5 text-text-primary tabular-nums">{event.attemptNumber}</td>
                  <td className="px-4 py-3.5 text-text-primary tabular-nums">{event.estimatedCostUsd == null ? 'Unavailable' : `$${event.estimatedCostUsd.toFixed(6)}`}</td>
                </tr>
              ))}
              {data.rows.length === 0 ? <tr><td colSpan={11} className="px-4 py-12 text-center text-sm text-text-secondary">No AI usage events match these filters.</td></tr> : null}
            </tbody>
          </table>
        </div>
        <Pagination
          basePath="/admin/ai-usage"
          page={data.page}
          totalPages={data.totalPages}
          total={data.total}
          params={{ from: from || undefined, to: to || undefined, capability: capability || undefined, provider: provider || undefined, model: model || undefined, success: successParam || undefined }}
        />
      </section>
    </div>
  );
}
