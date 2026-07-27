import { motion, type Variants } from 'framer-motion';
import { Target, Lock } from 'lucide-react';
import type { RequirementStatus, JobRequirementLedgerEntry } from '@/shared/types/ai';
import type { JobMatchReportView } from '@/shared/types/job-match-report';

interface SkillAlignmentPanelProps {
  view: JobMatchReportView;
  contentVariants: Variants;
}

const statusLabel: Record<RequirementStatus, string> = {
  met: 'Met',
  partial: 'Partial',
  not_met: 'Not met',
  contradicted: 'Contradicted',
  unclear: 'Unclear',
};

const statusTone: Record<RequirementStatus, string> = {
  met: 'text-emerald-600',
  partial: 'text-amber-600',
  not_met: 'text-rose-600',
  contradicted: 'text-rose-700',
  unclear: 'text-slate-500',
};

export default function SkillAlignmentPanel({ view, contentVariants }: SkillAlignmentPanelProps) {
  const { items, totals } = view.requirements;
  const essential = items.filter((requirement) => requirement.importance === 'mandatory');
  const desirable = items.filter((requirement) => requirement.importance === 'desirable');

  const renderRequirement = (requirement: JobRequirementLedgerEntry) => (
    <div key={requirement.id} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-sm font-semibold text-slate-800">{requirement.text}</p>
        <span className={`text-[10px] font-black uppercase tracking-wider ${statusTone[requirement.status]}`}>
          {statusLabel[requirement.status]}
        </span>
      </div>
      {requirement.evidence.map((evidence, index) => (
        <p key={`${requirement.id}-evidence-${index}`} className="mt-1 text-xs text-slate-600">
          <span className="font-bold uppercase text-slate-400">{evidence.source}</span>
          {evidence.location ? ` · ${evidence.location}` : ''}: {evidence.text}
        </p>
      ))}
      {requirement.status !== 'met' && requirement.deduction.reason && (
        <p className="mt-2 text-xs text-slate-500">
          <span className="font-bold text-slate-600">Still missing: </span>
          {requirement.deduction.reason}
        </p>
      )}
    </div>
  );

  const renderRequirements = (title: string, group: JobRequirementLedgerEntry[]) =>
    group.length > 0 && (
      <div>
        <h4 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500">{title}</h4>
        <div className="space-y-2">{group.map(renderRequirement)}</div>
      </div>
    );

  return (
    <motion.div variants={contentVariants} initial="hidden" animate="visible" exit="exit" className="bg-bg-panel rounded-[32px] border border-slate-200/60 shadow-sm p-6 sm:p-8">
      <div className="flex items-center gap-4 mb-6">
        <div className="w-12 h-12 rounded-2xl bg-purple-50 flex items-center justify-center text-purple-600">
          <Target size={24} />
        </div>
        <div>
          <h2 className="text-xl font-black text-slate-800 tracking-tight">Requirement Alignment</h2>
          <p className="text-sm text-slate-500 font-medium mt-0.5">Essential and Desirable evidence</p>
        </div>
      </div>

      {/* Authoritative totals — computed server-side from the full ledger, so the
          visible/locked split is explicit and never implies the total is 3. */}
      <div className="mb-6 flex flex-wrap items-center gap-2 text-xs font-semibold">
        <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">
          {totals.mandatoryMet}/{totals.mandatory} essential met
        </span>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">
          {totals.desirableMet}/{totals.desirable} desirable met
        </span>
        {totals.locked > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-3 py-1 text-amber-700 border border-amber-100">
            <Lock size={11} /> {totals.visible} of {totals.total} shown · {totals.locked} locked
          </span>
        )}
      </div>

      <div className="space-y-6">
        {renderRequirements('Essential requirements', essential)}
        {renderRequirements('Desirable requirements', desirable)}
      </div>

      {totals.locked > 0 && (
        <div className="mt-6 rounded-2xl border border-dashed border-amber-200 bg-amber-50/60 p-4 text-center text-sm text-amber-800">
          {totals.locked} further requirement{totals.locked === 1 ? '' : 's'} {totals.locked === 1 ? 'is' : 'are'} part of the full requirement ledger.
        </div>
      )}
    </motion.div>
  );
}
