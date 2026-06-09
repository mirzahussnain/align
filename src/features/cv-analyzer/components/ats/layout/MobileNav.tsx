import { cn } from '@/shared/utils/cn';
import { ArrowLeft, BookOpen, Sparkles, LayoutList, CheckCircle, AlertOctagon, AlertTriangle, PenTool } from 'lucide-react';
import { DASHBOARD_NAVIGATION_GROUPS } from '../../../constants/dashboard-navigation';

interface MobileNavProps {
  isMobileDetailView: boolean;
  setIsMobileDetailView: (val: boolean) => void;
  mobileNavRef: React.RefObject<HTMLDivElement | null>;
  activeGroupId: string;
  getGroupScore: (id: string) => number;
  scrollToSection: (id: string) => void;
}

export default function MobileNav({
  isMobileDetailView,
  setIsMobileDetailView,
  mobileNavRef,
  activeGroupId,
  getGroupScore,
  scrollToSection
}: MobileNavProps) {
  
  const getGroupIcon = (id: string) => {
    switch(id) {
      case 'overview': return <Sparkles size={14} />;
      case 'content': return <PenTool size={14} />;
      case 'sections': return <LayoutList size={14} />;
      case 'ats-essentials': return <CheckCircle size={14} />;
      case 'hr-red-flags': return <AlertOctagon size={14} />;
      case 'discrimination': return <AlertTriangle size={14} />;
      case 'seniority': return <BookOpen size={14} />;
      default: return <BookOpen size={14} />;
    }
  };

  return (
    <div className={cn(
      "lg:hidden sticky top-[61px] z-40 bg-white border-b border-slate-200 shadow-sm -mx-4 sm:-mx-6 px-4 sm:px-6 mb-2",
      !isMobileDetailView ? "hidden" : "block"
    )}>
      <div className="flex items-center w-full py-3">
        <button 
          onClick={() => setIsMobileDetailView(false)}
          className="p-2 mr-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-600 flex-shrink-0 transition-colors"
        >
          <ArrowLeft size={18} />
        </button>
        <div 
          ref={mobileNavRef}
          className="flex-1 overflow-x-auto no-scrollbar flex items-center gap-2 pb-1"
          style={{ msOverflowStyle: 'none', scrollbarWidth: 'none' }}
        >
          {DASHBOARD_NAVIGATION_GROUPS.map(group => {
            const isActive = activeGroupId === group.id;
            const score = getGroupScore(group.id);
            return (
              <button
                key={group.id}
                data-active={isActive}
                onClick={() => {
                  if (group.items.length > 0) {
                    scrollToSection(group.items[0].id);
                  }
                }}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2 rounded-xl whitespace-nowrap text-xs font-bold transition-all border",
                  isActive 
                    ? "bg-purple-100/80 text-purple-800 border-purple-200 shadow-sm"
                    : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"
                )}
              >
                <span className={cn(isActive ? "text-purple-700" : "text-slate-400")}>
                  {getGroupIcon(group.id)}
                </span>
                {group.label}
                <span className={cn(
                  "ml-1 px-1.5 py-0.5 rounded text-[10px]",
                  isActive ? "bg-white text-purple-700 font-black" : "text-slate-400 bg-slate-100 font-semibold"
                )}>
                  {score}%
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
