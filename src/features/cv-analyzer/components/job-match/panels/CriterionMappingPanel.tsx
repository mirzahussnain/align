'use client';

import { motion, type Variants } from 'framer-motion';
import { ClipboardList, CheckCircle2, AlertCircle, HelpCircle } from 'lucide-react';
import GlassCard from '@/shared/components/ui/GlassCard';
import type { AIJobMatchOutput } from '@/shared/types/ai';
import type { SelectionCriterion } from '@/shared/types/criteria';

/**
 * Person-specification mapping for supporting-statement-led applications
 * (NHS, councils, universities). Lists each extracted criterion with a rough
 * evidence signal from the skill matching, so the candidate can plan a
 * statement that addresses every essential criterion explicitly.
 */
export default function CriterionMappingPanel({
  data,
  contentVariants,
}: {
  data: AIJobMatchOutput;
  contentVariants: Variants;
}) {
  const criteria = data.selectionCriteria ?? [];
  const essential = criteria.filter(c => c.type === 'essential');
  const other = criteria.filter(c => c.type !== 'essential');

  // Rough evidence signal: does any matched-skill entry share meaningful words
  // with the criterion? Indicative only — the statement still needs to make
  // the case explicitly.
  const evidenceFor = (criterion: SelectionCriterion): 'evidenced' | 'missing' | 'unclear' => {
    const words = criterion.text
      .toLowerCase()
      .split(/\W+/)
      .filter(w => w.length > 4);
    if (words.length === 0) return 'unclear';

    const matches = (entries: string[]) =>
      entries.some(entry => {
        const lower = entry.toLowerCase();
        return words.filter(w => lower.includes(w)).length >= Math.min(2, words.length);
      });

    if (matches(data.mandatorySkills.present) || matches(data.desirableSkills.present)) return 'evidenced';
    if (matches(data.mandatorySkills.missing) || matches(data.desirableSkills.missing)) return 'missing';
    return 'unclear';
  };

  const badge = (state: 'evidenced' | 'missing' | 'unclear') => {
    switch (state) {
      case 'evidenced':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700">
            <CheckCircle2 size={12} /> Evidence found
          </span>
        );
      case 'missing':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700">
            <AlertCircle size={12} /> Not evidenced
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-500">
            <HelpCircle size={12} /> Check manually
          </span>
        );
    }
  };

  const renderGroup = (title: string, items: SelectionCriterion[]) =>
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
            </div>
            <div className="shrink-0">{badge(evidenceFor(criterion))}</div>
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
      {renderGroup('Desirable criteria', other)}
    </motion.div>
  );
}
