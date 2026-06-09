'use client';

import { motion } from 'framer-motion';
import { cn } from '@/shared/utils/cn';
import type { CategoryScore } from '@/shared/types/cv';
import { CheckCircle, AlertTriangle, XCircle } from 'lucide-react';

interface ScoreCardProps {
  category: CategoryScore;
  index: number;
}

const STATUS_CONFIG = {
  excellent: {
    icon: CheckCircle,
    iconColor: 'text-success',
    barColor: 'bg-success',
    label: 'EXCELLENT',
  },
  good: {
    icon: CheckCircle,
    iconColor: 'text-info',
    barColor: 'bg-info',
    label: 'GOOD',
  },
  'needs-improvement': {
    icon: AlertTriangle,
    iconColor: 'text-warning',
    barColor: 'bg-warning',
    label: 'NEEDS WORK',
  },
  critical: {
    icon: XCircle,
    iconColor: 'text-error',
    barColor: 'bg-error',
    label: 'CRITICAL',
  },
};

export default function ScoreCard({ category, index }: ScoreCardProps) {
  const config = STATUS_CONFIG[category.status] || STATUS_CONFIG.good;
  const Icon = config.icon;
  const percentage = Math.round((category.score / category.maxScore) * 100);

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.05 }}
      className="bg-bg-card border border-slate-100 dark:border-slate-800/60 rounded-[20px] p-5 shadow-sm shadow-slate-100/40 dark:shadow-none flex flex-col min-h-[160px] h-full justify-between"
    >
      <div>
        {/* Status line */}
        <div className="flex items-center justify-between mb-3 text-slate-800 dark:text-slate-100 font-extrabold text-xs tracking-wider">
          <div className="flex items-center gap-1.5">
            <Icon size={16} className={config.iconColor} />
            <span>{config.label}</span>
          </div>
          <span className="text-sm">{percentage}%</span>
        </div>

        {/* Title */}
        <h3 className="text-[15px] font-bold text-slate-800 dark:text-slate-100 mb-1 leading-snug">
          {category.label}
        </h3>

        {/* Details Text */}
        <p className="text-xs font-medium text-slate-400 dark:text-slate-400 leading-relaxed mb-4">
          {category.details}
        </p>
      </div>

      {/* Progress bar at the bottom */}
      <div className="w-full">
        <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
          <motion.div
            className={cn('h-full rounded-full', config.barColor)}
            initial={{ width: 0 }}
            animate={{ width: `${percentage}%` }}
            transition={{ duration: 1.2, delay: 0.2 + index * 0.05, ease: 'easeOut' }}
          />
        </div>
      </div>
    </motion.div>
  );
}
