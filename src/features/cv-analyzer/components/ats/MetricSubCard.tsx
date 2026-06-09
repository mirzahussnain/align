import React from 'react';
import { cn } from '@/shared/utils/cn';

interface MetricSubCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

/**
 * A feature-scoped wrapper for inner metric cards in the Align dashboard.
 * Eliminates the repetition of `p-4 bg-slate-50 border border-slate-100 rounded-2xl`
 * across the 19 metric section components.
 */
export default function MetricSubCard({ children, className, ...props }: MetricSubCardProps) {
  return (
    <div 
      className={cn("p-4 bg-slate-50 border border-slate-100 rounded-2xl", className)}
      {...props}
    >
      {children}
    </div>
  );
}
