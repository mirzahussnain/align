import { motion } from 'framer-motion';
import { Target } from 'lucide-react';
import type { AIJobMatchOutput as JobMatchData } from '@/shared/types/ai';

interface SkillAlignmentPanelProps {
  data: JobMatchData;
  contentVariants: any;
}

export default function SkillAlignmentPanel({ data, contentVariants }: SkillAlignmentPanelProps) {
  return (
    <motion.div variants={contentVariants} initial="hidden" animate="visible" exit="exit" className="bg-bg-panel rounded-[32px] border border-slate-200/60 shadow-sm p-6 sm:p-8">
      <div className="flex items-center gap-4 mb-8">
        <div className="w-12 h-12 rounded-2xl bg-purple-50 flex items-center justify-center text-purple-600">
          <Target size={24} />
        </div>
        <div>
          <h2 className="text-xl font-black text-slate-800 tracking-tight">Mandatory Skills</h2>
          <p className="text-sm text-slate-500 font-medium mt-0.5">Core Requirements Checklist</p>
        </div>
      </div>

      <div className="space-y-6">
        {data.mandatorySkills.missing.length > 0 && (
          <div>
            <h4 className="text-xs font-bold text-rose-500 mb-3 uppercase tracking-wider">Missing</h4>
            <div className="flex flex-wrap gap-2">
              {data.mandatorySkills.missing.map((skill, i) => (
                <span key={i} className="px-3 py-1.5 bg-rose-50 text-rose-700 border border-rose-100 rounded-lg text-sm font-bold">{skill}</span>
              ))}
            </div>
          </div>
        )}
        
        {data.mandatorySkills.partial.length > 0 && (
          <div>
            <h4 className="text-xs font-bold text-amber-500 mb-3 uppercase tracking-wider">Partial / Context Mismatch</h4>
            <div className="flex flex-col gap-2">
              {data.mandatorySkills.partial.map((skill, i) => (
                <div key={i} className="px-4 py-3 bg-amber-50 text-amber-800 border border-amber-200/60 rounded-xl text-sm font-medium">
                  {skill}
                </div>
              ))}
            </div>
          </div>
        )}

        {data.mandatorySkills.present.length > 0 && (
          <div>
            <h4 className="text-xs font-bold text-emerald-500 mb-3 uppercase tracking-wider">Matched</h4>
            <div className="flex flex-wrap gap-2">
              {data.mandatorySkills.present.map((skill, i) => (
                <span key={i} className="px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-lg text-sm font-bold">{skill}</span>
              ))}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
