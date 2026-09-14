'use client';

import { motion } from 'framer-motion';
import { Target, Sparkles, CheckCircle2 } from 'lucide-react';
import { cn } from '@/shared/utils/cn';

interface Props {
  includeAtsOptimization: boolean;
  onSelect: (val: boolean) => void;
}

export default function AtsOptimizationStep({ includeAtsOptimization, onSelect }: Props) {
  return (
    <div className="space-y-6">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-slate-800">Composite Rewrite Engine</h3>
        <p className="text-sm text-slate-500 mt-1 leading-relaxed">
          We analyzed your CV for ATS scoring issues (like weak action verbs, lack of measurable results, and clichés) in the background. Do you want to apply those fixes alongside the Job Match blueprint?
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Standard Match */}
        <div
          onClick={() => onSelect(false)}
          className={cn(
            "relative p-5 rounded-2xl border-2 cursor-pointer transition-all duration-200",
            !includeAtsOptimization 
              ? "border-slate-800 bg-slate-50" 
              : "border-slate-200 hover:border-slate-300 bg-white"
          )}
        >
          <div className="flex items-center gap-3 mb-3">
            <div className={cn("p-2 rounded-xl", !includeAtsOptimization ? "bg-slate-200 text-slate-800" : "bg-slate-100 text-slate-500")}>
              <Target size={20} />
            </div>
            <h4 className={cn("font-bold", !includeAtsOptimization ? "text-slate-900" : "text-slate-600")}>
              Standard Match
            </h4>
          </div>
          <p className="text-sm text-slate-500 mb-4">
            Only injects missing skills and restructures your CV to match the target Job Description blueprint.
          </p>
          <ul className="space-y-2">
            <li className="flex items-center gap-2 text-sm text-slate-600">
              <CheckCircle2 size={16} className="text-slate-400" /> Matches required skills
            </li>
            <li className="flex items-center gap-2 text-sm text-slate-600">
              <CheckCircle2 size={16} className="text-slate-400" /> Follows ideal section order
            </li>
          </ul>
        </div>

        {/* Composite Rewrite */}
        <div
          onClick={() => onSelect(true)}
          className={cn(
            "relative p-5 rounded-2xl border-2 cursor-pointer transition-all duration-200",
            includeAtsOptimization 
              ? "border-accent-cyan bg-sky-50/30" 
              : "border-slate-200 hover:border-slate-300 bg-white"
          )}
        >
          {includeAtsOptimization && (
            <div className="absolute -top-3 -right-3 bg-slate-900 text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider shadow-sm">
              Recommended
            </div>
          )}
          <div className="flex items-center gap-3 mb-3">
            <div className={cn("p-2 rounded-xl", includeAtsOptimization ? "bg-sky-100 text-accent-cyan" : "bg-slate-100 text-slate-500")}>
              <Sparkles size={20} />
            </div>
            <h4 className={cn("font-bold", includeAtsOptimization ? "text-slate-900" : "text-slate-600")}>
              Composite Optimization
            </h4>
          </div>
          <p className="text-sm text-slate-500 mb-4">
            Merges Job Match blueprint with comprehensive ATS formatting rules and structural enhancements.
          </p>
          <ul className="space-y-2">
            <li className="flex items-center gap-2 text-sm text-slate-600">
              <CheckCircle2 size={16} className="text-accent-cyan" /> Fixes weak action verbs
            </li>
            <li className="flex items-center gap-2 text-sm text-slate-600">
              <CheckCircle2 size={16} className="text-accent-cyan" /> Enforces STAR format & metrics
            </li>
            <li className="flex items-center gap-2 text-sm text-slate-600">
              <CheckCircle2 size={16} className="text-accent-cyan" /> Strips corporate clichés
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
