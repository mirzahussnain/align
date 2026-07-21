'use client';

import { motion, type Variants } from 'framer-motion';
import { ClipboardList, CheckCircle2, AlertCircle, HelpCircle } from 'lucide-react';
import GlassCard from '@/shared/components/ui/GlassCard';
import type { JobMatchDataV2, RequirementStatus } from '@/shared/types/ai';
import {
  getPersonSpecificationRequirements,
  type RequirementDisplayRow,
} from '@/shared/utils/job-match-view';

/**
 * Person-specification mapping for supporting-statement-led applications
 * (NHS, councils, universities). Lists each extracted criterion with its
 * canonical ledger assessment, so the candidate can plan a
 * statement that addresses every essential criterion explicitly.
 */
export default function CriterionMappingPanel({
  data,
  contentVariants,
}: {
  data: JobMatchDataV2;
  contentVariants: Variants;
}) {
  const criteria = getPersonSpecificationRequirements(data);
  const essential = criteria.filter((criterion) => criterion.importance === 'mandatory');
  const desirable = criteria.filter((criterion) => criterion.importance === 'desirable');

  const badge = (state: RequirementStatus) => {
    switch (state) {
      case 'met':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700">
            <CheckCircle2 size={12} /> Evidence found
          </span>
        );
      case 'not_met':
      case 'contradicted':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700">
            <AlertCircle size={12} /> {state === 'contradicted' ? 'Contradicted' : 'Not evidenced'}
          </span>
        );
      case 'partial':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700">
            <AlertCircle size={12} /> Partial evidence
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-500">
            <HelpCircle size={12} /> Unclear
          </span>
        );
    }
  };

  const renderGroup = (title: string, items: RequirementDisplayRow[]) =>
    items.length > 0 && (
      <div className="space-y-2">
        <h3 className="text-sm font-bold text-text-primary">{title}</h3>
        {items.map(criterion => (
          <div key={criterion.id} className="flex items-start justify-between gap-3 rounded-xl border border-slate-100 bg-white/60 p-3">
            <div className="min-w-0">
              <p className="text-xs text-text-secondary leading-relaxed">{criterion.text}</p>
              <p className="mt-1 text-[10px] uppercase tracking-wide text-slate-400">
                {criterion.category}
                {criterion.evidenceRequired ? ' · evidence expected' : ''}
              </p>
              {criterion.evidence.length > 0 && (
                <div className="mt-2 space-y-1">
                  {criterion.evidence.map((evidence, index) => (
                    <p key={`${criterion.id}-evidence-${index}`} className="text-[11px] leading-relaxed text-slate-600">
                      <span className="font-bold uppercase text-slate-400">{evidence.source}</span>
                      {evidence.location ? ` · ${evidence.location}` : ''}: {evidence.text}
                    </p>
                  ))}
                </div>
              )}
            </div>
            <div className="shrink-0">{badge(criterion.status)}</div>
          </div>
        ))}
      </div>
    );

  return (
    <motion.div variants={contentVariants} initial="hidden" animate="visible" exit="exit" className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-text-primary flex items-center gap-2">
          <ClipboardList className="text-accent-purple" size={22} /> Person Specification
        </h2>
        <p className="text-text-secondary text-sm mt-1">
          Criteria extracted from the advert, mapped against the evidence found in your CV
        </p>
      </div>

      <GlassCard className="p-5 border-accent-purple/20 bg-accent-purple/5" hover={false}>
        <p className="text-xs text-text-secondary leading-relaxed">
          Applications like this are usually shortlisted on a <span className="font-bold">supporting statement</span>,
          not the CV alone. Address every essential criterion explicitly, in the spec&apos;s own wording, with one
          concrete example each — transferable experience counts when you say where it came from. Never claim
          experience the CV can&apos;t back up.
        </p>
      </GlassCard>

      {renderGroup('Essential criteria', essential)}
      {renderGroup('Desirable criteria', desirable)}
    </motion.div>
  );
}
