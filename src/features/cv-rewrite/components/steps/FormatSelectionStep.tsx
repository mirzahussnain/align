'use client';

import { CheckCircle2, FileText, FileDown } from 'lucide-react';
import { cn } from '@/shared/utils/cn';
import type { ExportFormat } from '../RewriteWizardModal';

interface Props {
  selected: ExportFormat;
  onSelect: (format: ExportFormat) => void;
}

export default function FormatSelectionStep({ selected, onSelect }: Props) {
  return (
    <div className="space-y-6">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-slate-800">Choose Export Format</h3>
        <p className="text-sm text-slate-500">We highly recommend Word (.docx) for ATS portals, but PDF is available for emails or human reviewers.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div
          onClick={() => onSelect('docx')}
          className={cn(
            "relative p-5 rounded-2xl border-2 transition-all cursor-pointer flex flex-col items-center text-center",
            selected === 'docx' 
              ? "border-accent-cyan bg-sky-50/50 shadow-md scale-[1.02]" 
              : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
          )}
        >
          {selected === 'docx' && (
            <div className="absolute top-4 right-4 text-accent-cyan">
              <CheckCircle2 size={24} className="fill-sky-100" />
            </div>
          )}
          
          <div className="w-16 h-16 rounded-full bg-blue-100 text-blue-600 mb-4 flex items-center justify-center">
            <FileText size={32} />
          </div>

          <h4 className="font-bold text-slate-800 mb-1">Microsoft Word (.docx)</h4>
          <p className="text-xs text-slate-500 leading-relaxed mb-3">100% ATS Safe. Fully editable if you need to make final tweaks.</p>
          <span className="inline-block px-2.5 py-1 bg-green-100 text-green-700 text-[10px] font-bold rounded-full uppercase tracking-wider">
            Recommended
          </span>
        </div>

        <div
          onClick={() => onSelect('pdf')}
          className={cn(
            "relative p-5 rounded-2xl border-2 transition-all cursor-not-allowed opacity-50 flex flex-col items-center text-center bg-slate-50 border-slate-100"
          )}
        >
          <div className="w-16 h-16 rounded-full bg-red-100 text-red-600 mb-4 flex items-center justify-center">
            <FileDown size={32} />
          </div>

          <h4 className="font-bold text-slate-800 mb-1">PDF Document (.pdf)</h4>
          <p className="text-xs text-slate-500 leading-relaxed mb-3">Coming soon. Currently, please download the DOCX and &quot;Save as PDF&quot; via Word.</p>
        </div>
      </div>
    </div>
  );
}
