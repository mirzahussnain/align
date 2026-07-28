/**
 * Contract test for the Job Board view models.
 *
 * The `@ts-expect-error` assertions here are the point of the file: they are
 * verified by `tsc --noEmit` (test files are inside the project's `include`), so
 * each one fails the build if the shape it guards ever becomes permissible. They
 * encode product rules that are otherwise only enforceable by code review.
 */

import { describe, expect, it } from 'vitest';
import {
  SPONSOR_REGISTER_DISCLAIMER,
  SPONSOR_REGISTER_EXPLANATIONS,
  SPONSOR_REGISTER_LABELS,
  VACANCY_SPONSORSHIP_EXPLANATIONS,
  VACANCY_SPONSORSHIP_LABELS,
} from '@/shared/constants/sponsorship-language';
import type {
  DiscoveryRelevance,
  JobAnalysisView,
  JobDescriptionView,
  JobListItemView,
  JobSearchMetaView,
  MatchPreparationView,
  SponsorEvidenceView,
} from '@/shared/types/job-view-models';

const sponsorship: SponsorEvidenceView = {
  company: {
    registerMatchStatus: 'EXACT',
    label: SPONSOR_REGISTER_LABELS.EXACT,
    statement: SPONSOR_REGISTER_EXPLANATIONS.EXACT,
    matchedOrganisationName: 'ACME TECHNOLOGY LIMITED',
    registerVersion: '2026-07-21',
    checkedAt: '2026-07-28T09:00:00.000Z',
  },
  vacancy: {
    wording: 'NOT_MENTIONED',
    label: VACANCY_SPONSORSHIP_LABELS.NOT_MENTIONED,
    statement: VACANCY_SPONSORSHIP_EXPLANATIONS.NOT_MENTIONED,
  },
  disclaimer: SPONSOR_REGISTER_DISCLAIMER,
};

const relevance: DiscoveryRelevance = {
  level: 'HIGH',
  reasons: ['Strong target-role title alignment', 'Matches your Birmingham location'],
};

const listItem: JobListItemView = {
  jobSnapshotId: 'snap_1',
  title: 'IT Support Technician',
  employerName: 'Acme Ltd',
  locationText: 'Birmingham, West Midlands',
  city: 'Birmingham',
  workStyle: 'HYBRID',
  salary: { text: '£28,000 - £32,000 per year', min: 28000, max: 32000, period: 'YEAR', currency: 'GBP' },
  contractType: 'Permanent',
  postedAt: '2026-07-26T00:00:00.000Z',
  providers: [{ provider: 'REED', label: 'Reed', sourceUrl: 'https://www.reed.co.uk/jobs/1', employerDirect: false }],
  descriptionAvailability: 'PARTIAL',
  descriptionSource: 'PROVIDER_PARTIAL',
  relevance,
  sponsorship,
  saved: false,
  status: 'ACTIVE',
};

describe('discovery relevance is never a score', () => {
  it('carries a coarse level and its reasons', () => {
    expect(listItem.relevance.level).toBe('HIGH');
    expect(listItem.relevance.reasons.length).toBeGreaterThan(0);
  });

  it('has no numeric field to leak a fabricated percentage', () => {
    const numeric = Object.values(relevance as unknown as Record<string, unknown>).filter((value) => typeof value === 'number');
    expect(numeric).toHaveLength(0);

    // @ts-expect-error — a relevance score would imply precision the pre-analysis
    // inputs cannot support, and would be indistinguishable from a real fit.
    const withScore: DiscoveryRelevance = { level: 'HIGH', reasons: [], score: 92 };
    void withScore;
  });
});

describe('a fit percentage exists only once an analysis does', () => {
  it('omits the analysis block before any analysis has run', () => {
    expect(listItem.analysis).toBeUndefined();
  });

  it('refuses a fit percentage on the job itself', () => {
    // @ts-expect-error — a score on the list item could be populated before a
    // canonical analysis exists; it may only live on JobAnalysisView.
    const fabricated: JobListItemView = { ...listItem, fitPercentage: 74 };
    void fabricated;
  });

  it('carries the analysis id, so a score is always traceable to its run', () => {
    const analysed: JobListItemView = {
      ...listItem,
      analysis: {
        analysisId: 'an_1',
        fitPercentage: 74,
        mandatoryGapCount: 3,
        analysedAt: '2026-07-27T10:00:00.000Z',
        confidence: 'LIMITED',
        stale: false,
      } satisfies JobAnalysisView,
    };
    expect(analysed.analysis?.analysisId).toBe('an_1');
    // A partial description produces a limited-confidence analysis, and the
    // report must be able to say so.
    expect(analysed.analysis?.confidence).toBe('LIMITED');
  });
});

describe('provider text and user text stay separate', () => {
  const description: JobDescriptionView = {
    availability: 'PARTIAL',
    source: 'USER_PASTED',
    providerText: 'Truncated advert from the provider…',
    userText: 'The full advert the user pasted from the original listing.',
    providerLabel: 'Reed',
    hasUserSuppliedText: true,
  };

  it('keeps both texts after the user pastes a fuller description', () => {
    // Pasting must never destroy the provider's own evidence, which is what an
    // analysis's provenance is anchored to.
    expect(description.providerText).toBeTruthy();
    expect(description.userText).toBeTruthy();
    expect(description.providerText).not.toBe(description.userText);
  });

  it('offers no single field the two could collapse into', () => {
    // @ts-expect-error — one shared `text` field is exactly how user input comes
    // to overwrite provider evidence.
    const merged: JobDescriptionView = { availability: 'FULL', source: 'USER_PASTED', providerLabel: 'Reed', hasUserSuppliedText: true, text: 'merged' };
    void merged;
  });
});

describe('company and vacancy sponsorship evidence stay separate', () => {
  it('states each separately and disclaims the register match', () => {
    expect(sponsorship.company.registerMatchStatus).toBe('EXACT');
    // The employer is on the register while this advert says nothing at all —
    // the pairing the UI must never collapse into "sponsorship available".
    expect(sponsorship.vacancy.wording).toBe('NOT_MENTIONED');
    expect(sponsorship.disclaimer).toBe(SPONSOR_REGISTER_DISCLAIMER);
  });

  it('requires both halves to be present', () => {
    // @ts-expect-error — company evidence alone would be rendered as if it were
    // evidence about the vacancy.
    const companyOnly: SponsorEvidenceView = { company: sponsorship.company, disclaimer: SPONSOR_REGISTER_DISCLAIMER };
    void companyOnly;
  });
});

describe('search meta reports honest counts', () => {
  it('keeps provider returns and unique jobs as separate figures', () => {
    const meta: JobSearchMetaView = {
      providerResultCount: 23,
      uniqueJobCount: 15,
      providers: [
        { provider: 'REED', label: 'Reed', status: 'SUCCESS', returned: 12, contributedToResults: 8, durationMs: 410, fromCache: false },
        { provider: 'ADZUNA', label: 'Adzuna', status: 'SUCCESS', returned: 11, contributedToResults: 7, durationMs: 380, fromCache: true },
        { provider: 'JOOBLE', label: 'Jooble', status: 'TIMED_OUT', returned: 0, contributedToResults: 0, durationMs: 1500, fromCache: false },
      ],
      partialResults: true,
      refreshing: false,
      servedFrom: 'LIVE',
      sessionId: 'sess_1',
      hasMore: true,
    };

    // Deduplication is why these differ; presenting one as the other is the
    // "23 results" / "15 unique jobs" confusion the UI must avoid.
    expect(meta.providerResultCount).toBeGreaterThan(meta.uniqueJobCount);
    // A provider that returned nothing must not be credited with results.
    const timedOut = meta.providers.find((provider) => provider.status === 'TIMED_OUT');
    expect(timedOut?.contributedToResults).toBe(0);
    // Contributions can never exceed what is actually rendered.
    const contributed = meta.providers.reduce((total, provider) => total + provider.contributedToResults, 0);
    expect(contributed).toBeLessThanOrEqual(meta.uniqueJobCount);
  });
});

describe('match preparation is a read, not a purchase', () => {
  it('exposes existing usage and any reusable analysis without consuming a unit', () => {
    const preparation: MatchPreparationView = {
      jobSnapshotId: 'snap_1',
      title: listItem.title,
      employerName: listItem.employerName,
      locationText: listItem.locationText,
      originalListingUrl: 'https://www.reed.co.uk/jobs/1',
      careerTracks: [{ careerTrackId: 'track_1', label: 'IT Support', isDefault: true }],
      selectedCareerTrackId: 'track_1',
      description: {
        availability: 'PARTIAL',
        source: 'PROVIDER_PARTIAL',
        providerText: 'Truncated advert…',
        providerLabel: 'Reed',
        hasUserSuppliedText: false,
      },
      sponsorship,
      eligibilityHints: [],
      usage: { used: 1, limit: 2, remaining: 1, period: 'month' },
      requiresPartialAcknowledgement: true,
    };

    // Everything here is derived from state that already exists, so opening the
    // surface cannot reserve `job_match_analysis`.
    expect(preparation.usage.remaining).toBe(1);
    // A partial description may still be analysed, but only deliberately.
    expect(preparation.requiresPartialAcknowledgement).toBe(true);
    expect(preparation.existingAnalysis).toBeUndefined();
  });
});
