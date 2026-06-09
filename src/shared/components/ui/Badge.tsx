import React from 'react';
import { cn } from '@/shared/utils/cn';

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'error' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
}

export default function Badge({ 
  variant = 'default', 
  size = 'md', 
  className, 
  children, 
  ...props 
}: BadgeProps) {
  
  const variants = {
    default: 'bg-bg-tertiary text-text-tertiary border-transparent',
    primary: 'bg-accent-cyan/10 text-accent-cyan border-accent-cyan/20',
    success: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
    warning: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
    error: 'bg-red-500/10 text-red-600 border-red-500/20',
    outline: 'bg-transparent border-border-subtle text-text-secondary',
    ghost: 'bg-transparent border-transparent text-text-secondary hover:bg-bg-tertiary',
  };

  const sizes = {
    sm: 'px-2 py-0.5 text-[9px]',
    md: 'px-2.5 py-1 text-[10px]',
    lg: 'px-3 py-1.5 text-xs',
  };

  return (
    <span 
      className={cn(
        'inline-flex items-center justify-center rounded-full font-semibold uppercase tracking-wider border',
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}
