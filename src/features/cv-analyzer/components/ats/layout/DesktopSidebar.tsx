import { cn } from '@/shared/utils/cn';
import { ChevronDown, ChevronUp } from 'lucide-react';
import ScoreDial from '@/shared/components/ui/CircularProgress';
import { SidebarNavItem } from '../../shared/SidebarNavItem';
import { DASHBOARD_NAVIGATION_GROUPS } from '../../../constants/dashboard-navigation';

interface DesktopSidebarProps {
  desktopNavRef: React.RefObject<HTMLElement | null>;
  overallScore: number;
  totalIssues: number;
  missingKeywordsCount: number;
  activeGroupId: string | null;
  expandedGroups: Record<string, boolean>;
  activeItem: string;
  toggleGroup: (id: string) => void;
  getGroupScore: (id: string) => number;
  getItemStatusAndBadge: (id: string) => { isPassed: boolean; badgeText?: string };
  scrollToSection: (id: string) => void;
}

export default function DesktopSidebar({
  desktopNavRef,
  overallScore,
  totalIssues,
  missingKeywordsCount,
  activeGroupId,
  expandedGroups,
  activeItem,
  toggleGroup,
  getGroupScore,
  getItemStatusAndBadge,
  scrollToSection
}: DesktopSidebarProps) {
  return (
    <div className="hidden lg:flex w-80 flex-shrink-0 sticky top-24 z-20 bg-white border border-slate-200/80 rounded-[24px] shadow-sm shadow-slate-100/40 p-5 flex-col gap-5 max-h-[calc(100vh-125px)] overflow-hidden">
      
      {/* Your Score Section */}
      <div className="flex flex-col items-center flex-shrink-0">
        <h2 className="text-[10px] font-bold text-slate-400 tracking-wider uppercase mb-5 text-center w-full">
          Your ATS Score
        </h2>
        <ScoreDial score={overallScore} size="lg" label="" />
        <div className="mt-5 grid grid-cols-2 gap-4 w-full flex-shrink-0">
          <div className="bg-error/5 border border-error/10 rounded-2xl p-2.5 text-center">
            <p className="text-lg font-black text-error leading-none">{totalIssues}</p>
            <p className="text-[9px] font-bold text-slate-400 tracking-wider uppercase mt-1">Issues</p>
          </div>
          <div className="bg-warning/5 border border-warning/10 rounded-2xl p-2.5 text-center">
            <p className="text-lg font-black text-warning leading-none">{missingKeywordsCount}</p>
            <p className="text-[9px] font-bold text-slate-400 tracking-wider uppercase mt-1">Missing</p>
          </div>
        </div>
      </div>

      <div className="border-t border-slate-100/85 w-full flex-shrink-0" />

      {/* Navigation Accordion */}
      <nav ref={desktopNavRef} className="space-y-3.5 w-full flex-1 overflow-y-auto pr-1 scrollbar-thin">
        {DASHBOARD_NAVIGATION_GROUPS.map((group) => {
          const isExpanded = expandedGroups[group.id];
          const groupScore = getGroupScore(group.id);
          return (
            <div key={group.id} className="space-y-1">
              <button
                onClick={() => toggleGroup(group.id)}
                className={cn(
                  "w-full flex items-center justify-between px-3 py-2 text-[11px] font-bold tracking-wider transition-colors text-left cursor-pointer group rounded-xl",
                  activeGroupId === group.id ? "bg-purple-50/50 text-slate-800" : "text-slate-600 hover:text-slate-800"
                )}
              >
                <div className="flex items-center gap-2">
                  <span className={cn("transition-colors font-bold uppercase", activeGroupId === group.id ? "text-purple-700" : "text-slate-400 group-hover:text-slate-700")}>{group.label}</span>
                  <span className={cn(
                    "px-1.5 py-0.5 rounded-full text-[9px] font-black border",
                    groupScore >= 90
                      ? "bg-emerald-50 text-emerald-700 border-emerald-100/60"
                      : groupScore >= 60
                      ? "bg-amber-50 text-amber-700 border-amber-100/60"
                      : "bg-rose-50/60 text-rose-700 border-rose-100/60"
                  )}>
                    {groupScore}%
                  </span>
                </div>
                {isExpanded ? <ChevronUp size={12} className="text-slate-400" /> : <ChevronDown size={12} className="text-slate-400" />}
              </button>

              {isExpanded && (
                <div className="space-y-0.5 animate-in fade-in duration-200">
                  {group.items.map((item) => {
                    const isActive = activeItem === item.id;
                    const { isPassed, badgeText } = getItemStatusAndBadge(item.id);
                    const status = item.type === 'premium' ? 'premium' : isPassed ? 'success' : 'error';

                    return (
                      <SidebarNavItem
                        key={item.id}
                        label={item.label}
                        status={status}
                        isActive={isActive}
                        badgeText={badgeText}
                        onClick={() => scrollToSection(item.id)}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <button className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-extrabold py-3 px-4 rounded-xl flex items-center justify-center gap-2 cursor-pointer shadow-sm transition-colors mt-2 text-xs uppercase tracking-wider flex-shrink-0">
        Unlock Full Report 🚀
      </button>
    </div>
  );
}
