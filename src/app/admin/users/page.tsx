import Link from 'next/link';
import { Search } from 'lucide-react';
import {
  AdminPageHeader,
  Pagination,
  StatusPill,
  formatAdminDate,
} from '@/features/admin/components/AdminUi';
import { loadAdminUsers } from '@/shared/admin/data';

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const search = single(params.search)?.trim() ?? '';
  const page = Number(single(params.page) ?? '1');
  const data = await loadAdminUsers({ search, page });

  return (
    <div className="mx-auto max-w-[1600px]">
      <AdminPageHeader
        title="Users"
        description="Account state and product activity without CV contents or other private profile data."
      />

      <form method="get" className="mb-4 flex flex-col gap-3 sm:flex-row">
        <label className="relative block min-w-0 flex-1 sm:max-w-md">
          <span className="sr-only">Search users by email</span>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
          <input
            type="search"
            name="search"
            defaultValue={search}
            placeholder="Search by email"
            className="w-full !pl-10"
          />
        </label>
        <button type="submit" className="min-h-11 rounded-xl bg-brand-primary px-5 text-sm font-semibold text-bg-secondary transition-colors hover:bg-brand-primary-hover">
          Search
        </button>
        {search ? (
          <Link href="/admin/users" className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border-subtle px-4 text-sm font-semibold text-text-secondary hover:border-border-default hover:text-text-primary">
            Clear
          </Link>
        ) : null}
      </form>

      <section className="overflow-hidden rounded-2xl border border-border-subtle bg-bg-secondary">
        <div className="overflow-x-auto">
          <table className="min-w-[1120px] w-full border-collapse text-left text-xs">
            <thead className="bg-bg-tertiary text-text-secondary">
              <tr>
                {['Email', 'Signed up', 'Verified', 'Plan', 'Onboarding', 'Stored CVs', 'ATS analyses', 'Job Matches', 'Last activity'].map((heading) => (
                  <th key={heading} scope="col" className="px-4 py-3 font-semibold">{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {data.rows.map((user) => (
                <tr key={user.id} className="hover:bg-bg-primary">
                  <td className="max-w-64 truncate px-4 py-3.5 font-semibold text-text-primary">{user.email}</td>
                  <td className="whitespace-nowrap px-4 py-3.5 text-text-secondary">{formatAdminDate(user.signupDate)}</td>
                  <td className="px-4 py-3.5">
                    <StatusPill tone={user.emailVerified ? 'success' : 'warning'}>{user.emailVerified ? 'Verified' : 'Unverified'}</StatusPill>
                  </td>
                  <td className="px-4 py-3.5"><StatusPill tone={user.plan === 'PRO' ? 'accent' : 'neutral'}>{user.plan === 'PRO' ? 'Pro' : 'Free'}</StatusPill></td>
                  <td className="px-4 py-3.5 text-text-secondary">{user.onboardingState}</td>
                  <td className="px-4 py-3.5 text-text-primary tabular-nums">{user.storedCvCount}</td>
                  <td className="px-4 py-3.5 text-text-primary tabular-nums">{user.analysisCount}</td>
                  <td className="px-4 py-3.5 text-text-primary tabular-nums">{user.jobMatchCount}</td>
                  <td className="whitespace-nowrap px-4 py-3.5 text-text-secondary">{formatAdminDate(user.lastActivityAt)}</td>
                </tr>
              ))}
              {data.rows.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-12 text-center text-sm text-text-secondary">No users match this search.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <Pagination
          basePath="/admin/users"
          page={data.page}
          totalPages={data.totalPages}
          total={data.total}
          params={{ search: search || undefined }}
        />
      </section>
    </div>
  );
}
