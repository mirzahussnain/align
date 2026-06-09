'use client';

import React from 'react';
import { cn } from '@/shared/utils/cn';

interface AuditCardProps {
  id: string;
  title: string;
  subtitle: string;
  score?: string | number;
  scoreStatus?: 'excellent' | 'good' | 'needs-improvement' | 'critical' | 'neutral';
  details?: string;
  children?: React.ReactNode;
}

export default function AuditCard({
  id,
  title,
  subtitle,
  score,
  scoreStatus = 'neutral',
  details,
  children
}: AuditCardProps) {
  const getStatusClasses = () => {
    switch (scoreStatus) {
      case 'excellent':
        return 'bg-emerald-50 text-emerald-700 border-emerald-100/60 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900/30';
      case 'good':
        return 'bg-amber-50 text-amber-700 border-amber-100/60 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-900/30';
      case 'needs-improvement':
        return 'bg-rose-50/60 text-rose-700 border-rose-100/60 dark:bg-rose-950/20 dark:text-rose-400 dark:border-rose-900/30';
      case 'critical':
        return 'bg-rose-50 text-rose-700 border-rose-100/60 dark:bg-rose-950/20 dark:text-rose-400 dark:border-rose-900/30';
      default:
        return 'bg-slate-50 text-slate-600 border-slate-200/60 dark:bg-slate-800/40 dark:text-slate-400 dark:border-slate-700/30';
    }
  };

  return (
    <div
      id={`section-${id}`}
      className="bg-bg-card border border-slate-100 rounded-[24px] p-6 shadow-sm shadow-slate-100/40 scroll-mt-24 pt-6"
    >
      <div className="flex justify-between items-start mb-2 border-b border-slate-50 pb-4">
        <div>
          <h3 className="font-extrabold text-slate-800 text-base">{title}</h3>
          <p className="text-xs text-slate-400 mt-1">{subtitle}</p>
        </div>
        {score !== undefined && (
          <span className={cn('text-sm font-extrabold px-3 py-1 rounded-full border whitespace-nowrap flex-shrink-0 text-center', getStatusClasses())}>
            {score}
          </span>
        )}
      </div>
      {details && (
        <p className="text-xs font-semibold text-slate-500 leading-relaxed mb-4">
          {details}
        </p>
      )}
      {children}
    </div>
  );
}
