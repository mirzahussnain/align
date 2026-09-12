'use client';

import { cn } from '@/shared/utils/cn';

import { ReactNode } from 'react';

export interface TabOption {
  label: ReactNode;
  value: string;
  activeClassName?: string;
}

interface TabsProps {
  tabs: TabOption[];
  activeTab: string;
  onChange: (value: string) => void;
  className?: string;
  variant?: 'underline' | 'pill';
}

export default function Tabs({ tabs, activeTab, onChange, className, variant = 'underline' }: TabsProps) {
  if (variant === 'pill') {
    return (
      <div className={cn("flex bg-slate-100 p-0.5 rounded-lg border border-slate-200/60 w-fit", className)}>
        {tabs.map((tab) => {
          const isActive = activeTab === tab.value;
          return (
            <button
              key={tab.value}
              onClick={() => onChange(tab.value)}
              className={cn(
                "px-2.5 py-1 rounded-md text-[10px] font-bold transition-all flex items-center gap-1 cursor-pointer",
                isActive
                  ? cn("bg-white shadow-sm", tab.activeClassName || "text-slate-800")
                  : "text-slate-400 hover:text-slate-600"
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className={cn("flex border-b border-border-subtle w-full", className)}>
      {tabs.map((tab) => (
        <button
          key={tab.value}
          onClick={() => onChange(tab.value)}
          className={cn(
            "flex-1 py-3 px-4 text-sm font-bold transition-all duration-300 border-b-2",
            activeTab === tab.value
              ? "text-slate-900 border-slate-900 dark:text-accent-cyan dark:border-accent-cyan"
              : "text-text-tertiary border-transparent hover:text-text-secondary hover:border-border-subtle"
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
