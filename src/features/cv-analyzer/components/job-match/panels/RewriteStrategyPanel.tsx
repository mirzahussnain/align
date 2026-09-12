'use client';

import { motion, type Variants } from 'framer-motion';
import {
  FileSignature,
  LayoutList,
  Star,
  ArrowUpCircle,
  ArrowDownCircle,
  PenLine,
  Globe2,
  FileText,
  Lock,
  Info,
} from 'lucide-react';
import type { JobMatchReportView } from '@/shared/types/job-match-report';
import type { StrategyField } from '@/shared/types/job-match-report';

interface RewriteStrategyPanelProps {
  view: JobMatchReportView;
  contentVariants: Variants;
}

/** Renders the typed state for a field that has no available value. */
function FieldUnavailable({ field }: { field: Exclude<StrategyField<unknown>, { status: 'available' }> }) {
  if (field.status === 'plan_restricted') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
        <Lock size={12} /> Part of the full rewrite strategy
      </span>
    );
  }
  return (
    <span className="inline-flex items-start gap-1.5 text-xs text-slate-500">
      <Info size={12} className="mt-0.5 flex-shrink-0" /> {field.reason}
    </span>
  );
}

function textValue(field: StrategyField<string>): string | null {
  return field.status === 'available' ? field.value : null;
}

function listValue(field: StrategyField<string[]>): string[] | null {
  return field.status === 'available' ? field.value : null;
}

export default function RewriteStrategyPanel({ view, contentVariants }: RewriteStrategyPanelProps) {
  const strategy = view.strategy;
  const eligibility = view.assessments.eligibility;

  const templateRationale = textValue(strategy.templateRationale);
  const recommendedTemplate = textValue(strategy.recommendedTemplate);
  const leadProject = textValue(strategy.leadProject);
  const summaryAngle = textValue(strategy.summaryAngle);
  const coverLetterAngle = textValue(strategy.coverLetterAngle);
  const skillsToSurface = listValue(strategy.skillsToSurface);
  const skillsToDeprioritise = listValue(strategy.skillsToDeprioritise);
  const sectionOrder = listValue(strategy.sectionOrder);

  return (
    <motion.div
      variants={contentVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="space-y-6"
    >
      {strategy.locked && (
        <div className="flex items-center gap-2 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
          <Lock size={14} /> The full CV strategy — template, lead project, summary and cover-letter angles, and
          section order — is part of the full rewrite strategy.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Recommended Template */}
        <div className="bg-white rounded-3xl border border-slate-100 p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-sky-50 flex items-center justify-center text-accent-cyan">
              <FileSignature size={20} />
            </div>
            <div>
              <h3 className="font-bold text-slate-800">Recommended Design</h3>
              {recommendedTemplate && <p className="text-xs text-slate-500">{recommendedTemplate}</p>}
            </div>
          </div>
          {templateRationale ? (
            <p className="text-sm text-slate-600 leading-relaxed bg-slate-50 p-3 rounded-xl">
              {templateRationale}
            </p>
          ) : (
            <FieldUnavailable field={strategy.templateRationale as Exclude<StrategyField<string>, { status: 'available' }>} />
          )}
        </div>

        {/* Lead Project */}
        <div className="bg-white rounded-3xl border border-slate-100 p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
              <Star size={20} />
            </div>
            <div>
              <h3 className="font-bold text-slate-800">Lead Project</h3>
              <p className="text-xs text-slate-500">Should appear first in your CV</p>
            </div>
          </div>
          {leadProject ? (
            <p className="text-sm font-medium text-slate-700 bg-slate-50 p-3 rounded-xl border border-slate-200">
              {leadProject}
            </p>
          ) : (
            <FieldUnavailable field={strategy.leadProject as Exclude<StrategyField<string>, { status: 'available' }>} />
          )}
        </div>
      </div>

      {/* Summary Angle & Cover Letter */}
      <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-3xl p-6 text-white shadow-md">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div>
            <h4 className="flex items-center gap-2 text-sm font-bold text-slate-300 uppercase tracking-wider mb-3">
              <PenLine size={16} /> Summary Angle
            </h4>
            {summaryAngle ? (
              <p className="text-sm leading-relaxed text-slate-200">{summaryAngle}</p>
            ) : (
              <p className="text-sm leading-relaxed text-slate-400">
                {strategy.summaryAngle.status === 'plan_restricted'
                  ? 'Part of the full rewrite strategy.'
                  : strategy.summaryAngle.status !== 'available'
                    ? strategy.summaryAngle.reason
                    : ''}
              </p>
            )}
          </div>
          <div>
            <h4 className="flex items-center gap-2 text-sm font-bold text-slate-300 uppercase tracking-wider mb-3">
              <FileText size={16} /> Cover Letter Angle
            </h4>
            {coverLetterAngle ? (
              <p className="text-sm leading-relaxed text-slate-200">{coverLetterAngle}</p>
            ) : (
              <p className="text-sm leading-relaxed text-slate-400">
                {strategy.coverLetterAngle.status === 'plan_restricted'
                  ? 'Part of the full rewrite strategy.'
                  : strategy.coverLetterAngle.status !== 'available'
                    ? strategy.coverLetterAngle.reason
                    : ''}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Skills Strategy */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-3xl border border-slate-100 p-5 shadow-sm">
          <h4 className="flex items-center gap-2 font-bold text-slate-800 mb-4">
            <ArrowUpCircle className="text-green-500" size={20} /> Skills to Surface
          </h4>
          {skillsToSurface ? (
            <div className="flex flex-wrap gap-2">
              {skillsToSurface.map((skill, idx) => (
                <span key={idx} className="px-3 py-1.5 bg-green-50 text-green-700 text-xs font-semibold rounded-lg border border-green-100">
                  {skill}
                </span>
              ))}
            </div>
          ) : (
            <FieldUnavailable field={strategy.skillsToSurface as Exclude<StrategyField<string[]>, { status: 'available' }>} />
          )}
        </div>

        <div className="bg-white rounded-3xl border border-slate-100 p-5 shadow-sm">
          <h4 className="flex items-center gap-2 font-bold text-slate-800 mb-4">
            <ArrowDownCircle className="text-rose-500" size={20} /> Skills to Deprioritize
          </h4>
          {skillsToDeprioritise ? (
            <div className="flex flex-wrap gap-2">
              {skillsToDeprioritise.map((skill, idx) => (
                <span key={idx} className="px-3 py-1.5 bg-slate-50 text-slate-600 text-xs rounded-lg border border-slate-200">
                  {skill}
                </span>
              ))}
            </div>
          ) : (
            <FieldUnavailable field={strategy.skillsToDeprioritise as Exclude<StrategyField<string[]>, { status: 'available' }>} />
          )}
        </div>
      </div>

      {/* Section Order & Eligibility */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2 bg-white rounded-3xl border border-slate-100 p-5 shadow-sm">
          <h4 className="flex items-center gap-2 font-bold text-slate-800 mb-4">
            <LayoutList size={20} className="text-accent-cyan" /> Optimal Section Order
          </h4>
          {sectionOrder ? (
            <div className="flex flex-wrap items-center gap-2">
              {sectionOrder.map((section, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="px-3 py-1 bg-sky-50 text-accent-cyan font-medium text-sm rounded-lg border border-purple-100">
                    {idx + 1}. {section}
                  </span>
                  {idx < sectionOrder.length - 1 && <span className="text-slate-300 text-lg">→</span>}
                </div>
              ))}
            </div>
          ) : (
            <FieldUnavailable field={strategy.sectionOrder as Exclude<StrategyField<string[]>, { status: 'available' }>} />
          )}
        </div>

        {/* Eligibility note — cautious wording, never a bare "Visa YES". */}
        <div className="bg-white rounded-3xl border border-slate-100 p-5 shadow-sm flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Globe2 size={20} className={eligibility.hardBlocker ? 'text-rose-500' : 'text-blue-500'} />
            <h4 className="font-bold text-slate-800">Eligibility Note</h4>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">{eligibility.summary}</p>
        </div>
      </div>
    </motion.div>
  );
}
