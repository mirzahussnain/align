import React from 'react';
import { cn } from '@/shared/utils/cn';

interface BaseHeroCardProps {
  children: React.ReactNode;
  className?: string;
  variant?: 'light' | 'dark' | 'gradient';
}

export default function BaseHeroCard({
  children,
  className,
  variant = 'light',
}: BaseHeroCardProps) {
  return (
    <div
      className={cn(
        'rounded-2xl transition-all duration-300 select-none flex flex-col justify-between text-left shadow-xl border',
        variant === 'light' && 'bg-white text-neutral-800 border-neutral-100 shadow-neutral-200/50',
        variant === 'dark' && 'bg-slate-900/80 border-white/25 text-white backdrop-blur-md shadow-[0_30px_60px_rgba(0,0,0,0.5)]',
        variant === 'gradient' && 'bg-gradient-to-tr from-pink-500 via-rose-500 to-rose-600 text-white border-transparent shadow-rose-500/10 overflow-hidden relative',
        className
      )}
    >
      {children}
    </div>
  );
}
