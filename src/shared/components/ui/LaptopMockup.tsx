'use client';

import React from 'react';

export const LaptopMockup: React.FC = () => {
  return (
    <div className="relative mx-auto w-full max-w-[760px] lg:max-w-[640px] z-20 px-4 lg:px-0 lg:absolute lg:left-1/2 lg:top-1/2 lg:-translate-x-1/2 lg:-translate-y-1/2">
      {/* Ambient Base Shadow */}
      <div className="absolute inset-x-0 -bottom-10 h-32 bg-gradient-to-t from-slate-200/60 to-transparent blur-2xl -z-10" />

      {/* Screen Bezel */}
      <div className="relative rounded-t-[28px] border-[6px] border-b-0 border-[#1e293b] bg-[#0f172a] p-2 shadow-2xl">
        {/* Top Bar */}
        <div className="flex items-center justify-between px-3 py-2">
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f56]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#ffbd2e]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#27c93f]" />
          </div>
          <span className="text-[10px] font-semibold text-slate-400">Align Workspace</span>
        </div>

        {/* Screen Content */}
        <div className="relative overflow-hidden rounded-[12px] bg-slate-950 border border-slate-800">
          <div className="absolute inset-0 bg-gradient-to-br from-sky-500/5 via-transparent to-purple-500/5 z-0" />
          <div
            className="relative z-10 h-[320px] sm:h-[400px] w-full bg-cover bg-top"
            style={{ backgroundImage: "url('/assets/images/card_cv_score.png')" }}
          />

          <div className="absolute bottom-6 left-6 right-6 flex flex-wrap items-center justify-between gap-3 z-20">
            <div className="rounded-full bg-slate-900/80 px-4 py-2 text-[11px] font-semibold text-white/90 backdrop-blur-md border border-white/10 shadow-lg">
              ATS Score: 92 / 100
            </div>
            <div className="rounded-full bg-slate-900/80 px-4 py-2 text-[11px] font-semibold text-white/90 backdrop-blur-md border border-white/10 shadow-lg">
              Visa-ready roles: 143
            </div>
          </div>
        </div>
      </div>

      {/* Laptop Bottom Base */}
      <div className="relative h-6 sm:h-8 w-full rounded-b-[24px] bg-gradient-to-b from-[#f1f5f9] to-[#cbd5e1] border-t border-[#94a3b8] shadow-inner flex items-start justify-center">
        <div className="h-2 sm:h-2.5 w-24 sm:w-32 rounded-b-xl bg-[#94a3b8]/40 shadow-[inset_0_2px_4px_rgba(0,0,0,0.1)]" />
      </div>
    </div>
  );
};
