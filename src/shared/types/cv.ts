// CV Analysis Types
import type { AIJobMatchOutput } from './ai';
import type { Industry } from '@/shared/constants/sector-keywords';

export interface CVAnalysisResult {
  overallScore: number;
  categories: CategoryScore[];
  keywords: KeywordAnalysis;
  sectionOrder: SectionOrderAnalysis;
  formatting: FormattingAnalysis;
  compliance: ComplianceCheck[];
  recommendations: Recommendation[];
  rawText: string;
  pageCount: number;
  aiTargetRole?: string;
  /** Industry the AI classified this CV into, i.e. which keyword dictionary scored it. */
  aiDetectedIndustry?: Industry;
  aiHasTesting?: boolean;
  aiIsTechRole?: boolean;
  aiRiskFlags?: string[];
  aiClichés?: string[];
  /**
   * Set when the AI layer was deliberately skipped, so the report can say why
   * it is thinner than usual instead of quietly omitting half its sections.
   * Currently only `'quota'` — the user's monthly AI allowance is spent.
   */
  aiSkipped?: 'quota';
  
  // Job Matcher specific fields
  mode?: 'ats' | 'job_match';
  jobMatchData?: AIJobMatchOutput;
  jobDescription?: string;
}

export interface CategoryScore {
  id: string;
  label: string;
  score: number;
  maxScore: number;
  status: 'excellent' | 'good' | 'needs-improvement' | 'critical';
  details: string;
}

export interface KeywordAnalysis {
  present: KeywordMatch[];
  missing: KeywordMatch[];
  categoryBreakdown: CategoryKeywordBreakdown[];
}

export interface KeywordMatch {
  keyword: string;
  category: string;
  count: number;
}

export interface CategoryKeywordBreakdown {
  category: string;
  label: string;
  present: number;
  total: number;
  percentage: number;
}

export interface SectionOrderAnalysis {
  currentOrder: string[];
  recommendedOrder: string[];
  isOptimal: boolean;
  suggestions: string[];
}

export interface FormattingAnalysis {
  fontConsistency: boolean;
  fontCount: number;
  hasImages: boolean;
  hasSpecialCharacters: boolean;
  pageCount: number;
  estimatedReadTime: string;
  issues: FormattingIssue[];
}

export interface FormattingIssue {
  type: 'critical' | 'warning' | 'info';
  message: string;
  fix: string;
}

export interface ComplianceCheck {
  rule: string;
  passed: boolean;
  description: string;
}

export interface Recommendation {
  priority: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  timeEstimate: string;
}
