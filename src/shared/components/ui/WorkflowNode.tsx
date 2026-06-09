'use client';

import React from 'react';

interface WorkflowNodeProps {
  left: string;
  top: string;
  icon: React.ComponentType<{ size?: number | string; strokeWidth?: number | string }>;
  label: string;
}

export const WorkflowNode: React.FC<WorkflowNodeProps> = ({ left, top, icon: Icon, label }) => {
  return (
    <div
      className="absolute -translate-x-1/2 -translate-y-1/2 z-10 group"
      style={{ left, top }}
    >
      <div className="relative flex h-14 w-14 items-center justify-center rounded-full bg-white border border-slate-200/80 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.08)] text-slate-600 hover:text-sky-500 hover:border-sky-200 hover:shadow-sky-100 transition-all duration-300 cursor-default">
        <div className="absolute inset-0 rounded-full bg-sky-50 opacity-0 group-hover:opacity-100 transition-opacity -z-10" />
        <Icon size={22} strokeWidth={1.5} />
      </div>
      <span className="absolute top-16 left-1/2 -translate-x-1/2 text-[11px] font-medium text-slate-500 uppercase tracking-wide whitespace-nowrap opacity-80 group-hover:opacity-100 transition-opacity">
        {label}
      </span>
    </div>
  );
};
