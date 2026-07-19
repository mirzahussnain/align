'use client';

import React from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { Globe, Sparkles } from 'lucide-react';
import HeroCarousel from '../components/HeroCarousel';

export default function HeroSection() {

  return (
    <>
      {/* SVG ClipPath Definition for the floating hero chevron */}
      <svg className="absolute w-0 h-0 pointer-events-none" width="0" height="0">
        <defs>
          <clipPath id="hero-clip" clipPathUnits="objectBoundingBox">
            <path d="M 0,0 L 1,0 L 1,0.7 Q 1,0.76 0.92,0.8 L 0.54,0.98 Q 0.5,1.0 0.46,0.98 L 0.08,0.8 Q 0,0.76 0,0.7 Z" />
          </clipPath>
        </defs>
      </svg>

      <div className="relative">
        <section className="relative w-full rounded-b-[32px] overflow-hidden pt-28 pb-32 md:pb-44 z-10 text-center select-none bg-hero-composite bg-no-repeat bg-cover hero-chevron">
          <div className="absolute bottom-0 left-0 right-0 h-52 md:h-60 bg-gradient-to-t from-sky-600/60 via-sky-500/35 to-transparent pointer-events-none z-10" />
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-20">

            {/* Main Hero Header */}
            <div className="max-w-4xl mx-auto text-white mb-8">
              <motion.h1
                initial={{ opacity: 0, y: 25 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
                className="text-4xl sm:text-5xl lg:text-7xl font-extrabold mb-4 leading-tight tracking-tight text-white"
                style={{ textShadow: '0 4px 12px rgba(0, 0, 0, 0.35)' }}
              >
                The rise of <span className="text-white/60 font-light italic">your tech career</span>
                <br />
                begins here
              </motion.h1>

              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.6, delay: 0.15 }}
                className="text-sm md:text-base text-white/90 max-w-xl sm:max-w-2xl mx-auto mb-8 leading-relaxed font-semibold animate-pulse"
              >
                A turnkey way to calibrate your CV, search aggregated job boards, and discover UK tech placements with visa sponsorship intelligence.
              </motion.p>

              {/* QClay Style Capsule Buttons */}
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.3 }}
                className="flex flex-wrap items-center justify-center gap-4"
              >
                <Link
                  href="/analyze"
                  className="bg-neutral-950 text-white rounded-full px-6 py-3 border border-white/10 hover:bg-neutral-900 hover:shadow-2xl transition-all duration-300 text-xs font-bold flex items-center gap-2"
                >
                  <Globe size={14} className="text-white" />
                  <span>Start Free Analysis</span>
                </Link>
                <Link
                  href="/jobs"
                  className="bg-sky-500 hover:bg-sky-600 text-white rounded-full px-6 py-3 border border-white/10 hover:shadow-2xl transition-all duration-300 text-xs font-bold flex items-center gap-2"
                >
                  <Sparkles size={14} className="text-white animate-pulse" />
                  <span>Search Tech Jobs</span>
                </Link>
              </motion.div>
            </div>

            {/* Desktop 3D Curved Carousel component */}
            <div className="hidden md:block mt-6 md:mt-10">
              <HeroCarousel />
            </div>

            {/* Mobile Simplified Single Card Preview */}
            <div className="md:hidden relative w-full h-[280px] flex items-center justify-center mt-6 z-10">
              <div className="w-[250px] h-[270px] bg-neutral-950/90 border border-white/25 rounded-2xl p-5 flex flex-col justify-between text-left text-white shadow-2xl">
                <div>
                  <span className="text-[9px] text-accent-cyan uppercase font-bold tracking-wider">ATS CV Calibration</span>
                  <h3 className="text-sm font-bold mt-1">Calibrate your tech profile effortlessly</h3>
                </div>
                <div className="my-auto py-2">
                  <span className="text-[9px] text-white/50 uppercase font-bold">Estimated Compensation</span>
                  <p className="text-xl font-black text-white">£65,000.00</p>
                  <span className="text-[9px] text-accent-cyan font-bold block">Average Mid-Level Dev (London)</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-bold pt-2 border-t border-white/10">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                  Live UK API Verified
                </div>
              </div>
            </div>

          </div>

        </section>

        {/* Social Proof/Stars footer positioned outside the clipped section relative to the parent wrapper */}
        <div className="absolute bottom-[50px] left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-0.5 pointer-events-none">
          <p className="text-xs font-semibold text-white/80 select-none">Rated 4.9/5 by 2700+ candidates</p>
          <div className="flex gap-0.5 text-amber-300 text-[10px] select-none">
            <span>★</span><span>★</span><span>★</span><span>★</span><span>★</span>
          </div>

          {/* Custom Pixel-Grid Chevron Scroll Indicator */}
          <div className="mt-1 flex flex-col items-center select-none">
            <svg
              width="21"
              height="31"
              viewBox="0 0 21 31"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              {/* Row 1 */}
              <motion.rect x="9" y="0" width="3" height="3" fill="white" animate={{ opacity: [0.15, 1, 0.15, 0.15] }} transition={{ duration: 1.4, repeat: Infinity, times: [0, 0.2, 0.4, 1], delay: 0 }} />

              {/* Row 2 */}
              <motion.rect x="6" y="5" width="3" height="3" fill="white" animate={{ opacity: [0.15, 1, 0.15, 0.15] }} transition={{ duration: 1.4, repeat: Infinity, times: [0, 0.2, 0.4, 1], delay: 0.1 }} />
              <motion.rect x="12" y="5" width="3" height="3" fill="white" animate={{ opacity: [0.15, 1, 0.15, 0.15] }} transition={{ duration: 1.4, repeat: Infinity, times: [0, 0.2, 0.4, 1], delay: 0.1 }} />

              {/* Row 3 */}
              <motion.rect x="3" y="10" width="3" height="3" fill="white" animate={{ opacity: [0.15, 1, 0.15, 0.15] }} transition={{ duration: 1.4, repeat: Infinity, times: [0, 0.2, 0.4, 1], delay: 0.2 }} />
              <motion.rect x="6" y="10" width="3" height="3" fill="white" animate={{ opacity: [0.15, 1, 0.15, 0.15] }} transition={{ duration: 1.4, repeat: Infinity, times: [0, 0.2, 0.4, 1], delay: 0.2 }} />
              <motion.rect x="12" y="10" width="3" height="3" fill="white" animate={{ opacity: [0.15, 1, 0.15, 0.15] }} transition={{ duration: 1.4, repeat: Infinity, times: [0, 0.2, 0.4, 1], delay: 0.2 }} />
              <motion.rect x="15" y="10" width="3" height="3" fill="white" animate={{ opacity: [0.15, 1, 0.15, 0.15] }} transition={{ duration: 1.4, repeat: Infinity, times: [0, 0.2, 0.4, 1], delay: 0.2 }} />

              {/* Row 4 */}
              <motion.rect x="9" y="15" width="3" height="3" fill="white" animate={{ opacity: [0.15, 1, 0.15, 0.15] }} transition={{ duration: 1.4, repeat: Infinity, times: [0, 0.2, 0.4, 1], delay: 0.3 }} />

              {/* Row 5 */}
              <motion.rect x="6" y="20" width="3" height="3" fill="white" animate={{ opacity: [0.15, 1, 0.15, 0.15] }} transition={{ duration: 1.4, repeat: Infinity, times: [0, 0.2, 0.4, 1], delay: 0.4 }} />
              <motion.rect x="12" y="20" width="3" height="3" fill="white" animate={{ opacity: [0.15, 1, 0.15, 0.15] }} transition={{ duration: 1.4, repeat: Infinity, times: [0, 0.2, 0.4, 1], delay: 0.4 }} />

              {/* Row 6 */}
              <motion.rect x="3" y="25" width="3" height="3" fill="white" animate={{ opacity: [0.15, 1, 0.15, 0.15] }} transition={{ duration: 1.4, repeat: Infinity, times: [0, 0.2, 0.4, 1], delay: 0.5 }} />
              <motion.rect x="6" y="25" width="3" height="3" fill="white" animate={{ opacity: [0.15, 1, 0.15, 0.15] }} transition={{ duration: 1.4, repeat: Infinity, times: [0, 0.2, 0.4, 1], delay: 0.5 }} />
              <motion.rect x="12" y="25" width="3" height="3" fill="white" animate={{ opacity: [0.15, 1, 0.15, 0.15] }} transition={{ duration: 1.4, repeat: Infinity, times: [0, 0.2, 0.4, 1], delay: 0.5 }} />
              <motion.rect x="15" y="25" width="3" height="3" fill="white" animate={{ opacity: [0.15, 1, 0.15, 0.15] }} transition={{ duration: 1.4, repeat: Infinity, times: [0, 0.2, 0.4, 1], delay: 0.5 }} />

              {/* Row 7 */}
              <motion.rect x="9" y="30" width="3" height="3" fill="white" animate={{ opacity: [0.15, 1, 0.15, 0.15] }} transition={{ duration: 1.4, repeat: Infinity, times: [0, 0.2, 0.4, 1], delay: 0.6 }} />
            </svg>
          </div>
        </div>
      </div>
    </>
  );
}
