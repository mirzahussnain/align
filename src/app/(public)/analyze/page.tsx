'use client';

import Navbar from '@/shared/components/layout/Navbar';
import PublicPageBackdrop from '@/shared/components/layout/PublicPageBackdrop';
import AnalyzeAuthGate from '@/features/cv-analyzer/components/AnalyzeAuthGate';

export default function AnalyzePage() {
  return (
    <main className="relative isolate min-h-screen overflow-hidden bg-hero-gradient pb-20">
      <Navbar />
      <PublicPageBackdrop variant="analyze" />
      <section className="relative z-10 pt-24 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto mt-10">
        <AnalyzeAuthGate />
      </section>
    </main>
  );
}
