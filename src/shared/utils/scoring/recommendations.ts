import type { OccupationProfile } from '@/shared/occupations/types';
import type {
  KeywordAnalysis,
  SectionOrderAnalysis,
  FormattingAnalysis,
  ComplianceCheck,
  CredentialAnalysis,
  Recommendation,
} from '@/shared/types/cv';

/**
 * Rule-based recommendations from the deterministic pass. Occupation-specific
 * expectations (testing frameworks, cloud platforms, …) come from the
 * profile's evidence priorities and the AI layer — never hardcoded here.
 */
export function generateRecommendations(
  keywords: KeywordAnalysis,
  sectionLayout: SectionOrderAnalysis,
  formatting: FormattingAnalysis,
  compliance: ComplianceCheck[],
  credentials: CredentialAnalysis,
  profile: OccupationProfile
): Recommendation[] {
  const recs: Recommendation[] = [];

  // Critical formatting issues
  for (const issue of formatting.issues.filter(i => i.type === 'critical')) {
    recs.push({
      priority: 'critical',
      title: issue.message,
      description: issue.fix,
      timeEstimate: '15 min',
      kind: 'formatting',
    });
  }

  // Missing mandatory credentials are eligibility failures.
  for (const finding of credentials.findings.filter(f => f.class === 'mandatory' && !f.found)) {
    recs.push({
      priority: 'critical',
      title: `Add ${finding.label}`,
      description: finding.message ?? `${finding.label} is expected for ${profile.label} roles.`,
      timeEstimate: '10 min',
      kind: 'credential',
    });
  }

  // Section layout
  for (const suggestion of sectionLayout.suggestions) {
    recs.push({
      priority: sectionLayout.missingRequired?.some(s => suggestion.includes(s)) ? 'high' : 'medium',
      title: 'Improve CV structure',
      description: suggestion,
      timeEstimate: '15 min',
      kind: 'section',
    });
  }

  // Compliance failures
  for (const check of compliance.filter(c => !c.passed)) {
    recs.push({
      priority: 'high',
      title: `Remove: ${check.rule}`,
      description: check.description,
      timeEstimate: '5 min',
      kind: 'compliance',
    });
  }

  // Weak evidence coverage against the classified sector's vocabulary.
  const total = keywords.present.length + keywords.missing.length;
  if (total > 0 && keywords.present.length / total < 0.25) {
    recs.push({
      priority: 'high',
      title: 'Strengthen role-specific evidence',
      description: `Your CV names few of the terms UK employers screen for in ${profile.label} roles. Work concrete skills and terminology into your experience bullets: ${profile.evidencePriorities
        .slice(0, 3)
        .join('; ')}.`,
      timeEstimate: '1-2 hours',
      kind: 'keyword',
    });
  }

  // Desirable credentials worth surfacing.
  for (const finding of credentials.findings.filter(f => f.class === 'desirable' && !f.found)) {
    recs.push({
      priority: 'medium',
      title: `Consider adding: ${finding.label}`,
      description: finding.message ?? '',
      timeEstimate: '10 min',
      kind: 'credential',
    });
  }

  // Warning formatting issues
  for (const issue of formatting.issues.filter(i => i.type === 'warning')) {
    recs.push({
      priority: 'medium',
      title: issue.message,
      description: issue.fix,
      timeEstimate: '15 min',
      kind: 'formatting',
    });
  }

  return recs.sort((a, b) => {
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });
}
