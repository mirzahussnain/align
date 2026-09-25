'use client';

import { cn } from '@/shared/utils/cn';

interface VisaData {
  title: string;
  icon: React.ElementType;
  color: string;
  bg: string;
  border: string;
  overview: string[];
  requirements: string[];
  process: string[];
  roadmap: string[];
  officialUrl: string;
}

interface VisaRouteDetailsProps {
  visa: VisaData;
  className?: string;
}

export default function VisaRouteDetails({ visa, className }: VisaRouteDetailsProps) {
  return (
    <div className={cn('w-full text-left space-y-8', className)}>
      {/* Overview Section */}
      <div>
        <h3 className="text-lg font-bold text-text-primary mb-4 flex items-center gap-2">
          <span className={cn('w-2 h-6 rounded-full', visa.bg)} />
          Overview
        </h3>
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-y-4 gap-x-8 w-full">
          {visa.overview.map((detail, i) => (
            <li key={i} className="flex items-start gap-3 text-sm text-text-secondary bg-slate-50/50 p-3 rounded-xl border border-slate-100">
              <div className={cn('mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0', visa.color)} />
              <span className="leading-relaxed">{detail}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Requirements Section */}
      <div>
        <h3 className="text-lg font-bold text-text-primary mb-4 flex items-center gap-2">
          <span className={cn('w-2 h-6 rounded-full bg-slate-200')} />
          Key Requirements
        </h3>
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-y-4 gap-x-8 w-full">
          {visa.requirements.map((req, i) => (
            <li key={i} className="flex items-start gap-3 text-sm text-text-secondary bg-slate-50/50 p-3 rounded-xl border border-slate-100">
              <div className={cn('mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 bg-slate-400')} />
              <span className="leading-relaxed">{req}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Process Section */}
      <div>
        <h3 className="text-lg font-bold text-text-primary mb-4 flex items-center gap-2">
          <span className={cn('w-2 h-6 rounded-full bg-slate-200')} />
          Application Process
        </h3>
        <div className="bg-slate-50 border border-slate-100 rounded-2xl p-5">
          <ul className="space-y-4">
            {visa.process.map((step, i) => (
              <li key={i} className="flex items-start gap-3 text-sm text-text-secondary">
                <span className={cn('flex-shrink-0 font-bold', visa.color)}>{step.split('.')[0]}.</span>
                <span className="leading-relaxed">{step.split('.').slice(1).join('.').trim()}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Roadmap Section */}
      <div>
        <h3 className="text-lg font-bold text-text-primary mb-4 flex items-center gap-2">
          <span className={cn('w-2 h-6 rounded-full bg-slate-200')} />
          Possible route and next steps
        </h3>
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-y-4 gap-x-8 w-full">
          {visa.roadmap.map((point, i) => (
            <li key={i} className="flex items-start gap-3 text-sm text-text-secondary bg-slate-50/50 p-3 rounded-xl border border-slate-100">
              <div className={cn('mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 bg-slate-400')} />
              <span className="leading-relaxed">{point}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
        This is general route information, not immigration advice. Rules, fees and eligibility can change.{' '}
        <a href={visa.officialUrl} target="_blank" rel="noopener noreferrer" className="font-semibold underline underline-offset-4">
          Check the current official GOV.UK guidance
        </a>{' '}
        before making a decision or application.
      </div>
      
      {/* Decorative gradient blur */}
      <div className={cn(
        'absolute -right-12 -bottom-12 w-64 h-64 rounded-full blur-3xl opacity-5 transition-opacity duration-500 pointer-events-none',
        visa.bg
      )} />
    </div>
  );
}
