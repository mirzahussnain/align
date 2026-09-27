import CareerMarketExplorer from '@/features/career-market/components/CareerMarketExplorer';
import Navbar from '@/shared/components/layout/Navbar';
import ResourcePageBackdrop from '@/shared/components/ui/ResourcePageBackdrop';

export default function CareerMarketPage() {
  return (
    <main className="relative min-h-screen overflow-x-hidden bg-slate-100">
      <Navbar />
      <ResourcePageBackdrop variant="market" />
      <CareerMarketExplorer />
    </main>
  );
}
