import { cn } from '@/shared/utils/cn';
import { ArrowRight } from 'lucide-react';
import ScoreDial from '@/shared/components/ui/CircularProgress';

interface MobileSummaryProps {
  overallScore: number;
  totalIssues: number;
  isMobileDetailView: boolean;
  setIsMobileDetailView: (val: boolean) => void;
  /** Reset to the uploader. Omitted for stored reports, where there's nothing to reset to. */
  onNewUpload?: () => void;
}

export default function MobileSummary({ overallScore, totalIssues, isMobileDetailView, setIsMobileDetailView, onNewUpload }: MobileSummaryProps) {
  return (
    <div className={cn("flex flex-col lg:hidden w-full", isMobileDetailView ? "hidden" : "block")}>
      <div className="bg-white rounded-[24px] border border-slate-200 shadow-sm p-6 flex flex-col items-center max-w-sm mx-auto w-full relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-slate-900 to-accent-cyan" />
        <h2 className="text-sm font-bold text-slate-700 mb-8 mt-2">Resume Checker</h2>
        
        <div className="transform scale-110 mb-6">
          <ScoreDial score={overallScore} size="lg" label="" />
        </div>
        
        <div className="text-center mb-8">
          <p className="text-2xl font-black text-slate-800">{overallScore}/100</p>
          <p className="text-sm font-medium text-slate-500">{totalIssues} Issues</p>
        </div>

        <button 
          onClick={() => setIsMobileDetailView(true)}
          className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-colors mb-6 shadow-sm"
        >
          View Detailed Analysis <ArrowRight size={18} />
        </button>

        {onNewUpload && (
          <>
            <div className="w-full flex items-center gap-3 mb-6">
              <div className="flex-1 h-px bg-slate-200"></div>
              <span className="text-xs text-slate-400 font-medium">Or upload a new Resume</span>
              <div className="flex-1 h-px bg-slate-200"></div>
            </div>

            <button
              onClick={onNewUpload}
              className="w-full bg-white hover:bg-slate-50 text-slate-700 border-2 border-slate-200 font-bold py-3 px-4 rounded-xl transition-colors"
            >
              New Upload
            </button>
          </>
        )}
      </div>
    </div>
  );
}
