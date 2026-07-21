import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { JobMatchDataV2 } from '@/shared/types/ai';

vi.mock('framer-motion', () => ({ motion: { div: 'div' } }));

import CriterionMappingPanel from '../CriterionMappingPanel';
import DomainFitPanel from '../DomainFitPanel';

const cvBuildSpec = {
  recommended_template: 'sharp_minimal',
  template_rationale: '',
  section_order: [],
  lead_project: '',
  summary_angle: '',
  skills_to_surface: [],
  skills_to_deprioritise: [],
  bullets_to_rewrite: [],
  visa_note_required: false,
  cover_letter_angle: '',
};

function v2(status: 'aligned' | 'partial' | 'mismatch'): JobMatchDataV2 {
  return {
    schemaVersion: 2,
    requirements: [
      {
        id: 'requirement-001',
        text: 'Current NMC registration',
        importance: 'mandatory',
        category: 'credential',
        sourceSection: 'person_specification',
        evidenceRequired: true,
        status: 'met',
        evidence: [{ source: 'cv', text: 'NMC PIN 12A3456E', location: 'Registration' }],
        confidence: 0.99,
        deduction: { points: 0, reason: 'Direct evidence', rubric: 'met' },
      },
    ],
    domainFit: {
      roleDomain: 'Registered nursing',
      candidateDomain: 'Registered nursing',
      status,
      overlapAreas: [],
      detail: status,
      confidence: 0.9,
      deduction: { points: 0, reason: '' },
    },
    matchScore: 100,
    matchFeedback: '',
    experienceGap: '',
    tailoredRewrites: [],
    cv_build_spec: cvBuildSpec,
  };
}

describe('v2 job-match panels', () => {
  it.each([
    ['aligned', 'Aligned'],
    ['partial', 'Partial overlap'],
    ['mismatch', 'Mismatch'],
  ] as const)('renders the %s domain state distinctly', (status, label) => {
    const html = renderToStaticMarkup(
      createElement(DomainFitPanel, { data: v2(status), contentVariants: {} })
    );

    expect(html).toContain(label);
  });

  it('renders exact v2 criterion evidence from the ledger', () => {
    const html = renderToStaticMarkup(
      createElement(CriterionMappingPanel, { data: v2('aligned'), contentVariants: {} })
    );

    expect(html).toContain('Evidence found');
    expect(html).toContain('NMC PIN 12A3456E');
    expect(html).toContain('Registration');
  });
});
