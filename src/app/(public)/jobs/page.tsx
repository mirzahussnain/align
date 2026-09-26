import Navbar from '@/shared/components/layout/Navbar';
import PublicJobsSearch from '@/features/public-jobs/components/PublicJobsSearch';
import ResourcePageBackdrop from '@/shared/components/ui/ResourcePageBackdrop';

type JobsPageProps = {
  searchParams: Promise<{ query?: string | string[]; location?: string | string[] }>;
};

const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] ?? '' : value ?? '';

export default async function JobsLandingPage({ searchParams }: JobsPageProps) {
  const params = await searchParams;
  return (
    <main className="relative min-h-screen overflow-hidden bg-slate-100">
      <Navbar />
      <ResourcePageBackdrop variant="jobs" />
      <div className="relative">
        <PublicJobsSearch initialQuery={first(params.query)} initialLocation={first(params.location)} />
      </div>
    </main>
  );
}
