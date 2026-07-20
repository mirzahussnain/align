'use client';

import { CVAnalysisResult } from '@/shared/types/cv';
import ScoreDial from '@/shared/components/ui/CircularProgress';
import KeywordsPanel from './panels/KeywordsPanel';
import CompliancePanel from './panels/CompliancePanel';
import SectionsPanel from './panels/SectionsPanel';
import ImpactPanel from './panels/ImpactPanel';
import { useState, useRef, useEffect } from 'react';
import { cn } from '@/shared/utils/cn';
import {
  BookOpen,
  Sparkles,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  PenTool,
  LayoutList,
  CheckCircle,
  AlertOctagon
} from 'lucide-react';
import { DASHBOARD_NAVIGATION_GROUPS } from '../../constants/dashboard-navigation';
import { useAnalysisDashboard } from '../../hooks/useAnalysisDashboard';
import { getParentGroupId } from '@/shared/utils/navigation';
import SectionGroup from './SectionGroup';

// Extracted Layout Shells & Components
import AlertBanner from '@/shared/components/ui/AlertBanner';
import MobileSummary from './layout/MobileSummary';
import MobileNav from './layout/MobileNav';
import DesktopSidebar from './layout/DesktopSidebar';
import ResumePreviewPanel from './panels/ResumePreviewPanel';

// Content Audit Group
import AtsReadabilityCard from './cards/content/AtsReadabilityCard';
import ImpactStatementsCard from './cards/content/ImpactStatementsCard';
import RepetitionCard from './cards/content/RepetitionCard';
import ProfessionalSummaryCard from './cards/content/ProfessionalSummaryCard';
import BulletsConsistencyCard from './cards/content/BulletsConsistencyCard';

// Sections Audit Group
import EssentialSectionsCard from './cards/sections/EssentialSectionsCard';
import ContactInfoCard from './cards/sections/ContactInfoCard';

// ATS Essentials Group
import FileFormatSizeCard from './cards/ats-essentials/FileFormatSizeCard';
import FormattingCard from './cards/ats-essentials/FormattingCard';
import EmailAddressCard from './cards/ats-essentials/EmailAddressCard';
import HeaderLinksCard from './cards/ats-essentials/HeaderLinksCard';
import FileNameCard from './cards/ats-essentials/FileNameCard';
import DatesLinksCard from './cards/ats-essentials/DatesLinksCard';

// HR Red Flags Group
import CredibilityCard from './cards/hr-red-flags/CredibilityCard';
import InterviewRisksCard from './cards/hr-red-flags/InterviewRisksCard';
import PeerBenchmarkingCard from './cards/hr-red-flags/PeerBenchmarkingCard';
import LinkedinMatchCard from './cards/hr-red-flags/LinkedinMatchCard';

// Discrimination Group
import RelevanceCard from './cards/discrimination/RelevanceCard';
import CredentialsCard from './cards/discrimination/CredentialsCard';

// Seniority Group
import RoleTargetCard from './cards/seniority/RoleTargetCard';

export default function AtsAnalysisDashboard({ result }: { result: CVAnalysisResult }) {
  const [isMobileDetailView, setIsMobileDetailView] = useState(false);
  const mobileNavRef = useRef<HTMLDivElement>(null);
  const desktopNavRef = useRef<HTMLElement>(null);

  const {
    activeItem,
    activeRewriteIndex,
    setActiveRewriteIndex,
    cvViewMode,
    setCvViewMode,
    expandedGroups,
    setExpandedGroups,
    toggleGroup,
    scrollToSection,
    aiRewrites,
    aiFeedback,
    originalSummary,
    formattedCVLines,
    contactInfo,
    bulletConsistency,
    repeatedWords,
    clichésList,
    targetRoleTitle,
    occupationLabel,
    roleAligned,
    hasRiskFactor,
    risksList,
    getCategoryScorePercent,
    getGroupScore,
    totalIssues,
    getItemStatusAndBadge
  } = useAnalysisDashboard(result);

  // Scroll spy active group
  const activeGroupId = getParentGroupId(DASHBOARD_NAVIGATION_GROUPS, activeItem, 'content');

  // Scroll mobile nav to keep active item in view
  useEffect(() => {
    if (isMobileDetailView && mobileNavRef.current) {
      const activeEl = mobileNavRef.current.querySelector('[data-active="true"]');
      if (activeEl) {
        activeEl.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      }
    }
  }, [activeGroupId, isMobileDetailView]);

  // Scroll desktop nav and auto-expand group to keep active item in view
  useEffect(() => {
    if (!isMobileDetailView && desktopNavRef.current) {
      // Auto-expand the parent group if closed
      if (activeGroupId && !expandedGroups[activeGroupId]) {
        setExpandedGroups(prev => ({ ...prev, [activeGroupId]: true }));
      }
      
      // Delay to let the group expand and render its DOM nodes before scrolling
      const timeoutId = setTimeout(() => {
        const activeEl = desktopNavRef.current?.querySelector('[data-active="true"]');
        if (activeEl) {
          activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }, 50);

      return () => clearTimeout(timeoutId);
    }
  }, [activeItem, activeGroupId, isMobileDetailView]);

  return (
    <div className="flex flex-col gap-6 w-full relative">
      {/* The rule-based score below is complete and unaffected, but the AI
          sections (summary, impact, rewrites) are missing. Saying so beats
          letting the report look mysteriously thin. */}
      {result.aiSkipped === 'quota' && (
        <AlertBanner title="AI insights paused — monthly limit reached" type="info">
          You&apos;ve used all the AI analyses included in your plan this month, so this report
          shows the rule-based ATS results only: formatting, sections, keywords and compliance
          are all still scored in full. The AI-written summary feedback, impact rewrites and
          role detection resume when your allowance resets at the start of next month.
        </AlertBanner>
      )}

      {result.outOfDomain && (
        <AlertBanner title="We couldn't confidently match your CV to a supported occupation" type="warning">
          This report was scored against general UK CV standards rather than occupation-specific
          expectations, so some scores may read lower than they should. Set a target occupation on
          your profile — or include your target role title prominently on the CV — and re-analyse
          for a calibrated report.
        </AlertBanner>
      )}

      {/* --- MOBILE SUMMARY VIEW --- */}
      <MobileSummary
        overallScore={result.overallScore}
        totalIssues={totalIssues}
        isMobileDetailView={isMobileDetailView}
        setIsMobileDetailView={setIsMobileDetailView}
      />

      {/* --- MOBILE DETAILED VIEW TOP NAV --- */}
      <MobileNav
        isMobileDetailView={isMobileDetailView}
        setIsMobileDetailView={setIsMobileDetailView}
        mobileNavRef={mobileNavRef}
        activeGroupId={activeGroupId || ''}
        getGroupScore={getGroupScore}
        scrollToSection={scrollToSection}
      />

      {/* --- MAIN DASHBOARD --- */}
      <div className={cn(
        "flex-col lg:flex-row gap-8 items-start w-full bg-slate-50/50 p-1 rounded-3xl",
        !isMobileDetailView ? "hidden lg:flex" : "flex"
      )}>

      {/* Left Sidebar (Desktop Only) */}
      <DesktopSidebar
        desktopNavRef={desktopNavRef}
        overallScore={result.overallScore}
        totalIssues={totalIssues}
        missingKeywordsCount={result.keywords.missing.length}
        activeGroupId={activeGroupId}
        expandedGroups={expandedGroups}
        activeItem={activeItem}
        toggleGroup={toggleGroup}
        getGroupScore={getGroupScore}
        getItemStatusAndBadge={getItemStatusAndBadge}
        scrollToSection={scrollToSection}
      />

      {/* Right Column (Details stacked vertically) */}
      <div className="flex-1 w-full space-y-12 pb-20">
        
        {/* ==================== RESUME PREVIEW GROUP ==================== */}
        <SectionGroup id="overview" title="Live Analysis Preview" icon={<Sparkles size={24} />} score={result.overallScore}>
          <ResumePreviewPanel
            formattedCVLines={formattedCVLines as any}
            cvViewMode={cvViewMode}
            setCvViewMode={setCvViewMode}
            activeRewriteIndex={activeRewriteIndex}
            setActiveRewriteIndex={setActiveRewriteIndex}
            scrollToSection={scrollToSection}
          />
        </SectionGroup>

        {/* ==================== CONTENT AUDIT GROUP ==================== */}
        <SectionGroup id="content" title="Content Audit" icon={<PenTool size={24} />} score={getGroupScore('content')}>
          {/* Section 2: ATS Parse Rate */}
          <AtsReadabilityCard
            rawText={result.rawText}
            score={!/[\u200b\u200c\u200d\ufeff]/.test(result.rawText) ? "Clean" : "Issues found"}
            scoreStatus={!/[\u200b\u200c\u200d\ufeff]/.test(result.rawText) ? 'excellent' : 'critical'}
            details={getCategoryScorePercent('atsReadability') === 100 ? undefined : result.categories.find(c => c.id === 'atsReadability')?.details}
          />

          {/* Section 3: Quantifying Impact */}
          <ImpactStatementsCard
            score={`${result.categories.find(c => c.id === 'impactStatements')?.score || 0}/${result.categories.find(c => c.id === 'impactStatements')?.maxScore || 10}`}
            scoreStatus={result.categories.find(c => c.id === 'impactStatements')?.status}
            details={result.categories.find(c => c.id === 'impactStatements')?.details}
            aiRewrites={aiRewrites}
            aiFeedback={aiFeedback}
            activeRewriteIndex={activeRewriteIndex}
            setActiveRewriteIndex={setActiveRewriteIndex}
          />

          {/* Section 4: Repetition */}
          <RepetitionCard repeatedWords={repeatedWords} />

          {/* Section 5: Spelling & Grammar */}
          <ProfessionalSummaryCard
            score={`${result.categories.find(c => c.id === 'professionalSummary')?.score || 0}/${result.categories.find(c => c.id === 'professionalSummary')?.maxScore || 10}`}
            scoreStatus={result.categories.find(c => c.id === 'professionalSummary')?.status}
            details={result.categories.find(c => c.id === 'professionalSummary')?.details}
            originalSummary={originalSummary}
          />

          {/* Section 6: ATS Keywords */}
          <div id="section-keywordDensity" className="scroll-mt-24 pt-6 border-t border-slate-100">
            <KeywordsPanel result={result} />
          </div>

          {/* Section 7: Bullets Consistency */}
          <BulletsConsistencyCard bulletConsistency={bulletConsistency} />
        </SectionGroup>

        {/* ==================== SECTIONS AUDIT GROUP ==================== */}
        <SectionGroup id="sections" title="Sections Audit" icon={<LayoutList size={24} />} score={getGroupScore('sections')}>
          {/* Section 8: Essential Sections */}
          <EssentialSectionsCard rawText={result.rawText} />

          {/* Section 9: Contact Information */}
          <ContactInfoCard contactInfo={contactInfo} />

          {/* Section 10: Sections Order */}
          <div id="section-sectionOrder" className="scroll-mt-24 pt-6 border-t border-slate-100">
            <SectionsPanel result={result} />
          </div>
        </SectionGroup>

        {/* ==================== ATS ESSENTIALS GROUP ==================== */}
        <SectionGroup id="ats-essentials" title="ATS Essentials" icon={<CheckCircle size={24} />} score={getGroupScore('ats-essentials')}>
          {/* Section 11: File Format & Size */}
          <FileFormatSizeCard
            pageCount={result.pageCount}
            estimatedReadTime={result.formatting.estimatedReadTime}
            details={result.categories.find(c => c.id === 'pageCount' || c.id === 'formatting')?.details}
          />

          {/* Section 12: Design */}
          <FormattingCard
            formatting={result.formatting}
            details={result.categories.find(c => c.id === 'formatting')?.details}
          />

          {/* Section 13: Email Address */}
          <EmailAddressCard email={contactInfo.email} />

          {/* Section 14: Header Links */}
          <HeaderLinksCard linkedin={contactInfo.linkedin} />

          {/* Section 15: File Name Check */}
          <FileNameCard />

          {/* Section 16: Dates & Links */}
          <DatesLinksCard formattingIssues={result.formatting.issues} />
        </SectionGroup>

        {/* ==================== HR RED FLAGS GROUP ==================== */}
        <SectionGroup id="hr-red-flags" title="HR Red Flags" icon={<AlertOctagon size={24} />} score={getGroupScore('hr-red-flags')}>
          {/* Section 17: Credibility */}
          <CredibilityCard clichésList={clichésList} />

          {/* Section 18: Interview Risks */}
          <InterviewRisksCard hasRiskFactor={hasRiskFactor} risksList={risksList} />

          {/* Section 19: Peer Benchmarking */}
          <PeerBenchmarkingCard overallScore={result.overallScore} />

          {/* Section 20: LinkedIn Match */}
          <LinkedinMatchCard linkedin={contactInfo.linkedin} />
        </SectionGroup>

        {/* ==================== DISCRIMINATION GROUP ==================== */}
        <SectionGroup id="discrimination" title="UK Compliance" icon={<AlertTriangle size={24} />} score={getGroupScore('discrimination')}>
          {/* Section 21: UK Compliance */}
          <div id="section-compliance" className="scroll-mt-24 pt-6 border-t border-slate-100">
            <CompliancePanel result={result} />
          </div>

          {/* Section 22: Credentials & Licences */}
          <CredentialsCard credentials={result.credentials} occupationLabel={occupationLabel} />

          {/* Section 23: Role Relevance */}
          <RelevanceCard roleAligned={roleAligned} occupationLabel={occupationLabel} presentKeywords={result.keywords.present} />
        </SectionGroup>

        {/* ==================== SENIORITY GROUP ==================== */}
        <SectionGroup id="seniority" title="Seniority" icon={<BookOpen size={24} />} score={getGroupScore('seniority')}>
          {/* Section 23: Role Target */}
          <RoleTargetCard targetRoleTitle={targetRoleTitle} />
        </SectionGroup>

        {/* MOBILE STICKY CTA BUTTON (Visible only on mobile detail view) */}
        <div className="lg:hidden fixed bottom-0 left-0 right-0 p-4 bg-white/90 border-t border-slate-200 backdrop-blur-md z-50">
          <button className="w-full bg-success hover:bg-emerald-600 text-white font-extrabold py-3.5 px-4 rounded-xl flex items-center justify-center gap-2 shadow-lg transition-colors text-sm uppercase tracking-wider">
            Improve & Download Resume
          </button>
        </div>

      </div>
      </div>
    </div>
  );
}
