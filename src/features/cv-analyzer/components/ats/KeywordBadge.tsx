'use client';

import { cn } from '@/shared/utils/cn';
import { Check, X } from 'lucide-react';

interface KeywordBadgeProps {
  keyword: string;
  present: boolean;
  count?: number;
  category?: string;
}

export default function KeywordBadge({ keyword, present, count, category }: KeywordBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200',
        present
          ? 'bg-success/12 text-success border border-success/25 hover:bg-success/20'
          : 'bg-error/10 text-error border border-error/20 hover:bg-error/18'
      )}
      title={category ? `Category: ${category}` : undefined}
    >
      {present ? <Check size={12} /> : <X size={12} />}
      {keyword}
      {present && count !== undefined && count > 1 && (
        <span className="ml-0.5 text-[10px] opacity-70">×{count}</span>
      )}
    </span>
  );
}
