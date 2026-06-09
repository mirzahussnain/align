'use client';

import React from 'react';
import Link from 'next/link';
import { NAV_LINKS } from '@/shared/constants/navigation';

export default function Footer() {
  return (
    <footer className="bg-bg-primary border-t border-slate-200/60 py-12 px-4 sm:px-6 lg:px-8 relative z-20">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
        
        {/* Brand */}
        <div className="flex items-center gap-3 group cursor-pointer">
          <div className="relative w-10 h-10 flex items-center justify-center">
            <img 
              src="/assets/svgs/logo.svg" 
              alt="Align" 
              className="w-8 h-8 object-contain select-none transition-all duration-500 ease-out group-hover:scale-110 group-hover:rotate-12 drop-shadow-sm group-hover:drop-shadow-[0_0_12px_rgba(var(--accent-cyan),0.6)]" 
            />
          </div>
          <div className="flex flex-col text-left">
            <span className="text-sm font-semibold text-slate-800 tracking-tight">Align</span>
            <span className="text-[10px] text-slate-400 font-medium">UK Tech Career Intelligence</span>
          </div>
        </div>

        {/* Links */}
        <div className="flex flex-wrap items-center justify-center gap-6">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-slate-500 hover:text-sky-500 transition-colors duration-200 font-medium text-[14px]"
            >
              {link.label}
            </Link>
          ))}
        </div>

        {/* Copyright */}
        <div className="text-[10px] text-slate-400 text-center md:text-right">
          <p>© {new Date().getFullYear()} Align. All rights reserved.</p>
          <p className="mt-1 text-slate-400/80">Data aggregated from Reed, Adzuna, Jooble & GOV.UK</p>
        </div>

      </div>
    </footer>
  );
}
