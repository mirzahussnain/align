import { motion, type Variants } from 'framer-motion';
import { Target } from 'lucide-react';
import type { JobMatchDataV2, RequirementStatus } from '@/shared/types/ai';
import { getAlignmentRequirements, type RequirementDisplayRow } from '@/shared/utils/job-match-view';

interface SkillAlignmentPanelProps {
  data: JobMatchDataV2;
  contentVariants: Variants;
}

export default function SkillAlignmentPanel({ data, contentVariants }: SkillAlignmentPanelProps) {
  const requirements = getAlignmentRequirements(data);
  const essential = requirements.filter((requirement) => requirement.importance === 'mandatory');
  const desirable = requirements.filter((requirement) => requirement.importance === 'desirable');

  const statusLabel: Record<RequirementStatus, string> = {
    met: 'Met',
    partial: 'Partial',
    not_met: 'Not met',
    contradicted: 'Contradicted',
    unclear: 'Unclear',
  };

  const renderRequirements = (title: string, items: RequirementDisplayRow[]) =>
    items.length > 0 && (
      <div>
        <h4 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500">{title}</h4>
        <div className="space-y-2">
          {items.map((requirement) => (
            <div key={requirement.id} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="text-sm font-semibold text-slate-800">{requirement.text}</p>
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                  {statusLabel[requirement.status]}
                </span>
              </div>
              {requirement.evidence.map((evidence, index) => (
                <p key={`${requirement.id}-evidence-${index}`} className="mt-1 text-xs text-slate-600">
                  <span className="font-bold uppercase text-slate-400">{evidence.source}</span>
                  {evidence.location ? ` · ${evidence.location}` : ''}: {evidence.text}
                </p>
              ))}
            </div>
          ))}
        </div>
      </div>
    );

  return (
    <motion.div variants={contentVariants} initial="hidden" animate="visible" exit="exit" className="bg-bg-panel rounded-[32px] border border-slate-200/60 shadow-sm p-6 sm:p-8">
      <div className="flex items-center gap-4 mb-8">
        <div className="w-12 h-12 rounded-2xl bg-purple-50 flex items-center justify-center text-purple-600">
          <Target size={24} />
        </div>
        <div>
          <h2 className="text-xl font-black text-slate-800 tracking-tight">Requirement Alignment</h2>
          <p className="text-sm text-slate-500 font-medium mt-0.5">Essential and Desirable evidence</p>
        </div>
      </div>

      <div className="space-y-6">
        {renderRequirements('Essential requirements', essential)}
        {renderRequirements('Desirable requirements', desirable)}
      </div>
    </motion.div>
  );
}
