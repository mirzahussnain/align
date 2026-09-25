import CareerMarketExplorer from '@/features/career-market/components/CareerMarketExplorer';
import Navbar from '@/shared/components/layout/Navbar';
import PublicPageBackdrop from '@/shared/components/layout/PublicPageBackdrop';

export default function CareerMarketPage() {
  return <main className="relative isolate min-h-screen overflow-hidden bg-hero-gradient"><Navbar /><PublicPageBackdrop variant="insights" /><section className="relative z-10 mx-auto max-w-6xl px-4 pb-16 pt-28 sm:px-6 lg:px-8"><div className="mb-8 max-w-3xl"><p className="text-sm font-semibold uppercase tracking-[0.16em] text-violet-700">UK Career Market</p><h1 className="mt-3 text-balance text-4xl font-semibold tracking-[-0.035em] text-slate-950 sm:text-5xl">A transparent view of current vacancy samples.</h1><p className="mt-4 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">Explore salary disclosure, contract and work-style mix, regions, employers, and current listings for a role. Every view states its sample size, source coverage, freshness, and missing data.</p></div><CareerMarketExplorer /></section></main>;
}
