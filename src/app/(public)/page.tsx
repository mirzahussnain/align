'use client';

import React from 'react';
import Navbar from '@/shared/components/layout/Navbar';
import HeroSection from '@/features/landing-page/sections/HeroSection';
import WorkflowSection from '@/features/landing-page/sections/WorkflowSection';
import CalculatorSection from '@/features/landing-page/sections/CalculatorSection';
import QuoteSection from '@/features/landing-page/sections/QuoteSection';
import HubsSection from '@/features/landing-page/sections/HubsSection';
import CtaSection from '@/features/landing-page/sections/CtaSection';

export default function HomePage() {
  return (
    <main className="min-h-screen bg-bg-primary overflow-hidden">
      <Navbar />
      <HeroSection />
      <WorkflowSection />
      <CalculatorSection />
      <QuoteSection />
      <HubsSection />
      <CtaSection />
    </main>
  );
}
