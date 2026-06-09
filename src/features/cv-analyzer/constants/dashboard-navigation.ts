export interface NavigationItem {
  id: string;
  label: string;
  type: 'standard' | 'premium';
  mappedCategoryId?: string;
  isMock?: boolean;
}

export interface NavigationGroup {
  id: string;
  label: string;
  items: NavigationItem[];
}

export const DASHBOARD_NAVIGATION_GROUPS: readonly NavigationGroup[] = [
  {
    id: 'overview',
    label: 'OVERVIEW',
    items: [
      { id: 'overview', label: 'Live Resume Analysis', type: 'standard', isMock: true }
    ]
  },
  {
    id: 'content',
    label: 'CONTENT',
    items: [
      { id: 'atsReadability', label: 'ATS Parse Rate', type: 'standard', mappedCategoryId: 'atsReadability' },
      { id: 'impactStatements', label: 'Quantifying Impact', type: 'standard', mappedCategoryId: 'impactStatements' },
      { id: 'repetition', label: 'Repetition', type: 'standard', isMock: true },
      { id: 'professionalSummary', label: 'Spelling & Grammar', type: 'standard', mappedCategoryId: 'professionalSummary' },
      { id: 'keywordDensity', label: 'ATS Keywords', type: 'standard', mappedCategoryId: 'keywordDensity' },
      { id: 'bulletsConsistency', label: 'Bullets Consistency', type: 'standard', isMock: true }
    ]
  },
  {
    id: 'sections',
    label: 'SECTIONS',
    items: [
      { id: 'essentialSections', label: 'Essential Sections', type: 'standard', mappedCategoryId: 'sectionOrder' },
      { id: 'contactInfo', label: 'Contact Information', type: 'standard', isMock: true },
      { id: 'sectionOrder', label: 'Sections Order', type: 'standard', mappedCategoryId: 'sectionOrder' }
    ]
  },
  {
    id: 'ats-essentials',
    label: 'ATS ESSENTIALS',
    items: [
      { id: 'fileFormatSize', label: 'File Format & Size', type: 'standard', mappedCategoryId: 'pageCount' },
      { id: 'formatting', label: 'Design', type: 'standard', mappedCategoryId: 'formatting' },
      { id: 'emailAddress', label: 'Email Address', type: 'standard', isMock: true },
      { id: 'headerLinks', label: 'Header Links', type: 'standard', isMock: true },
      { id: 'fileName', label: 'File Name Check', type: 'standard', isMock: true },
      { id: 'datesLinks', label: 'Dates & Links', type: 'standard', isMock: true }
    ]
  },
  {
    id: 'hr-red-flags',
    label: 'HR RED FLAGS',
    items: [
      { id: 'credibility', label: 'Credibility', type: 'standard', isMock: true },
      { id: 'interviewRisks', label: 'Interview Risks', type: 'standard', isMock: true },
      { id: 'peerBenchmarking', label: 'Peer Benchmarking', type: 'standard', isMock: true },
      { id: 'linkedinMatch', label: 'LinkedIn Match', type: 'standard', isMock: true }
    ]
  },
  {
    id: 'discrimination',
    label: 'DISCRIMINATION',
    items: [
      { id: 'compliance', label: 'UK Compliance', type: 'standard', mappedCategoryId: 'compliance' },
      { id: 'relevance', label: 'UK Tech Relevance', type: 'standard', isMock: true }
    ]
  },
  {
    id: 'seniority',
    label: 'SENIORITY',
    items: [
      { id: 'roleTarget', label: 'Role Target', type: 'standard', isMock: true }
    ]
  }
] as const;

export const JOB_MATCH_NAVIGATION = [
  { id: 'summary', label: 'Score & Summary', iconName: 'Target' },
  { id: 'skills', label: 'Skill Alignment', iconName: 'Target' },
  { id: 'domain', label: 'Domain & Eligibility', iconName: 'Briefcase' },
  { id: 'scoring', label: 'Score Breakdown', iconName: 'BarChart2' },
  { id: 'rewrites', label: 'Tailored Rewrites', iconName: 'FileEdit' },
  { id: 'strategy', label: 'Rewrite Strategy', iconName: 'LayoutList' }
] as const;

