'use client';

import { cn } from '@/shared/utils/cn';
import { ReactNode } from 'react';

interface GlassCardProps {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  glow?: 'purple' | 'cyan' | 'none';
  padding?: 'sm' | 'md' | 'lg';
  onClick?: () => void;
}

export default function GlassCard({
  children,
  className,
  hover = true,
  glow = 'none',
  padding = 'md',
  onClick,
}: GlassCardProps) {
  const paddingClasses = {
    sm: 'p-4',
    md: 'p-6',
    lg: 'p-8',
  };

  return (
    <div
      onClick={onClick}
      className={cn(
        'glass-card',
        paddingClasses[padding],
        hover && 'hover:translate-y-[-2px] cursor-pointer',
        glow === 'purple' && 'glow-purple',
        glow === 'cyan' && 'glow-cyan',
        onClick && 'cursor-pointer',
        className
      )}
    >
      {children}
    </div>
  );
}
