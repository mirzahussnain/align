'use client';

import { CheckCircle2 } from 'lucide-react';
import { cn } from '@/shared/utils/cn';
import type { TemplateId } from '@/shared/constants/templates';

interface Props {
  selected: string;
  onSelect: (id: TemplateId) => void;
}

interface Template {
  id: TemplateId;
  name: string;
  description: string;
  atsSafe: boolean;
  disabled?: boolean;
}

const TEMPLATES: Template[] = [
  {
    id: 'architect',
    name: 'The Architect',
    description: 'Deep navy and warm slate with strong hierarchy for experienced professional roles.',
    atsSafe: true,
  },
  {
    id: 'editorial_refined',
    name: 'Editorial Refined',
    description: 'Warm slate palette, serif name treatment. Feels like a well-designed magazine editorial.',
    atsSafe: true,
  },
  {
    id: 'technical_precision',
    name: 'Technical Precision',
    description: 'Teal & charcoal. Monospace name treatment. Clean inline grid for skills. Modern engineering identity.',
    atsSafe: true,
  },
  {
    id: 'academic_latex',
    name: 'Academic Research (LaTeX)',
    description: 'Classic Computer Modern serif layout. Ideal for researchers, scientists, and PhD candidates.',
    atsSafe: true,
  }
];

export default function TemplateSelectionStep({ selected, onSelect }: Props) {
  return (
    <div className="space-y-6">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-slate-800">Choose a design</h3>
        <p className="text-sm text-slate-500">Each template uses a clear, single-column-friendly structure designed for reliable ATS parsing.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {TEMPLATES.map((tpl) => (
          <div
            key={tpl.id}
            onClick={() => !tpl.disabled && onSelect(tpl.id)}
            className={cn(
              "relative p-5 rounded-2xl border-2 transition-all cursor-pointer",
              tpl.disabled ? "opacity-50 cursor-not-allowed bg-slate-50 border-slate-100" :
              selected === tpl.id 
                ? "border-accent-cyan bg-sky-50/50 shadow-md scale-[1.02]" 
                : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
            )}
          >
            {selected === tpl.id && (
              <div className="absolute top-4 right-4 text-accent-cyan">
                <CheckCircle2 size={24} className="fill-sky-100" />
              </div>
            )}
            
            <div className="w-12 h-12 rounded-xl bg-slate-200 mb-4 flex items-center justify-center">
              {/* Placeholder for template thumbnail */}
              <div className="w-6 h-8 bg-white shadow-sm border border-slate-300 rounded-sm"></div>
            </div>

            <h4 className="font-bold text-slate-800 mb-1">{tpl.name}</h4>
            <p className="text-xs text-slate-500 leading-relaxed mb-3">{tpl.description}</p>
            
            {tpl.atsSafe && (
              <span className="inline-block px-2.5 py-1 bg-green-100 text-green-700 text-[10px] font-bold rounded-full uppercase tracking-wider">
                ATS-conscious
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
