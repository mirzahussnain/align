import { UK_COMPLIANCE_RULES } from '@/shared/constants/scoring-config';
import type { ComplianceCheck } from '@/shared/types/cv';

export function analyzeCompliance(text: string): ComplianceCheck[] {
  return UK_COMPLIANCE_RULES.map(rule => {
    if (!('patterns' in rule) || !rule.patterns) {
      // Photo check — assume no photo in text-only analysis
      return { rule: rule.rule, passed: true, description: rule.description };
    }

    const hasViolation = rule.patterns.some((pattern: RegExp) => pattern.test(text));
    return {
      rule: rule.rule,
      passed: !hasViolation,
      description: rule.description,
    };
  });
}
