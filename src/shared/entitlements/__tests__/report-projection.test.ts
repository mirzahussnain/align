import { describe, expect, it } from 'vitest';
import { projectAnalysisReport } from '../report-projection';
import type { CapabilityDecision } from '../registry';
import type { CVAnalysisResult } from '@/shared/types/cv';

function decision(capability: CapabilityDecision['capability'], accessLevel: string): CapabilityDecision {
  return { capability, allowed: true, plan: accessLevel === 'full' ? 'PRO' : 'FREE', mode: 'partial', accessLevel, reason: 'allowed' };
}

const canonical = {
  overallScore: 82,
  categories: Array.from({ length: 7 }, (_, index) => ({ id: `c${index}`, label: `Category ${index}`, score: 8, maxScore: 10, status: 'good', details: `detail-${index}` })),
  keywords: { present: Array.from({ length: 7 }, (_, i) => ({ keyword: `p${i}`, category: 'x', count: 1 })), missing: Array.from({ length: 7 }, (_, i) => ({ keyword: `m${i}`, category: 'x', count: 0 })), categoryBreakdown: [] },
  sectionOrder: { currentOrder: [], recommendedOrder: [], isOptimal: true, suggestions: [] },
  formatting: { fontConsistency: true, fontCount: 1, hasImages: false, hasSpecialCharacters: false, pageCount: 1, estimatedReadTime: '1 min', issues: [] },
  compliance: [], recommendations: [], rawText: 'candidate source', pageCount: 1, mode: 'job_match',
  jobMatchData: {
    schemaVersion: 2, matchScore: 82, jobTitle: 'Role', matchFeedback: 'summary', experienceGap: 'gap',
    domainFit: { roleDomain: 'A', candidateDomain: 'B', status: 'partial', overlapAreas: [], detail: 'domain detail', confidence: 0.8, deduction: { points: 1, reason: 'reason' } },
    requirements: Array.from({ length: 5 }, (_, i) => ({ id: `r${i}`, text: `secret requirement ${i}`, importance: 'mandatory', category: i === 4 ? 'eligibility' : 'skill', sourceSection: 'job_description', evidenceRequired: true, status: 'partial', evidence: [{ source: 'cv', text: `secret evidence ${i}` }], confidence: 0.8, deduction: { points: i === 0 ? 17 : 0, reason: 'gap', rubric: 'partial_match' } })),
    tailoredRewrites: [{ original: 'old', suggested: 'PAID SECRET REWRITE', rationale: 'why' }],
    cv_build_spec: { recommended_template: 'architect', template_rationale: 'PAID SECRET STRATEGY', section_order: ['summary'], lead_project: 'secret project', summary_angle: 'secret angle', skills_to_surface: ['secret skill'], skills_to_deprioritise: [], bullets_to_rewrite: [], visa_note_required: false, cover_letter_angle: 'secret cover' },
  },
} as CVAnalysisResult;

describe('report projection', () => {
  it('does not mutate the canonical report and omits paid detail from FREE JSON', () => {
    const projected = projectAnalysisReport(canonical, {
      report: decision('view_full_job_match_report', 'preview'),
      requirementLedger: decision('view_requirement_ledger', 'limited'),
      rewriteStrategy: { capability: 'view_rewrite_strategy', allowed: false, plan: 'FREE', mode: 'disabled', reason: 'plan_required', upgradeTarget: 'PRO' },
      eligibility: decision('view_eligibility_analysis', 'summary'),
    });
    const json = JSON.stringify(projected);
    expect(projected.jobMatchData?.requirements).toHaveLength(3);
    expect(json).not.toContain('PAID SECRET REWRITE');
    expect(json).not.toContain('PAID SECRET STRATEGY');
    expect(canonical.jobMatchData?.tailoredRewrites[0]?.suggested).toBe('PAID SECRET REWRITE');
    expect(canonical.jobMatchData?.requirements).toHaveLength(5);
  });

  it('returns the complete authorised object for full access', () => {
    const projected = projectAnalysisReport(canonical, {
      report: decision('view_full_job_match_report', 'full'),
    });
    expect(projected).toBe(canonical);
  });
});

