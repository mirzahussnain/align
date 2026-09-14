'use client';

import { useState } from 'react';
import { Award, ChevronRight, TrendingUp } from 'lucide-react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { cn } from '@/shared/utils/cn';

export default function CalculatorSection() {
  const [experience, setExperience] = useState(2);
  const [atsScore, setAtsScore] = useState(75);

  // Dynamic calculations for salary estimator
  const baseSalaryLondon = 38000 + experience * 6500 + (atsScore - 50) * 450;
  const baseSalaryRegional = 29000 + experience * 5000 + (atsScore - 50) * 350;
  const placementChance = atsScore >= 85 ? 'Excellent' : atsScore >= 70 ? 'Strong' : atsScore >= 50 ? 'Moderate' : 'Critical Action Required';
  const placementColor = atsScore >= 85 ? 'text-success' : atsScore >= 70 ? 'text-[#0ea5e9]' : atsScore >= 50 ? 'text-warning' : 'text-error';

  return (
    <section
      className="relative text-neutral-900 min-h-screen flex flex-col justify-center py-20 px-4 sm:px-6 lg:px-8 z-20 overflow-hidden"
      style={{
        backgroundImage: "url('/assets/images/calculator_bg.png')",
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',

      }}
    >
      {/* Ambient overlay to ensure contrast & text legibility */}
      <div className="absolute inset-0 bg-white/10 backdrop-blur-[1px] -z-10" />

      {/* Blend-in Top Gradient Overlay to transition smoothly from the previous section */}
      <div className="absolute top-0 left-0 right-0 h-40 bg-gradient-to-b from-[#fafafa] to-transparent pointer-events-none z-10" />

      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16 max-w-3xl mx-auto"
        >
          <h2 className="text-[2.5rem] sm:text-5xl md:text-[3.5rem] font-medium text-[#1e293b] tracking-[-0.03em] leading-[1.1] mt-4 flex items-center justify-center gap-3 flex-wrap">
            See your growth potential
            <TrendingUp size={38} className="text-slate-600 animate-pulse" />
          </h2>
          <p className="text-[15px] md:text-[16px] text-slate-500 leading-relaxed mt-6 max-w-2xl mx-auto font-medium">
            Adjust your experience and ATS score to estimate your UK salary expectation and visa placement probability instantly.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          {/* Sliders Block */}
          <div className="space-y-8 bg-neutral-50 p-6 sm:p-8 rounded-3xl border border-neutral-100 shadow-sm">
            <h3 className="text-lg font-bold text-neutral-900 mb-2">Configure Profile</h3>

            {/* Sliders experience */}
            <div className="space-y-2">
              <div className="flex justify-between items-center text-sm font-semibold text-neutral-700">
                <span>Years of Experience</span>
                <span className="font-mono bg-neutral-200/50 text-neutral-900 px-2 py-0.5 rounded text-xs">
                  {experience} {experience === 1 ? 'Year' : 'Years'}
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="10"
                step="1"
                value={experience}
                onChange={(e) => setExperience(parseInt(e.target.value))}
                className="w-full h-2 rounded-lg appearance-none cursor-pointer outline-none bg-slate-200/80
                  [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 
                  [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border-2 
                  [&::-webkit-slider-thumb]:border-sky-500 [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:hover:scale-110 
                  [&::-webkit-slider-thumb]:transition-all
                  [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full 
                  [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-sky-500 
                  [&::-moz-range-thumb]:shadow-md"
                style={{
                  background: `linear-gradient(to right, #0ea5e9 ${experience * 10}%, #e2e8f0 ${experience * 10}%)`
                }}
              />
            </div>

            {/* Sliders ATS Score */}
            <div className="space-y-2">
              <div className="flex justify-between items-center text-sm font-semibold text-neutral-700">
                <span>Target ATS Score</span>
                <span className="font-mono bg-neutral-200/50 text-neutral-900 px-2 py-0.5 rounded text-xs">
                  {atsScore}%
                </span>
              </div>
              <input
                type="range"
                min="30"
                max="100"
                step="5"
                value={atsScore}
                onChange={(e) => setAtsScore(parseInt(e.target.value))}
                className="w-full h-2 rounded-lg appearance-none cursor-pointer outline-none bg-slate-200/80
                  [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 
                  [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border-2 
                  [&::-webkit-slider-thumb]:border-accent-cyan [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:hover:scale-110 
                  [&::-webkit-slider-thumb]:transition-all
                  [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full 
                  [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-accent-cyan 
                  [&::-moz-range-thumb]:shadow-md"
                style={{
                  background: `linear-gradient(to right, #0ea5e9 ${((atsScore - 30) / 70) * 100}%, #e2e8f0 ${((atsScore - 30) / 70) * 100}%)`
                }}
              />
            </div>

            {/* Live Info details */}
            <div className="pt-4 border-t border-neutral-200/60 flex items-center gap-3">
              <div className="p-2 rounded-xl bg-accent-cyan/10 text-accent-cyan">
                <Award size={18} />
              </div>
              <p className="text-xs text-neutral-500 leading-relaxed">
                Calculations are based on the latest 2026 UK tech hiring market standards aggregated from Adzuna API salary metadata.
              </p>
            </div>
          </div>

          {/* Calculations Dashboard Output */}
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* London Estimate Card */}
              <div className="bg-slate-900 text-white rounded-3xl p-6 shadow-xl flex flex-col justify-between h-[150px]">
                <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">London Salary Estimate</span>
                <h4 className="text-2xl sm:text-3xl font-black tracking-tight mt-1">£{baseSalaryLondon.toLocaleString()}</h4>
                <span className="text-[10px] text-slate-500 font-medium">Expected base rate per annum</span>
              </div>

              {/* Regional Estimate Card */}
              <div className="bg-neutral-100 rounded-3xl p-6 border border-neutral-200/50 flex flex-col justify-between h-[150px]">
                <span className="text-[10px] text-neutral-400 uppercase font-bold tracking-wider">Regional Salary Estimate</span>
                <h4 className="text-2xl sm:text-3xl font-black tracking-tight mt-1 text-neutral-900">£{baseSalaryRegional.toLocaleString()}</h4>
                <span className="text-[10px] text-neutral-500 font-medium">Outside London / Hybrid expected</span>
              </div>
            </div>

            {/* Placement Chance Output */}
            <div className="bg-neutral-50 rounded-3xl p-6 border border-neutral-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <span className="text-[10px] text-neutral-400 uppercase font-bold tracking-wider">Placement Chance</span>
                <h4 className={cn('text-xl font-bold mt-1 uppercase tracking-wider', placementColor)}>{placementChance}</h4>
              </div>
              <Link
                href="/analyze"
                className="px-6 py-2.5 rounded-full bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-all duration-300 flex items-center gap-1.5 shadow-md"
              >
                Improve ATS Score <ChevronRight size={14} />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
