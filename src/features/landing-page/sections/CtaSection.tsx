'use client';

import React from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { FileText, Search, ArrowRight } from 'lucide-react';
import { CTA_DATA } from '@/shared/constants/cta';

export default function CtaSection() {
  return (
    <section
      className="relative text-white min-h-[60vh] md:min-h-[70vh] flex flex-col justify-center py-24 px-4 sm:px-6 lg:px-8 z-20 overflow-hidden"
      style={{
        backgroundImage: "url('/assets/images/cta_bg.png')",
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }}
    >
      {/* Dark Ambient Overlay & Glassmorphic Blur to ensure text contrast */}
      <div className="absolute inset-0 bg-slate-950/50 backdrop-blur-[2px] -z-10" />


      {/* Bottom Blend-in Gradient Overlay (transitions to Footer / #f8fafc) */}
      <div className="absolute bottom-0 left-0 right-0 h-36 bg-gradient-to-t from-[#f8fafc] to-transparent pointer-events-none z-10" />

      <div className="max-w-4xl mx-auto text-center relative z-20">
        <motion.div
          initial={{ opacity: 0, y: 35 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        >
          {/* Main Title */}
          <h2 
            className="text-[2.5rem] sm:text-5xl md:text-[3.5rem] font-medium text-white tracking-[-0.03em] leading-[1.1] mb-6"
            style={{ textShadow: '0 4px 16px rgba(0, 0, 0, 0.45)' }}
          >
            {CTA_DATA.title}
          </h2>

          {/* Subtitle */}
          <p 
            className="text-[15px] md:text-[17px] text-slate-200/90 leading-relaxed mb-10 max-w-2xl mx-auto font-medium"
            style={{ textShadow: '0 2px 8px rgba(0, 0, 0, 0.35)' }}
          >
            {CTA_DATA.subtitle}
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-wrap items-center justify-center gap-4">
            <Link
              href={CTA_DATA.primaryButton.href}
              className="bg-[#0ea5e9] hover:bg-[#0284c7] text-white rounded-full px-8 py-4 text-xs sm:text-sm font-bold flex items-center gap-2 hover:shadow-[0_0_25px_rgba(14,165,233,0.45)] transition-all duration-300 transform hover:-translate-y-0.5"
            >
              <FileText size={16} />
              <span>{CTA_DATA.primaryButton.text}</span>
              <ArrowRight size={14} className="ml-1" />
            </Link>
            <Link
              href={CTA_DATA.secondaryButton.href}
              className="bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-full px-8 py-4 text-xs sm:text-sm font-bold flex items-center gap-2 hover:shadow-[0_0_25px_rgba(255,255,255,0.15)] transition-all duration-300 transform hover:-translate-y-0.5 backdrop-blur-md"
            >
              <Search size={16} />
              <span>{CTA_DATA.secondaryButton.text}</span>
            </Link>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
