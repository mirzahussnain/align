// CV Analysis Types
import type { AIJobMatchOutput } from './ai';
import type { Sector } from '@/shared/constants/sector-keywords';
import type { Classification } from './classification';

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

  /** How this CV was classified before scoring (scoring v2+). */
  classification?: Classification;
  /** Credential/licence findings for the classified occupation (scoring v2+). */
  credentials?: CredentialAnalysis;
  /** Version stamps — absent on pre-rebuild results. */
  scoringVersion?: number;
  profileVersion?: string;
  dictionaryVersion?: string;
  /** AI's occupation-framed alignment note (replaces ukTechAlignment). */
  aiAlignmentNote?: string;
  /** True when classification confidence was too low to trust occupation-specific scoring. */
  outOfDomain?: boolean;

  aiTargetRole?: string;
  /** Sector whose keyword dictionary scored this CV (kept for stored-row compat). */
  aiDetectedIndustry?: Sector;
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
  /** Required-by-profile sections the CV lacks (scoring v2+). */
  missingRequired?: string[];
}

/** One credential rule's outcome against the CV text. */
export interface CredentialFinding {
  id: string;
  label: string;
  class: 'mandatory' | 'desirable' | 'role_dependent';
  found: boolean;
  /** Present only when the credential is absent and the rule applies. */
  message?: string;
}

export interface CredentialAnalysis {
  /** 0-10 — full marks when no credential rules apply to this occupation. */
  score: number;
  findings: CredentialFinding[];
  /** True when the occupation has no material credential expectations. */
  notMaterial: boolean;
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
  /**
   * Typed origin so consumers select recommendations structurally instead of
   * parsing titles. Optional because pre-rebuild stored results lack it.
   */
  kind?: 'formatting' | 'section' | 'compliance' | 'credential' | 'keyword' | 'rewrite' | 'alignment';
}
