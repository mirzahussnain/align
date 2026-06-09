'use client';

import { motion } from 'framer-motion';
import { cn } from '@/shared/utils/cn';

interface ScoreDialProps {
  score: number;
  maxScore?: number;
  size?: 'sm' | 'md' | 'lg';
  label?: string;
  showPercentage?: boolean;
  className?: string;
}

export default function ScoreDial({
  score,
  maxScore = 100,
  size = 'lg',
  label,
  showPercentage = true,
  className,
}: ScoreDialProps) {
  const percentage = Math.round((score / maxScore) * 100);

  const sizeConfig = {
    sm: { outer: 80, stroke: 6, fontSize: 'text-lg', labelSize: 'text-[10px]' },
    md: { outer: 120, stroke: 8, fontSize: 'text-2xl', labelSize: 'text-xs' },
    lg: { outer: 180, stroke: 10, fontSize: 'text-4xl', labelSize: 'text-sm' },
  };

  const config = sizeConfig[size];
  const radius = (config.outer - config.stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  const getColor = () => {
    if (percentage >= 85) return 'hsl(142, 71%, 45%)'; // success green
    if (percentage >= 70) return 'hsl(217, 91%, 60%)'; // info blue
    if (percentage >= 50) return 'hsl(38, 92%, 50%)';  // warning orange/yellow
    return 'hsl(346, 84%, 61%)';                        // error red
  };

  const strokeColor = getColor();

  return (
    <div className={cn('flex flex-col items-center gap-2', className)}>
      <div className="relative" style={{ width: config.outer, height: config.outer }}>
        <svg
          width={config.outer}
          height={config.outer}
          viewBox={`0 0 ${config.outer} ${config.outer}`}
          className="transform -rotate-90"
        >
          {/* Background circle */}
          <circle
            cx={config.outer / 2}
            cy={config.outer / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            className="text-slate-100 dark:text-slate-800"
            strokeWidth={config.stroke}
          />
          {/* Score circle */}
          <motion.circle
            cx={config.outer / 2}
            cy={config.outer / 2}
            r={radius}
            fill="none"
            stroke={strokeColor}
            strokeWidth={config.stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset }}
            transition={{ duration: 1.5, ease: 'easeOut', delay: 0.3 }}
            style={{
              filter: `drop-shadow(0 0 8px ${strokeColor}25)`,
            }}
          />
        </svg>

        {/* Center text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <motion.span
            className={cn(config.fontSize, 'font-extrabold text-text-primary')}
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.8 }}
          >
            {showPercentage ? `${percentage}` : score}
          </motion.span>
          {showPercentage && (
            <span className={cn(config.labelSize, 'text-text-tertiary font-semibold -mt-1')}>
              / 100
            </span>
          )}
        </div>
      </div>

      {label && (
        <span className="text-sm font-medium text-text-secondary text-center">{label}</span>
      )}
    </div>
  );
}
