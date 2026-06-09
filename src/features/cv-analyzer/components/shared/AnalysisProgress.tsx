'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { cn } from '@/shared/utils/cn';
import { ANALYSIS_STAGES } from '../../constants/analysis-stages';

interface AnalysisProgressProps {
  isAnalyzing: boolean;
}

export default function AnalysisProgress({ isAnalyzing }: AnalysisProgressProps) {
  const [currentStageIdx, setCurrentStageIdx] = useState(0);
  const [progress, setProgress] = useState(10);

  useEffect(() => {
    if (!isAnalyzing) return;

    // Simulate multi-stage LLM analysis workflow
    const stageInterval = setInterval(() => {
      setCurrentStageIdx((prev) => {
        if (prev < ANALYSIS_STAGES.length - 1) {
          const nextStage = prev + 1;
          setProgress(Math.round((nextStage / ANALYSIS_STAGES.length) * 85) + 10);
          return nextStage;
        }
        setProgress(95);
        return prev;
      });
    }, 850);

    return () => clearInterval(stageInterval);
  }, [isAnalyzing]);

  // Circumference of circle with r=48 is ~301.6
  const circumference = 2 * Math.PI * 48;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <div className="w-full max-w-xl mx-auto bg-white/80 border border-slate-200/50 backdrop-blur-xl rounded-2xl p-8 shadow-xl text-left select-none relative overflow-hidden">
      {/* Background soft glow flare */}
      <div className="absolute -top-24 -left-24 w-48 h-48 bg-accent-purple/10 blur-3xl rounded-full pointer-events-none" />
      <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-accent-cyan/10 blur-3xl rounded-full pointer-events-none" />

      <div className="flex flex-col items-center gap-6 relative z-10">
        
        {/* Dynamic Circular Progress Indicator */}
        <div className="relative w-32 h-32 flex items-center justify-center">
          <svg className="w-full h-full transform -rotate-90">
            {/* Base gray circle */}
            <circle
              cx="64"
              cy="64"
              r="48"
              className="stroke-slate-100"
              strokeWidth="6"
              fill="transparent"
            />
            {/* Animated progress circle */}
            <motion.circle
              cx="64"
              cy="64"
              r="48"
              className="stroke-accent-purple"
              strokeWidth="6"
              fill="transparent"
              strokeDasharray={circumference}
              initial={{ strokeDashoffset: circumference }}
              animate={{ strokeDashoffset }}
              transition={{ duration: 0.5, ease: 'easeInOut' }}
            />
          </svg>
          {/* Inner percentage text */}
          <div className="absolute flex flex-col items-center">
            <span className="text-2xl font-black text-text-primary">{progress}%</span>
            <span className="text-[10px] font-bold text-text-tertiary uppercase tracking-widest mt-0.5">Analysis</span>
          </div>
        </div>

        {/* Analytical Pipeline Title */}
        <div className="text-center">
          <h3 className="text-lg font-bold text-text-primary">Recruitment Pipeline Calibration</h3>
          <p className="text-xs text-text-secondary mt-1">AI-assisted UK standards mapping in progress</p>
        </div>

        {/* Stage List */}
        <div className="w-full space-y-3.5 mt-2 border-t border-slate-100 pt-5">
          {ANALYSIS_STAGES.map((stage, idx) => {
            const isCompleted = idx < currentStageIdx;
            const isActive = idx === currentStageIdx;

            return (
              <div
                key={stage.id}
                className={cn(
                  'flex items-center gap-3 transition-opacity duration-300',
                  isCompleted ? 'opacity-100' : isActive ? 'opacity-100' : 'opacity-40'
                )}
              >
                {/* Stage Indicator Icon */}
                <div className="flex-shrink-0">
                  {isCompleted ? (
                    <CheckCircle2 size={18} className="text-success fill-success/10" />
                  ) : isActive ? (
                    <Loader2 size={16} className="text-accent-purple animate-spin" />
                  ) : (
                    <div className="w-4.5 h-4.5 rounded-full border-2 border-slate-200" />
                  )}
                </div>

                {/* Stage Label */}
                <span
                  className={cn(
                    'text-xs font-semibold tracking-wide transition-colors duration-300',
                    isCompleted
                      ? 'text-success'
                      : isActive
                      ? 'text-accent-purple font-bold animate-pulse'
                      : 'text-text-secondary'
                  )}
                >
                  {stage.label}
                </span>
              </div>
            );
          })}
        </div>

      </div>
    </div>
  );
}
