import type {
  CategoryScore,
  KeywordAnalysis,
  SectionOrderAnalysis,
  FormattingAnalysis,
  ComplianceCheck,
  Recommendation,
} from '@/shared/types/cv';

export function generateRecommendations(
  categories: CategoryScore[],
  keywords: KeywordAnalysis,
  sectionOrder: SectionOrderAnalysis,
  formatting: FormattingAnalysis,
  compliance: ComplianceCheck[]
): Recommendation[] {
  const recs: Recommendation[] = [];

  // Critical formatting issues
  for (const issue of formatting.issues.filter(i => i.type === 'critical')) {
    recs.push({
      priority: 'critical',
      title: issue.message,
      description: issue.fix,
      timeEstimate: '15 min',
    });
  }

  // Missing testing keywords
  const testingBreakdown = keywords.categoryBreakdown.find(c => c.category === 'testing');
  if (testingBreakdown && testingBreakdown.percentage < 20) {
    recs.push({
      priority: 'critical',
      title: 'Add testing skills — critically missing',
      description: 'UK employers hard-filter for testing (Jest, Vitest, Playwright, Cypress). Add testing experience to at least one project and list it in your skills.',
      timeEstimate: '1-2 days',
    });
  }

  // Section ordering
  for (const suggestion of sectionOrder.suggestions) {
    recs.push({
      priority: 'high',
      title: 'Reorder CV sections',
      description: suggestion,
      timeEstimate: '15 min',
    });
  }

  // Missing cloud keywords
  const cloudBreakdown = keywords.categoryBreakdown.find(c => c.category === 'cloud');
  if (cloudBreakdown && cloudBreakdown.percentage < 30) {
    recs.push({
      priority: 'high',
      title: 'Add cloud platform experience',
      description: 'UK market is AWS-dominant. Mention AWS, Terraform, or other cloud services you have experience with.',
      timeEstimate: '30 min',
    });
  }

  // Compliance failures
  for (const check of compliance.filter(c => !c.passed)) {
    recs.push({
      priority: 'high',
      title: `Remove: ${check.rule}`,
      description: check.description,
      timeEstimate: '5 min',
    });
  }

  // Warning formatting issues
  for (const issue of formatting.issues.filter(i => i.type === 'warning')) {
    recs.push({
      priority: 'medium',
      title: issue.message,
      description: issue.fix,
      timeEstimate: '15 min',
    });
  }

  // Missing monitoring keywords
  const monitoringBreakdown = keywords.categoryBreakdown.find(c => c.category === 'monitoring');
  if (monitoringBreakdown && monitoringBreakdown.percentage < 20) {
    recs.push({
      priority: 'medium',
      title: 'Add monitoring/observability skills',
      description: 'Mention Sentry, Datadog, LogRocket, or similar tools to show production awareness.',
      timeEstimate: '1 day',
    });
  }

  // Practices
  const practicesBreakdown = keywords.categoryBreakdown.find(c => c.category === 'practices');
  if (practicesBreakdown && practicesBreakdown.percentage < 30) {
    recs.push({
      priority: 'medium',
      title: 'Add engineering practices keywords',
      description: 'Mention code reviews, pair programming, accessibility (WCAG), and performance optimization to match UK engineering culture.',
      timeEstimate: '30 min',
    });
  }

  return recs.sort((a, b) => {
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });
}
