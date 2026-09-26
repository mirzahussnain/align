import CareerMarketExplorer from '@/features/career-market/components/CareerMarketExplorer';
import Navbar from '@/shared/components/layout/Navbar';
import ResourcePageBackdrop from '@/shared/components/ui/ResourcePageBackdrop';

export default function CareerMarketPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-slate-100">
      <Navbar />
      <ResourcePageBackdrop variant="market" />
      <section className="relative mx-auto max-w-7xl px-4 pb-16 pt-28 sm:px-6 lg:px-8">
        <header className="mb-7 max-w-3xl"><h1 className="text-3xl font-semibold tracking-[-0.035em] text-slate-950 sm:text-4xl">UK Career Market</h1><p className="mt-3 text-xl font-medium tracking-[-0.02em] text-slate-800 sm:text-2xl">Explore the market for your role.</p><p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">Compare current advertised pay, vacancy mix, employers, regions, work styles and opportunities from Align&apos;s integrated job sources.</p></header>
        <CareerMarketExplorer />
      </section>
    </main>
  );
}
