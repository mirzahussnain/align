import Navbar from '@/shared/components/layout/Navbar';
import PublicPageBackdrop from '@/shared/components/layout/PublicPageBackdrop';
import PublicJobsSearch from '@/features/public-jobs/components/PublicJobsSearch';

export default function JobsLandingPage() {
  return <main className="relative isolate min-h-screen overflow-hidden bg-hero-gradient"><Navbar /><PublicPageBackdrop variant="jobs" /><section className="relative z-10 mx-auto max-w-6xl px-4 pb-16 pt-28 sm:px-6 lg:px-8"><div className="mb-8 max-w-3xl"><h1 className="text-balance text-4xl font-semibold tracking-[-0.035em] text-slate-950 sm:text-5xl">Find current UK vacancies without entering a workflow.</h1><p className="mt-4 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">Search Align’s integrated sources, compare normalized vacancy details, and continue to the original posting. Your public search is not saved as a durable Align job.</p></div><PublicJobsSearch /><p className="mx-auto mt-10 max-w-3xl text-center text-xs leading-5 text-slate-500">Provider results can be partial or delayed. Sponsor-register evidence, where shown elsewhere in Align, does not confirm sponsorship for a particular vacancy or candidate.</p></section></main>;
}
