// CV Analysis Types
import type { JobMatchDataV2 } from './ai';
import type { JobMatchReportView } from './job-match-report';
import type { Sector } from '@/shared/constants/sector-keywords';
import type { Classification } from './classification';
import type { AnalysisContext } from './analysis-context';

export interface CVAnalysisResult {
  /** Presentation tier resolved by the server; anonymous previews use a separate DTO. */
  viewerMode?: 'anonymous_demo' | 'authenticated_free' | 'authenticated_pro';
  overallScore: number;
  categories: CategoryScore[];
  keywords: KeywordAnalysis;
  sectionOrder: SectionOrderAnalysis;
  formatting: FormattingAnalysis;
  compliance: ComplianceCheck[];
  recommendations: Recommendation[];
  rawText: string;
  pageCount: number;

  /** Original uploaded filename, so the File Name check runs on the real name. */
  fileName?: string;
  /**
   * True when the AI semantic layer actually ran and its output was applied
   * (summary/impact feedback, rewrites, clichés, risk flags). Lets the report
   * label which cards are AI-derived vs purely rule-based. Absent/false means
   * the whole report is deterministic.
   */
  aiApplied?: boolean;

  /** How this CV was classified before scoring (scoring v2+). */
  classification?: Classification;
  /**
   * The explicit analysis context resolved for this run — evidence source,
   * target source, resolved target occupation, confidence, and any CV/Profile
   * mismatch. Persisted inside `rawResult` (no migration; the stored schema is
   * loose and passes it through). Separates evidence from target so the active
   * Profile can never silently drive an upload's occupation rules.
   */
  analysisContext?: AnalysisContext;
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
  // Why the optional AI enrichment layer did not run, for honest UI provenance:
  // 'quota' — the user's AI allowance is exhausted (rule-based score served);
  // 'error' — the provider was unavailable (rule-based score served, retryable).
  aiSkipped?: 'quota' | 'error';
  
  // Job Matcher specific fields
  mode?: 'ats' | 'job_match';
  jobMatchData?: JobMatchDataV2;
  /**
   * Plan-aware, server-derived report view model for the job-match UI. Presentation
   * only — attached at projection (read) time, NEVER persisted into the stored
   * `rawResult` blob. The report UI renders this and never recomputes authoritative
   * values (totals, score reconciliation) from the projected `jobMatchData` subset.
   */
  jobMatchReport?: JobMatchReportView;
  jobDescription?: string;

  /**
   * Id of the persisted ATS analysis or Job Match this result was saved as. Attached to the
   * API response after the row is created — never stored inside the row's own
   * `rawResult` blob. Lets the results screen rebuild a tailored CV from the
   * stored analysis (via /api/cv/regenerate) without re-uploading anything.
   * Absent only when persistence failed (best-effort) or on pre-existing blobs.
   */
  analysisId?: string;
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
