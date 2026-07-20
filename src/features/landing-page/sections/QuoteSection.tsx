'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { QUOTE_DATA } from '@/shared/constants/quote';

export default function QuoteSection() {
  return (
    <section className="relative -mt-[40px] md:-mt-[220px] bg-transparent select-none pt-0 pb-12 overflow-hidden z-30">
      {/* SVG Noise Texture Filter & Wave Gradients definition */}
      <svg className="absolute w-0 h-0 pointer-events-none" width="0" height="0">
        <defs>
          <filter id="noiseFilter">
            <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" />
            <feColorMatrix type="matrix" values="0 0 0 0 0   0 0 0 0 0   0 0 0 0 0  0 0 0 0.08 0" />
          </filter>
          <linearGradient id="glass-wave-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(248, 250, 252, 0)" />
            <stop offset="100%" stopColor="rgba(224, 242, 254, 0.90)" />
          </linearGradient>
          <linearGradient id="glass-wave-grad-bottom" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(248, 250, 252, 0)" />
            <stop offset="100%" stopColor="rgba(186, 230, 253, 0.75)" />
          </linearGradient>
        </defs>
      </svg>

      {/* Top Glass Wave Transition */}
      <svg
        viewBox="0 0 1440 220"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-auto max-h-[160px] md:max-h-[220px] block -mb-1"
      >
        <path
          d="M0 60C360 160 540 10 900 120C1260 230 1380 90 1440 100V220H0V60Z"
          fill="url(#glass-wave-grad)"
        />
      </svg>

      {/* Soft Grey/Blue Glassmorphic Quote Block with Noise Texture */}
      <div className="relative bg-gradient-to-b from-sky-100/90 via-slate-200/80 to-sky-200/75 py-12 md:py-20 px-4 sm:px-6 lg:px-8 text-center border-y border-slate-300/60 shadow-[inset_0_1px_1px_rgba(255,255,255,0.75),_0_8px_32px_rgba(15,23,42,0.08)] backdrop-blur-xl z-10">

        {/* Subtle Noise Texture Overlay */}
        <div className="absolute inset-0 pointer-events-none opacity-100 z-0">
          <svg className="w-full h-full">
            <rect width="100%" height="100%" filter="url(#noiseFilter)" fill="transparent" />
          </svg>
        </div>

        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.7, ease: 'easeOut' }}
          className="max-w-4xl mx-auto relative z-10"
        >
          <h3 className="text-xl sm:text-2xl md:text-[1.75rem] font-medium leading-[1.4] tracking-[-0.01em] text-[#0f172a] italic">
            &quot;{QUOTE_DATA.text}&quot;
          </h3>
          <p className="text-[11px] md:text-[12px] font-semibold tracking-wider text-slate-500 uppercase mt-6">
            {QUOTE_DATA.subtext}
          </p>
        </motion.div>
      </div>

      {/* Bottom Glass Wave Transition */}
      <svg
        viewBox="0 0 1440 120"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-auto max-h-[100px] rotate-180 -mt-1 block"
      >
        <path
          d="M0 60C360 120 720 0 1080 90C1260 135 1380 45 1440 30V120H0V60Z"
          fill="url(#glass-wave-grad-bottom)"
        />
      </svg>
    </section>
  );
}
