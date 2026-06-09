'use client';

import React from 'react';
import { FileSearch, ShieldCheck } from 'lucide-react';
import { cn } from '@/shared/utils/cn';
import BaseHeroCard from './BaseHeroCard';

interface HeroCardProps {
  type: 'blur' | 'sponsors' | 'ats' | 'main' | 'compliance' | 'salary' | 'blur-right';
  className?: string;
}

export default function HeroCard({ type, className }: HeroCardProps) {
  if (type === 'blur' || type === 'blur-right') {
    return (
      <div
        className={cn(
          'w-[150px] h-[190px] bg-white/5 border border-white/10 rounded-lg p-3 flex flex-col justify-between backdrop-blur-xs select-none pointer-events-none transition-all duration-300',
          className
        )}
      >
        <div className="w-6 h-6 rounded bg-white/10" />
        <div className="space-y-1">
          <div className="h-1 w-12 bg-white/20 rounded" />
          <div className="h-1 w-16 bg-white/10 rounded" />
        </div>
      </div>
    );
  }

  if (type === 'sponsors') {
    return (
      <BaseHeroCard variant="light" className={cn('w-[150px] h-[190px] p-3.5 rounded-lg', className)}>
        <div className="flex justify-between items-center border-b border-neutral-100 pb-1">
          <span className="text-[7.5px] font-bold text-neutral-400 uppercase tracking-wider">Immigration</span>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
        </div>
        <div className="space-y-1.5 my-auto">
          <div className="p-1 px-1.5 rounded bg-neutral-50 border border-neutral-100 text-[7.5px] font-semibold text-neutral-600 leading-tight">
            Route: Skilled Worker
          </div>
          <div className="p-1 px-1.5 rounded bg-neutral-50 border border-neutral-100 text-[7.5px] font-semibold text-neutral-600 leading-tight">
            Industry: Tech
          </div>
        </div>
        <div className="text-[7.5px] text-neutral-400 font-bold pt-1 border-t border-neutral-50">
          90,000+ UK Sponsors
        </div>
      </BaseHeroCard>
    );
  }

  if (type === 'ats') {
    return (
      <BaseHeroCard variant="light" className={cn('w-[150px] h-[190px] p-3.5 rounded-lg', className)}>
        <div>
          <span className="text-[7.5px] text-neutral-400 uppercase font-extrabold tracking-wider">Scoring</span>
          <h4 className="text-[9px] font-black mt-0.5 leading-tight">ATS Calibration</h4>
        </div>

        {/* Custom Mini Bar Charts */}
        <div className="flex items-end justify-between gap-px h-12 my-2 px-0.5">
          <div className="w-2 h-5 bg-neutral-100 rounded-t" />
          <div className="w-2 h-7 bg-neutral-100 rounded-t" />
          <div className="w-2 h-4 bg-neutral-100 rounded-t" />
          <div className="w-2 h-10 bg-rose-400/90 rounded-t" />
          <div className="w-2 h-6 bg-neutral-100 rounded-t" />
          <div className="w-2 h-8 bg-neutral-100 rounded-t" />
        </div>

        <div className="flex justify-between items-center border-t border-neutral-100 pt-1.5">
          <span className="text-[8px] font-black text-neutral-800">+89%</span>
          <span className="text-[7.5px] text-neutral-400 font-bold uppercase">Passed</span>
        </div>
      </BaseHeroCard>
    );
  }

  if (type === 'main') {
    return (
      <BaseHeroCard variant="dark" className={cn('w-[150px] h-[190px] p-3.5 rounded-lg', className)}>
        <div className="flex justify-between items-start">
          <div>
            <span className="text-[7.5px] text-accent-cyan uppercase font-extrabold tracking-widest">ALIGN ENGINE</span>
            <h3 className="text-[9px] font-bold mt-0.5 text-white leading-snug">Calibrate your profile for UK tech</h3>
          </div>
          <span className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-white border border-white/10 flex-shrink-0">
            <FileSearch size={10} />
          </span>
        </div>

        <div>
          <span className="text-[7.5px] text-white/50 uppercase font-bold">Grade</span>
          <p className="text-base font-black tracking-tight text-white mt-0.5">A+ <span className="text-[8px] text-accent-cyan font-semibold block mt-px">850 / 1000</span></p>
        </div>

        <div className="flex items-center gap-1 text-[7.5px] text-white/60 font-semibold border-t border-white/10 pt-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
          Live ATS Verified
        </div>
      </BaseHeroCard>
    );
  }

  if (type === 'compliance') {
    return (
      <BaseHeroCard variant="gradient" className={cn('w-[150px] h-[190px] p-3.5 rounded-lg', className)}>
        {/* Shield Check Vector Backdrop */}
        <div className="absolute right-0 bottom-0 w-12 h-12 opacity-20 pointer-events-none flex items-center justify-center">
          <ShieldCheck size={40} className="text-white" />
        </div>

        <div className="relative z-10">
          <span className="text-[7.5px] text-white/75 uppercase font-bold tracking-wider">Compliance</span>
          <h4 className="text-[9px] font-black mt-0.5">Equality Act</h4>
          <p className="text-[7.5px] text-white/80 mt-0.5">Passed all checks</p>
        </div>

        <div className="mt-auto relative z-10">
          <span className="text-[7.5px] text-white/70 uppercase font-bold block">Status</span>
          <p className="text-[10px] font-black tracking-tight">No Bias Detected</p>
        </div>
      </BaseHeroCard>
    );
  }

  if (type === 'salary') {
    return (
      <BaseHeroCard variant="light" className={cn('w-[150px] h-[190px] p-3.5 rounded-lg', className)}>
        <div className="border-b border-neutral-100 pb-1">
          <span className="text-[7.5px] font-bold text-neutral-400 uppercase tracking-wider">Calculator</span>
        </div>

        <div className="space-y-0.5 flex-1 mt-1.5">
          <div className="text-[7.5px] font-bold text-neutral-500">London Est.</div>
          <div className="text-[10px] font-black text-neutral-900 leading-tight">£65,000/yr</div>
        </div>

        <div className="space-y-0.5 flex-1 mt-1">
          <div className="text-[7.5px] font-bold text-neutral-500">Placement</div>
          <div className="text-[8px] font-extrabold text-emerald-600">Strong (85%)</div>
        </div>

        <div className="text-[7.5px] text-neutral-400 font-bold border-t border-neutral-100 pt-1 mt-1">
          Live UK API data
        </div>
      </BaseHeroCard>
    );
  }

  return null;
}
