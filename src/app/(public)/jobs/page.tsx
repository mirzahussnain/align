import Navbar from '@/shared/components/layout/Navbar';
import PublicJobsSearch from '@/features/public-jobs/components/PublicJobsSearch';

type JobsPageProps = {
  searchParams: Promise<{ query?: string | string[]; location?: string | string[] }>;
};

const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] ?? '' : value ?? '';

export default async function JobsLandingPage({ searchParams }: JobsPageProps) {
  const params = await searchParams;
  return (
    <main className="min-h-screen bg-white">
      <Navbar />
      <PublicJobsSearch initialQuery={first(params.query)} initialLocation={first(params.location)} />
    </main>
  );
}
