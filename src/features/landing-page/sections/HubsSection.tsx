'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { FileSearch, Briefcase, Shield, TrendingUp, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';

const MODULES = [
  {
    icon: FileSearch,
    title: 'CV Readiness Engine',
    description: 'Score your CV against UK hiring standards for your occupation — 8-dimension parsing, evidence coverage, and credential checks.',
    href: '/analyze',
    color: 'from-[hsl(250,90%,65%)] to-[hsl(280,85%,55%)]',
    actionText: 'Analyze CV',
  },
  {
    icon: Briefcase,
    title: 'UK Job Boards',
    description: 'Search Reed, Adzuna & Jooble in one place with real-time visa sponsorship detection.',
    href: '/jobs',
    color: 'from-[hsl(170,80%,50%)] to-[hsl(190,75%,45%)]',
    actionText: 'Search Jobs',
  },
  {
    icon: Shield,
    title: 'Immigration Hub',
    description: '90,000+ official visa sponsors searchable. Explore KTP opportunities and visa routes.',
    href: '/immigration',
    color: 'from-[hsl(40,95%,55%)] to-[hsl(25,90%,50%)]',
    actionText: 'Explore Sponsors',
  },
  {
    icon: TrendingUp,
    title: 'Tech Trends',
    description: 'UK tech stack dominance, salary bands, and regional demand intelligence.',
    href: '/trends',
    color: 'from-[hsl(340,80%,55%)] to-[hsl(310,75%,50%)]',
    actionText: 'View Trends',
  },
];

const INTEGRATIONS = [
  { name: 'Adzuna API', image: '/assets/api-integrations/Adzuna.png', detail: 'Live Job Data' },
  { name: 'Reed API', image: '/assets/api-integrations/Reed.jpeg', detail: 'UK Placements' },
  { name: 'Jooble API', image: '/assets/api-integrations/Jooble.png', detail: 'Aggregated Lists' },
  { name: 'GOV.UK Register', image: '/assets/api-integrations/GovUk.png', detail: 'Visa Sponsors' },
];

export default function HubsSection() {
  return (
    <section
      id="features"
      className="relative py-24 md:py-32 px-4 sm:px-6 lg:px-8 bg-bg-primary bg-cosmic-flare z-10 border-t border-border-subtle/40 scroll-mt-24"
    >

      {/* Core Star Flare visuals */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center z-10">
        <div className="w-1 h-1 bg-white rounded-full [box-shadow:0_0_20px_4px_#fff,0_0_40px_10px_hsla(199,89%,48%,0.8),0_0_80px_20px_hsla(199,89%,48%,0.4)] relative">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1px] bg-[linear-gradient(to_bottom,transparent,hsla(199,89%,48%,0.5)_45%,#fff_50%,hsla(199,89%,48%,0.5)_55%,transparent)] h-[600px] pointer-events-none" />
        </div>
      </div>

      <div className="max-w-7xl mx-auto relative z-20">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6 }}
          className="text-center mb-20"
        >
          <h2 className="text-[2.5rem] sm:text-5xl md:text-[3.5rem] font-medium text-[#1e293b] tracking-[-0.03em] leading-[1.1] mt-4">
            Explore Our Core Hubs
          </h2>
          <p className="text-[15px] md:text-[16px] text-slate-500 leading-relaxed mt-6 max-w-2xl mx-auto font-medium">
            Navigate between ATS analysis, visa sponsor registries, dynamic salary dashboards, and job boards.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {MODULES.map((module) => {
            const Icon = module.icon;
            return (
              <Link key={module.href} href={module.href}>
                <div className="glass-card p-6 h-full flex flex-col justify-between group hover:translate-y-[-8px] hover:border-accent-cyan/40 hover:shadow-[0_20px_40px_rgba(15,23,42,0.06),_0_0_25px_rgba(14,165,233,0.1)] transition-all duration-300 ease-out">
                  <div>
                    <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${module.color} flex items-center justify-center mb-5 group-hover:scale-110 transition-transform duration-300 shadow-lg`}>
                      <Icon size={22} className="text-white" />
                    </div>
                    <h3 className="text-base font-bold text-text-primary mb-3">{module.title}</h3>
                    <p className="text-xs text-text-tertiary leading-relaxed mb-6">{module.description}</p>
                  </div>
                  <span className="text-xs text-accent-cyan font-semibold flex items-center gap-1 group-hover:gap-2 transition-all mt-auto">
                    {module.actionText} <ArrowRight size={14} />
                  </span>
                </div>
              </Link>
            );
          })}
        </div>

        {/* Integration Badge list - Active Marquee */}
        <div className="mt-24 pt-12 border-t border-border-subtle/50 flex flex-col items-start gap-8 relative w-full group overflow-hidden">
          {/* Static Heading */}
          <div className="relative z-20">
            <span className="text-xs uppercase font-bold tracking-wider text-text-tertiary">Data Integrations:</span>
          </div>

          {/* Marquee Container */}
          <div className="relative w-full flex overflow-hidden hover:[&>div]:[animation-play-state:paused]">
            {/* Left/Right Fade Gradients for smooth entering/exiting */}
            <div className="absolute left-0 top-0 bottom-0 w-16 bg-gradient-to-r from-bg-primary to-transparent z-10 pointer-events-none" />
            <div className="absolute right-0 top-0 bottom-0 w-20 md:w-32 bg-gradient-to-l from-bg-primary to-transparent z-10 pointer-events-none" />

            {[...Array(2)].map((_, arrayIdx) => (
              <motion.div 
                key={`track-${arrayIdx}`} 
                className="flex w-max min-w-full shrink-0 items-center justify-around py-2"
                animate={{ x: ["0%", "-100%"] }}
                transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
              >
                {INTEGRATIONS.map((integ) => (
                  <div key={integ.name} className="flex flex-col items-center justify-center shrink-0 px-6 group/item cursor-default">
                    <div className="w-28 sm:w-32 h-10 sm:h-12 mb-2 relative flex items-center justify-center grayscale opacity-80 group-hover/item:grayscale-0 group-hover/item:opacity-100 transition-all duration-300">
                      <img 
                        src={integ.image} 
                        alt={integ.name} 
                        className="w-full h-full object-contain"
                      />
                    </div>
                    <span className="text-[10px] text-slate-400 group-hover/item:text-accent-cyan font-semibold tracking-wide uppercase mt-1 text-center transition-colors duration-300">{integ.detail}</span>
                  </div>
                ))}
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
