import { BookOpen, Sparkles } from 'lucide-react';
import { cn } from '@/shared/utils/cn';
import Tabs from '@/shared/components/ui/Tabs';

interface FormattedLine {
  type: 'heading' | 'empty' | 'text';
  content: string;
  isSummaryLine?: boolean;
  htmlContent?: string;
  rewriteMatch?: { index: number };
}

interface ResumePreviewPanelProps {
  formattedCVLines: FormattedLine[];
  cvViewMode: 'original' | 'annotated';
  setCvViewMode: (mode: 'original' | 'annotated') => void;
  activeRewriteIndex: number | null;
  setActiveRewriteIndex: (idx: number) => void;
  scrollToSection: (id: string) => void;
}

export default function ResumePreviewPanel({
  formattedCVLines,
  cvViewMode,
  setCvViewMode,
  activeRewriteIndex,
  setActiveRewriteIndex,
  scrollToSection
}: ResumePreviewPanelProps) {
  return (
    <div id="section-overview" className="space-y-4 scroll-mt-24">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-extrabold text-slate-400 tracking-wider uppercase flex items-center gap-1.5">
          <BookOpen size={14} className="text-slate-400" />
          Resume Live Analysis Preview
        </h3>

        {/* View Mode Toggle using the new pill variant */}
        <Tabs
          variant="pill"
          activeTab={cvViewMode}
          onChange={(val) => setCvViewMode(val as 'original' | 'annotated')}
          tabs={[
            { label: 'Original', value: 'original' },
            { 
              label: (
                <>
                  <Sparkles size={10} className={cn(cvViewMode === 'annotated' ? "text-accent-purple" : "text-slate-400")} />
                  Annotated Mode
                </>
              ),
              value: 'annotated',
              activeClassName: 'text-accent-purple'
            }
          ]}
        />
      </div>

      {cvViewMode === 'annotated' && (
        <div className="text-[11px] text-slate-500 bg-slate-50 border border-slate-100 rounded-xl p-3 flex items-center justify-center gap-2 max-w-[800px] mx-auto select-none w-full shadow-sm shadow-slate-100/10">
          <span className="font-bold text-slate-700">Annotated Legend:</span>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <span className="flex items-center gap-1.5 font-semibold">
              <span className="w-2.5 h-2.5 rounded bg-yellow-50 border border-amber-300 flex-shrink-0" />
              Professional Summary
            </span>
            <span className="flex items-center gap-1.5 font-semibold">
              <span className="w-2.5 h-2.5 rounded bg-purple-100/70 border border-purple-200 flex-shrink-0" />
              ATS Keywords
            </span>
            <span className="flex items-center gap-1.5 font-semibold">
              <span className="w-2.5 h-2.5 rounded bg-red-100/40 border border-red-200 flex-shrink-0" />
              Weak Bullets (Clickable)
            </span>
          </div>
        </div>
      )}

      <div className="bg-white border border-slate-200/80 rounded-2xl shadow-xl shadow-slate-100/40 p-10 md:p-12 min-h-[750px] max-w-[800px] mx-auto text-left font-sans text-xs md:text-sm text-slate-700 leading-relaxed relative overflow-hidden">
        {/* Visual Header Grid Accent */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-accent-purple via-accent-cyan to-success" />

        <div className="space-y-1.5">
          {formattedCVLines.map((line, idx) => {
            if (line.type === 'empty') {
              return <div key={idx} className="h-3" />;
            }

            if (line.type === 'heading') {
              return (
                <div key={idx} className="pt-4 pb-1 border-b border-slate-100/80 mb-2">
                  <h4 className="text-xs md:text-sm font-bold text-slate-800 dark:text-slate-900 tracking-wider uppercase">
                    {line.content}
                  </h4>
                </div>
              );
            }

            // If original mode is active, display regular plain text
            if (cvViewMode === 'original') {
              return (
                <p key={idx} className="leading-relaxed py-0.5">
                  {line.content}
                </p>
              );
            }

            // Render normal line with highlights (Annotated Mode)
            if (line.isSummaryLine) {
              return (
                <p
                  key={idx}
                  className="bg-yellow-50 text-slate-700 px-1.5 py-0.5 rounded border-l-2 border-warning/50 font-medium inline-block w-full my-0.5"
                  title="Professional Summary Block"
                >
                  {line.content}
                </p>
              );
            }

            if (line.rewriteMatch) {
              const isCurrent = line.rewriteMatch.index === activeRewriteIndex;
              return (
                <div
                  key={idx}
                  onClick={() => {
                    scrollToSection('impactStatements');
                    setActiveRewriteIndex(line.rewriteMatch!.index);
                  }}
                  className={cn(
                    "group cursor-pointer p-1.5 rounded border-l-2 my-1 transition-all duration-200",
                    isCurrent
                      ? "bg-red-100/40 border-error text-red-900 font-semibold shadow-sm"
                      : "bg-red-50/20 border-red-200 text-red-900 hover:bg-red-50/60"
                  )}
                  title="Click to view suggested bullet rewrite"
                >
                  <div className="flex items-start gap-2 justify-between">
                    <span className="flex-1 leading-relaxed">
                      {line.content}
                    </span>
                    <span className="flex-shrink-0 text-[9px] bg-error/10 text-error font-bold px-1.5 py-0.5 rounded uppercase self-center tracking-wider opacity-80 group-hover:opacity-100">
                      {isCurrent ? "Active Recommendation" : "Weak Bullet"}
                    </span>
                  </div>
                </div>
              );
            }

            // Render regular text with highlighted keywords
            return (
              <p
                key={idx}
                className="leading-relaxed py-0.5"
                dangerouslySetInnerHTML={{ __html: line.htmlContent || line.content }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
