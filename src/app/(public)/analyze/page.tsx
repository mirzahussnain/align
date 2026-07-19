'use client';

import Navbar from '@/shared/components/layout/Navbar';
import AnalyzeAuthGate from '@/features/cv-analyzer/components/AnalyzeAuthGate';

export default function AnalyzePage() {
  return (
    <main className="min-h-screen bg-hero-gradient pb-20">
      <Navbar />
      <section className="pt-24 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto mt-10">
        <AnalyzeAuthGate />
      </section>
    </main>
  );
}
