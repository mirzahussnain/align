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
  FileText 
} from 'lucide-react';
import type { JobMatchDataV2 } from '@/shared/types/ai';

interface RewriteStrategyPanelProps {
  data: JobMatchDataV2;
  contentVariants: Variants;
}

export default function RewriteStrategyPanel({ data, contentVariants }: RewriteStrategyPanelProps) {
  const spec = data.cv_build_spec;

  if (!spec) {
    return (
      <div className="p-8 text-center bg-slate-50 border border-slate-100 rounded-3xl text-slate-500">
        <p>Rewrite strategy is not available for this analysis.</p>
      </div>
    );
  }

  return (
    <motion.div
      variants={contentVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="space-y-6"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Recommended Template */}
        <div className="bg-white rounded-3xl border border-slate-100 p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center text-accent-purple">
              <FileSignature size={20} />
            </div>
            <div>
              <h3 className="font-bold text-slate-800">Recommended Design</h3>
              <p className="text-xs text-slate-500">{spec.recommended_template}</p>
            </div>
          </div>
          <p className="text-sm text-slate-600 leading-relaxed bg-slate-50 p-3 rounded-xl">
            {spec.template_rationale}
          </p>
        </div>

        {/* Lead Project */}
        <div className="bg-white rounded-3xl border border-slate-100 p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
              <Star size={20} />
            </div>
            <div>
              <h3 className="font-bold text-slate-800">Lead Project</h3>
              <p className="text-xs text-slate-500">Must appear first in your CV</p>
            </div>
          </div>
          <p className="text-sm font-medium text-slate-700 bg-slate-50 p-3 rounded-xl border border-slate-200">
            {spec.lead_project}
          </p>
        </div>
      </div>

      {/* Summary Angle & Cover Letter */}
      <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-3xl p-6 text-white shadow-md">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div>
            <h4 className="flex items-center gap-2 text-sm font-bold text-slate-300 uppercase tracking-wider mb-3">
              <PenLine size={16} /> Summary Angle
            </h4>
            <p className="text-sm leading-relaxed text-slate-200">
              {spec.summary_angle}
            </p>
          </div>
          <div>
            <h4 className="flex items-center gap-2 text-sm font-bold text-slate-300 uppercase tracking-wider mb-3">
              <FileText size={16} /> Cover Letter Angle
            </h4>
            <p className="text-sm leading-relaxed text-slate-200">
              {spec.cover_letter_angle}
            </p>
          </div>
        </div>
      </div>

      {/* Skills Strategy */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-3xl border border-slate-100 p-5 shadow-sm">
          <h4 className="flex items-center gap-2 font-bold text-slate-800 mb-4">
            <ArrowUpCircle className="text-green-500" size={20} /> Skills to Surface
          </h4>
          <div className="flex flex-wrap gap-2">
            {spec.skills_to_surface.map((skill, idx) => (
              <span key={idx} className="px-3 py-1.5 bg-green-50 text-green-700 text-xs font-semibold rounded-lg border border-green-100">
                {skill}
              </span>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-3xl border border-slate-100 p-5 shadow-sm">
          <h4 className="flex items-center gap-2 font-bold text-slate-800 mb-4">
            <ArrowDownCircle className="text-rose-500" size={20} /> Skills to Deprioritize
          </h4>
          <div className="flex flex-wrap gap-2">
            {spec.skills_to_deprioritise.map((skill, idx) => (
              <span key={idx} className="px-3 py-1.5 bg-slate-50 text-slate-600 text-xs rounded-lg border border-slate-200">
                {skill}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Section Order & Visa */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2 bg-white rounded-3xl border border-slate-100 p-5 shadow-sm">
          <h4 className="flex items-center gap-2 font-bold text-slate-800 mb-4">
            <LayoutList size={20} className="text-accent-purple" /> Optimal Section Order
          </h4>
          <div className="flex flex-wrap items-center gap-2">
            {spec.section_order.map((section, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <span className="px-3 py-1 bg-purple-50 text-accent-purple font-medium text-sm rounded-lg border border-purple-100">
                  {idx + 1}. {section}
                </span>
                {idx < spec.section_order.length - 1 && (
                  <span className="text-slate-300 text-lg">→</span>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-3xl border border-slate-100 p-5 shadow-sm flex flex-col justify-center items-center text-center">
          <Globe2 size={32} className={spec.visa_note_required ? "text-amber-500 mb-2" : "text-green-500 mb-2"} />
          <h4 className="font-bold text-slate-800 mb-1">Visa Note Required?</h4>
          <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
            spec.visa_note_required ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"
          }`}>
            {spec.visa_note_required ? "YES" : "NO"}
          </span>
        </div>
      </div>
    </motion.div>
  );
}
