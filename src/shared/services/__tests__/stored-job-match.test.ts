import { describe, expect, it } from 'vitest';
import { storedJobMatchResult } from '@/shared/services/stored-job-match';

const completeRow = {
  id: 'match-1',
  matchScore: 100,
  requirementLedgerJson: {
    schemaVersion: 1,
    analysisVersion: 'v2',
    requirements: [{
      id: 'requirement-001',
      text: 'Strong SQL experience',
      importance: 'MANDATORY',
      category: 'SKILL',
      sourceSection: 'JOB_DESCRIPTION',
      evidenceRequired: true,
      analysis: {
        status: 'MET',
        evidence: [{ source: 'CV', text: 'Built SQL data pipelines' }],
        confidence: 0.95,
        deduction: { points: 0, reason: 'Direct evidence', rubric: 'MET' },
      },
    }],
  },
  advisoryJson: {
    schemaVersion: 1,
    jobTitle: 'Data Engineer',
    jobCompany: 'Acme',
    domainFit: {
      roleDomain: 'Data engineering',
      candidateDomain: 'Data engineering',
      status: 'aligned',
      overlapAreas: ['SQL'],
      detail: 'Direct domain match.',
      confidence: 0.95,
      deduction: { points: 0, reason: 'Direct match' },
    },
    matchFeedback: 'Strong evidence against the core role requirements.',
    experienceGap: 'No material experience-depth gap identified.',
    tailoredRewrites: [],
  },
  cvRevision: { extractedText: 'Experienced data engineer with SQL delivery.', pageCount: 1, filename: 'cv.pdf' },
  jobRevision: { description: 'Data engineer with strong SQL experience.' },
  practicalCompatibilityJson: {
    items: [{
      category: 'REMOTE_ONSITE', state: 'CONFLICT', source: 'BOTH',
      vacancyRequirement: 'Onsite work style',
      confirmedProfileFact: 'Preferred work styles: remote',
      explanation: 'Preference mismatch: the vacancy is onsite.',
    }],
    summary: { confirmed: 0, conflicts: 1, unknown: 0, notApplicable: 0 },
    updatableCategories: [],
    disclaimer: 'Snapshot disclaimer.',
  },
  practicalCompatibilityVersion: 1,
};

describe('stored Job Match contract', () => {
  it.each(['domainFit', 'matchFeedback', 'experienceGap'] as const)(
    'rejects persisted advisory data when required AI field %s is missing',
    (field) => {
      const advisoryJson = { ...completeRow.advisoryJson };
      delete advisoryJson[field];

      expect(() => storedJobMatchResult({ ...completeRow, advisoryJson })).toThrow();
    },
  );

  it('rehydrates the persisted practical conclusion without recalculating it', () => {
    const result = storedJobMatchResult(completeRow);
    expect(result.practicalCompatibility).toEqual(completeRow.practicalCompatibilityJson);
  });

  it('keeps legacy rows without a practical snapshot readable', () => {
    const legacy = {
      ...completeRow,
      practicalCompatibilityJson: undefined,
      practicalCompatibilityVersion: undefined,
    };
    const result = storedJobMatchResult(legacy);
    expect(result.practicalCompatibility).toBeUndefined();
  });
});
