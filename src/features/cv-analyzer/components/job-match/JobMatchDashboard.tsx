'use client';

import { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Target, AlertCircle, FileEdit, Briefcase, BarChart2, ShieldAlert, Lock } from 'lucide-react';
import type { CVAnalysisResult } from '@/shared/types/cv';
import type { JobMatchReportView } from '@/shared/types/job-match-report';
import { SidebarNavItem } from '../shared/SidebarNavItem';
import { JOB_MATCH_NAVIGATION } from '../../constants/dashboard-navigation';

// Extracted Panels
import MatchSummaryPanel from './panels/MatchSummaryPanel';
import SkillAlignmentPanel from './panels/SkillAlignmentPanel';
import CriterionMappingPanel from './panels/CriterionMappingPanel';
import DomainFitPanel from './panels/DomainFitPanel';
import ScoringBreakdownPanel from './panels/ScoringBreakdownPanel';
import TailoredRewritesPanel from './panels/TailoredRewritesPanel';
import RewriteStrategyPanel from './panels/RewriteStrategyPanel';
import RewriteWizardModal from '@/features/cv-rewrite/components/RewriteWizardModal';
import { Sparkles, LayoutList } from 'lucide-react';

interface JobMatchDashboardProps {
  result: CVAnalysisResult;
}

type TabKey = 'summary' | 'criteria' | 'skills' | 'domain' | 'scoring' | 'rewrites' | 'strategy';

export default function JobMatchDashboard({ result }: JobMatchDashboardProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('summary');
  const [isWizardOpen, setIsWizardOpen] = useState(false);

  // The server builds the authoritative, plan-aware report view model from the
  // canonical ledger (report-projection → buildJobMatchReportView). The UI never
  // recomputes totals or the score from the projected subset — it renders this.
  const view = result.jobMatchReport;

  if (!view) {
    return (
      <div className="w-full p-8 text-center bg-rose-50 border border-rose-100 rounded-3xl text-rose-800">
        <AlertCircle className="mx-auto mb-3" size={32} />
        <h3 className="text-lg font-bold">Analysis Incomplete</h3>
        <p className="text-sm">
          We could not assemble the Job Match report for this analysis. Please re-run it for a current report.
        </p>
      </div>
    );
  }

  // Person-spec criteria only exist when the JD contained an explicit
  // essential/desirable list (NHS/council-style adverts).
  const hasCriteria = view.requirements.hasPersonSpecification;
  const navigation = hasCriteria
    ? [
        ...JOB_MATCH_NAVIGATION.slice(0, 1),
        { id: 'criteria', label: 'Person Specification', iconName: 'ClipboardList' },
        ...JOB_MATCH_NAVIGATION.slice(1),
      ]
    : [...JOB_MATCH_NAVIGATION];

  // Animation variants
  const contentVariants = {
    hidden: { opacity: 0, y: 15 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' as const } },
    exit: { opacity: 0, y: -10, transition: { duration: 0.2, ease: 'easeIn' as const } }
  };

  type NavItemStatus = 'success' | 'error' | 'warning' | 'info' | 'premium';

  const getNavItemProps = (
    id: string,
    v: JobMatchReportView
  ): { status: NavItemStatus; badgeText: string; icon: React.ReactNode } => {
    const totals = v.requirements.totals;
    const score = v.overview.score;
    switch (id) {
      case 'summary':
        return {
          status: score >= 80 ? 'success' : score >= 60 ? 'warning' : 'error' as const,
          badgeText: `${score}/100`,
          icon: <Target size={12} />
        };
      case 'criteria':
        return {
          status: 'info' as const,
          badgeText: `${v.requirements.items.filter((r) => r.sourceSection === 'person_specification').length} Criteria`,
          icon: <ShieldAlert size={12} />
        };
      case 'skills':
        return {
          status: totals.mandatory > 0 && totals.mandatoryMet === totals.mandatory ? 'success' : 'error' as const,
          badgeText: `${totals.mandatoryMet}/${totals.mandatory} Essential`,
          icon: <Target size={12} />
        };
      case 'domain':
        return {
          status:
            v.assessments.domainFit.status === 'mismatch' || v.assessments.eligibility.hardBlocker
              ? 'error'
              : v.assessments.domainFit.status === 'partial' || v.assessments.eligibility.locked
                ? 'warning'
                : 'success' as const,
          badgeText:
            v.assessments.domainFit.status === 'mismatch'
              ? 'Mismatch'
              : v.assessments.domainFit.status === 'partial'
                ? 'Partial'
                : 'Aligned',
          icon: <Briefcase size={12} />
        };
      case 'scoring': {
        const rows =
          v.scoreExplanation.visibleDeductions.length +
          (v.scoreExplanation.domainDeduction ? 1 : 0) +
          (v.scoreExplanation.lockedDeductionCount > 0 ? 1 : 0);
        return { status: 'info' as const, badgeText: `${rows} Items`, icon: <BarChart2 size={12} /> };
      }
      case 'rewrites':
        return {
          status: 'info' as const,
          badgeText:
            v.rewrites.availability === 'available'
              ? `${v.rewrites.items.length} Bullets`
              : v.rewrites.availability === 'plan_restricted'
                ? 'Locked'
                : 'None',
          icon: v.rewrites.availability === 'plan_restricted' ? <Lock size={12} /> : <FileEdit size={12} />
        };
      case 'strategy':
        return {
          status: 'info' as const,
          badgeText: v.strategy.locked ? 'Locked' : 'Blueprint',
          icon: v.strategy.locked ? <Lock size={12} /> : <LayoutList size={12} />
        };
      default:
        return { status: 'info' as const, badgeText: '', icon: <Target size={12} /> };
    }
  };

  const renderSidebarItems = () => {
    return (
      <>
        {navigation.map((item) => {
          const props = getNavItemProps(item.id, view);
          return (
            <SidebarNavItem
              key={item.id}
              label={item.label}
              status={props.status}
              isActive={activeTab === item.id}
              badgeText={props.badgeText}
              icon={props.icon}
              onClick={() => setActiveTab(item.id as TabKey)}
            />
          );
        })}

        {/* Rewrite Button - Desktop */}
        <div className="mt-6">
          <button
            onClick={() => setIsWizardOpen(true)}
            className="w-full relative group overflow-hidden rounded-2xl p-[1px] font-semibold"
          >
            <span className="absolute inset-0 bg-gradient-to-r from-accent-purple via-blue-500 to-accent-purple opacity-70 group-hover:opacity-100 transition-opacity duration-300"></span>
            <div className="relative bg-white/90 backdrop-blur-sm group-hover:bg-transparent transition-colors duration-300 rounded-2xl px-4 py-3 flex items-center justify-center gap-2">
              <Sparkles size={16} className="text-accent-purple group-hover:text-white transition-colors duration-300" />
              <span className="bg-gradient-to-r from-accent-purple to-blue-600 bg-clip-text text-transparent group-hover:text-white transition-colors duration-300">
                Rewrite CV
              </span>
            </div>
          </button>
        </div>
      </>
    );
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'summary':
        return <MatchSummaryPanel view={view} contentVariants={contentVariants} />;
      case 'criteria':
        return <CriterionMappingPanel view={view} contentVariants={contentVariants} />;
      case 'skills':
        return <SkillAlignmentPanel view={view} contentVariants={contentVariants} />;
      case 'domain':
        return <DomainFitPanel view={view} contentVariants={contentVariants} />;
      case 'scoring':
        return <ScoringBreakdownPanel view={view} contentVariants={contentVariants} />;
      case 'rewrites':
        return <TailoredRewritesPanel view={view} contentVariants={contentVariants} />;
      case 'strategy':
        return <RewriteStrategyPanel view={view} contentVariants={contentVariants} />;
    }
  };

  return (
    <div className="flex flex-col gap-6 w-full relative">
      {/* --- MAIN DASHBOARD: NAV & CONTENT --- */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
        {/* Left Sidebar Navigation */}
        <div className="lg:col-span-1 hidden lg:flex flex-col gap-1 sticky top-6">
          {renderSidebarItems()}
        </div>

        {/* Mobile Horizontal Navigation (Visible only on small screens) */}
        <div className="lg:hidden overflow-x-auto pb-2 scrollbar-hide -mx-4 px-4">
          <div className="flex flex-row gap-2 min-w-max">
            {navigation.map((item) => {
              const props = getNavItemProps(item.id, view);
              const widthClass = item.id === 'domain' ? 'w-56' : 'w-48';
              return (
                <div key={`mobile-${item.id}`} className={widthClass}>
                  <SidebarNavItem
                    label={item.label}
                    status={props.status}
                    isActive={activeTab === item.id}
                    badgeText={props.badgeText}
                    icon={props.icon}
                    onClick={() => setActiveTab(item.id as TabKey)}
                  />
                </div>
              );
            })}

            {/* Rewrite Button - Mobile */}
            <div className="w-48 flex items-center pl-2">
              <button
                onClick={() => setIsWizardOpen(true)}
                className="w-full relative group overflow-hidden rounded-2xl p-[1px] font-semibold"
              >
                <span className="absolute inset-0 bg-gradient-to-r from-accent-purple via-blue-500 to-accent-purple opacity-70 group-hover:opacity-100 transition-opacity duration-300"></span>
                <div className="relative bg-white/90 backdrop-blur-sm group-hover:bg-transparent transition-colors duration-300 rounded-2xl px-4 py-2 flex items-center justify-center gap-2">
                  <Sparkles size={14} className="text-accent-purple group-hover:text-white transition-colors duration-300" />
                  <span className="bg-gradient-to-r from-accent-purple to-blue-600 bg-clip-text text-transparent group-hover:text-white transition-colors duration-300 text-sm">
                    Rewrite
                  </span>
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* Right Content Area */}
        <div className="lg:col-span-3">
          <AnimatePresence mode="wait">
            {renderContent()}
          </AnimatePresence>
        </div>
      </div>

      {/* --- AI REWRITE WIZARD MODAL --- */}
      <RewriteWizardModal
        isOpen={isWizardOpen}
        onClose={() => setIsWizardOpen(false)}
        analysisId={result.analysisId}
        missingSkills={view.mandatoryGaps.missing}
      />
    </div>
  );
}
