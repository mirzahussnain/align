import React from 'react';
import { cn } from '@/shared/utils/cn';

interface SectionGroupProps {
  id: string;
  title: string;
  icon: React.ReactNode;
  score?: number;
  children: React.ReactNode;
  className?: string;
}

export default function SectionGroup({
  id,
  title,
  icon,
  score,
  children,
  className
}: SectionGroupProps) {
  return (
    <div
      id={`group-${id}`}
      className={cn(
        "bg-gradient-to-br from-slate-50/80 to-purple-100/50 border border-slate-200/60 rounded-[32px] p-5 sm:p-6 lg:p-8 animate-in slide-in-from-bottom-8 fade-in duration-700 w-full",
        className
      )}
    >
      <div className="flex items-center gap-4 mb-8">
        <div className="p-3 bg-white rounded-2xl shadow-sm text-accent-cyan border border-slate-100">
          {icon}
        </div>
        <div>
          <h2 className="text-lg md:text-xl lg:text-2xl font-black text-slate-800 tracking-tight uppercase">
            {title}
          </h2>
          {score !== undefined && (
            <p className="text-xs md:text-sm font-bold text-slate-500 mt-0.5">
              Section Score: <span className={cn(
                score >= 90 ? "text-success" : score >= 60 ? "text-warning" : "text-error"
              )}>{score}%</span>
            </p>
          )}
        </div>
      </div>
      <div className="space-y-6">
        {children}
      </div>
    </div>
  );
}
