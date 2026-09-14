// Section layout analysis: required-section coverage plus RELATIVE order
// constraints from the occupation profile. Replaces the old single global
// OPTIMAL_SECTION_ORDER — there is no universally optimal arrangement, and a
// section the profile marks irrelevant never generates a suggestion.

import { SECTION_HEADINGS_MAP } from '@/shared/constants/scoring-config';
import type { OccupationProfile } from '@/shared/occupations/types';
import type { Classification } from '@/shared/types/classification';
import type { SectionOrderAnalysis } from '@/shared/types/cv';

const SECTION_DISPLAY: Record<string, string> = {
  'contact': 'Contact Information',
  'professional-summary': 'Professional Summary',
  'core-skills': 'Skills',
  'professional-experience': 'Experience',
  'key-projects': 'Projects',
  'education': 'Education',
  'certifications': 'Certifications & Licences',
};

const display = (id: string) => SECTION_DISPLAY[id] ?? id;

export interface SectionLayoutResult extends SectionOrderAnalysis {
  /** 0-10 for the sectionCompleteness category. */
  score: number;
}

export function analyzeSectionLayout(
  text: string,
  profile: OccupationProfile,
  classification: Classification
): SectionLayoutResult {
  const lines = text.split('\n').map(l => l.trim().toLowerCase());
  const detected: { id: string; position: number }[] = [];

  for (const [sectionId, headings] of Object.entries(SECTION_HEADINGS_MAP)) {
    if (sectionId === 'contact') {
      detected.push({ id: sectionId, position: 0 });
      continue;
    }
    for (let i = 0; i < lines.length; i++) {
      if (headings.some(h => lines[i].includes(h) && lines[i].length < 60)) {
        detected.push({ id: sectionId, position: i });
        break;
      }
    }
  }

  detected.sort((a, b) => a.position - b.position);
  const currentOrder = detected.map(s => s.id);
  const has = (id: string) => currentOrder.includes(id);
  const position = (id: string) => currentOrder.indexOf(id);

  const suggestions: string[] = [];

  // Required-section coverage.
  const missingRequired = profile.sections.rules
    .filter(r => r.presence === 'required' && !has(r.section))
    .map(r => r.section);
  for (const section of missingRequired) {
    suggestions.push(`Add a "${display(section)}" section — it is expected for ${profile.label} CVs.`);
  }

  // Expected (softer) sections.
  const missingExpected = profile.sections.rules.filter(
    r => r.presence === 'expected' && !has(r.section)
  );
  for (const rule of missingExpected) {
    suggestions.push(
      rule.note
        ? `Consider adding a "${display(rule.section)}" section. ${rule.note}`
        : `Consider adding a "${display(rule.section)}" section.`
    );
  }

  // Relative order constraints, gated on classification where declared.
  let constraintViolations = 0;
  for (const constraint of profile.sections.orderConstraints) {
    if (constraint.appliesWhen && !constraint.appliesWhen(classification)) continue;
    if (!has(constraint.before) || !has(constraint.after)) continue;
    if (position(constraint.before) > position(constraint.after)) {
      constraintViolations++;
      suggestions.push(
        `Move "${display(constraint.before)}" above "${display(constraint.after)}" — ${constraint.reason}`
      );
    }
  }

  // Recommended order: the profile's own rule order, restricted to sections
  // that are present or required, never including irrelevant ones.
  const profileOrder = profile.sections.rules
    .filter(r => r.presence !== 'irrelevant')
    .map(r => r.section);
  const recommendedOrder = [
    'contact',
    ...profileOrder.filter(s => has(s) || missingRequired.includes(s)),
  ];

  // Score: start from full and charge for gaps; missing required sections are
  // the substantive failure, order violations are polish.
  const score = Math.max(
    2,
    10 - missingRequired.length * 3 - constraintViolations * 1.5 - missingExpected.length * 0.5
  );

  return {
    currentOrder,
    recommendedOrder,
    isOptimal: suggestions.length === 0,
    suggestions,
    missingRequired,
    score: Math.round(score * 10) / 10,
  };
}
