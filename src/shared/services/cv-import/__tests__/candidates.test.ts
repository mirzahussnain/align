import { describe, expect, it } from 'vitest';
import { CvImportEntityType, CvImportReviewStatus } from '@/generated/prisma/client';
import type { ProfileData } from '@/features/dashboard/data/load-profile';
import { buildImportCandidates } from '../candidates';
import {
  consumesReusableEvidenceAllowance,
  isCanonicalProfileEntity,
  isBulkConfirmable,
  CANONICAL_PROFILE_ENTITY_TYPES,
} from '../classification';
import { emptyExtractionPayload, type CvExtractionPayload } from '../../cv-extraction/types';

/**
 * Turning an extraction into proposals: what becomes a candidate, what is
 * flagged as already present, and what the user has to decide.
 */

function emptyProfile(overrides: Partial<ProfileData> = {}): ProfileData {
  return {
    profileId: 'p1',
    label: 'Track',
    targetIndustry: '',
    personal: {
      label: 'Track',
      fullName: 'Amara Okafor',
      tagline: '',
      professionalSummary: '',
      targetOccupation: '',
      targetRoleTitle: '',
      targetSeniority: '',
      targetIndustry: '',
      email: '',
      phoneDialCode: '',
      phoneNumber: '',
      phoneCountry: '',
      city: '',
      state: '',
      country: '',
      website: '',
      linkedin: '',
      github: '',
      visaStatus: '',
      visaExpiry: '',
    },
    experience: [],
    projects: [],
    education: [],
    skills: [],
    certifications: [],
    trainings: [],
    licences: [],
    professionalRegistrations: [],
    languages: [],
    volunteering: [],
    otherEvidence: [],
    ...overrides,
  };
}

const provenance = { excerpt: 'From the CV', sourceLocation: { line: 1 } };

function extraction(overrides: Partial<CvExtractionPayload> = {}): CvExtractionPayload {
  return { ...emptyExtractionPayload(), ...overrides };
}

function build(payload: CvExtractionPayload, profile = emptyProfile()) {
  return buildImportCandidates({ extraction: payload, profile, accountFullName: 'Amara Okafor' });
}

const EXPERIENCE = {
  jobTitle: 'Staff Nurse',
  company: 'Salford Royal',
  startDate: '2017-09',
  endDate: '2021-02',
  current: false,
  achievements: ['Delivered ward care.'],
  ...provenance,
};

describe('entity classification', () => {
  it('treats every canonical Career Profile type as consuming no allowance', () => {
    for (const entityType of CANONICAL_PROFILE_ENTITY_TYPES) {
      expect(isCanonicalProfileEntity(entityType)).toBe(true);
      expect(consumesReusableEvidenceAllowance(entityType)).toBe(false);
    }
  });

  it('treats reusable evidence as the only type that consumes the allowance', () => {
    expect(consumesReusableEvidenceAllowance(CvImportEntityType.OTHER_EVIDENCE)).toBe(true);
    expect(isCanonicalProfileEntity(CvImportEntityType.OTHER_EVIDENCE)).toBe(false);
  });

  it('only groups low-risk types for bulk confirmation', () => {
    expect(isBulkConfirmable(CvImportEntityType.SKILL)).toBe(true);
    expect(isBulkConfirmable(CvImportEntityType.LANGUAGE)).toBe(true);
    // Dates, employers and institutions are claims that get an individual look.
    expect(isBulkConfirmable(CvImportEntityType.EXPERIENCE)).toBe(false);
    expect(isBulkConfirmable(CvImportEntityType.EDUCATION)).toBe(false);
    expect(isBulkConfirmable(CvImportEntityType.CERTIFICATION)).toBe(false);
  });
});

describe('proposals', () => {
  it('proposes new records rather than importing them', () => {
    const [candidate] = build(extraction({ experience: [EXPERIENCE] }));
    expect(candidate.entityType).toBe(CvImportEntityType.EXPERIENCE);
    expect(candidate.reviewStatus).toBe(CvImportReviewStatus.PROPOSED);
    expect(candidate.structuredData).toMatchObject({ jobTitle: 'Staff Nurse', company: 'Salford Royal' });
  });

  it('keeps the verbatim source excerpt on every proposal', () => {
    const candidates = build(
      extraction({
        experience: [EXPERIENCE],
        skills: [{ name: 'Venepuncture', ...provenance }],
      })
    );
    expect(candidates.every((candidate) => candidate.sourceExcerpt.length > 0)).toBe(true);
  });

  it('never puts provenance inside the editable payload', () => {
    const [candidate] = build(extraction({ experience: [EXPERIENCE] }));
    expect(candidate.structuredData).not.toHaveProperty('excerpt');
    expect(candidate.structuredData).not.toHaveProperty('sourceLocation');
  });

  it('gives each proposal a stable dedupe key so regeneration is idempotent', () => {
    const first = build(extraction({ experience: [EXPERIENCE] }));
    const second = build(extraction({ experience: [EXPERIENCE] }));
    expect(first[0].dedupeKey).toBe(second[0].dedupeKey);
  });

  it('collapses a CV that lists the same thing twice', () => {
    const candidates = build(extraction({ experience: [EXPERIENCE, { ...EXPERIENCE }] }));
    expect(candidates).toHaveLength(1);
  });
});

describe('duplicates against the existing profile', () => {
  it('marks an experience the profile already holds', () => {
    const profile = emptyProfile({
      experience: [
        {
          id: 'x1',
          jobTitle: 'Staff Nurse',
          company: 'Salford Royal',
          location: '',
          type: '',
          startDate: '2017-09',
          endDate: '2021-02',
          current: false,
          achievements: [],
        },
      ],
    });
    const [candidate] = build(extraction({ experience: [EXPERIENCE] }), profile);
    expect(candidate.reviewStatus).toBe(CvImportReviewStatus.DUPLICATE);
  });

  it('marks a skill the profile already holds, case-insensitively', () => {
    const profile = emptyProfile({
      skills: [
        { id: 'g1', category: 'Clinical', skills: ['venepuncture'], skillItems: [{ id: 's1', name: 'venepuncture' }] },
      ],
    });
    const [candidate] = build(extraction({ skills: [{ name: 'Venepuncture', ...provenance }] }), profile);
    expect(candidate.reviewStatus).toBe(CvImportReviewStatus.DUPLICATE);
  });

  it('does not discard duplicates — they stay visible for the user to see', () => {
    const profile = emptyProfile({
      projects: [{ id: 'pr1', name: 'CourtBook', startDate: '', endDate: '', achievements: [] }],
    });
    const candidates = build(
      extraction({ projects: [{ name: 'CourtBook', startDate: null, endDate: null, achievements: [], ...provenance }] }),
      profile
    );
    expect(candidates).toHaveLength(1);
    expect(candidates[0].reviewStatus).toBe(CvImportReviewStatus.DUPLICATE);
  });
});

describe('conflicts requiring an explicit decision', () => {
  it('raises a missing employer rather than inventing one', () => {
    const [candidate] = build(
      extraction({ experience: [{ ...EXPERIENCE, company: undefined }] })
    );
    expect(candidate.reviewStatus).toBe(CvImportReviewStatus.CONFLICT);
    expect(candidate.conflictCode).toBe('MISSING_REQUIRED_FIELD');
  });

  it('raises a missing start date, which the database requires', () => {
    const [candidate] = build(extraction({ experience: [{ ...EXPERIENCE, startDate: null }] }));
    expect(candidate.conflictCode).toBe('MISSING_REQUIRED_FIELD');
  });

  it('raises conflicting dates for a role the profile already holds', () => {
    const profile = emptyProfile({
      experience: [
        {
          id: 'x1',
          jobTitle: 'Staff Nurse',
          company: 'Salford Royal',
          location: '',
          type: '',
          startDate: '2016-01',
          endDate: '2021-02',
          current: false,
          achievements: [],
        },
      ],
    });
    const [candidate] = build(extraction({ experience: [EXPERIENCE] }), profile);
    expect(candidate.reviewStatus).toBe(CvImportReviewStatus.CONFLICT);
    expect(candidate.conflictCode).toBe('CONFLICTING_DATES');
  });

  it('raises an impossible date order', () => {
    const [candidate] = build(
      extraction({ experience: [{ ...EXPERIENCE, startDate: '2021-02', endDate: '2017-09' }] })
    );
    expect(candidate.conflictCode).toBe('IMPOSSIBLE_DATE_ORDER');
  });

  it('raises a contradictory institution for the same qualification', () => {
    const profile = emptyProfile({
      education: [
        {
          id: 'e1',
          degree: 'BSc Adult Nursing',
          university: 'University of Salford',
          startDate: '',
          endDate: '',
          current: false,
          grade: '',
          description: '',
        },
      ],
    });
    const [candidate] = build(
      extraction({
        education: [
          {
            degree: 'BSc Adult Nursing',
            university: 'University of Manchester',
            startDate: null,
            endDate: null,
            current: false,
            ...provenance,
          },
        ],
      }),
      profile
    );
    expect(candidate.conflictCode).toBe('CONTRADICTORY_INSTITUTION');
  });

  it('raises a duplicate current employment', () => {
    const profile = emptyProfile({
      experience: [
        {
          id: 'x1',
          jobTitle: 'Bank Nurse',
          company: 'Salford Royal',
          location: '',
          type: '',
          startDate: '2019-01',
          endDate: '',
          current: true,
          achievements: [],
        },
      ],
    });
    const [candidate] = build(
      extraction({
        experience: [{ ...EXPERIENCE, jobTitle: 'Staff Nurse', endDate: null, current: true }],
      }),
      profile
    );
    expect(candidate.conflictCode).toBe('DUPLICATE_CURRENT_EMPLOYMENT');
  });

  it('raises a materially different name on the CV', () => {
    const candidates = build(
      extraction({ identity: { fullName: 'Someone Else', email: 'someone@example.com' } })
    );
    const identity = candidates.find((c) => c.entityType === CvImportEntityType.IDENTITY_UPDATE);
    expect(identity?.conflictCode).toBe('IDENTITY_MISMATCH');
  });

  it('does not flag a matching name as a conflict', () => {
    const candidates = build(
      extraction({ identity: { fullName: 'Amara Okafor', email: 'amara@example.com' } })
    );
    // Identity is proposed one field at a time, so the name is judged on its own.
    // A name that matches the profile is a no-op the user is told about, never a
    // contradiction they have to resolve.
    const name = candidates.find(
      (c) =>
        c.entityType === CvImportEntityType.IDENTITY_UPDATE &&
        (c.structuredData as { field?: string }).field === 'fullName'
    );
    expect(name?.conflictCode).toBeNull();
    expect(name?.reviewStatus).toBe(CvImportReviewStatus.DUPLICATE);
  });

  it('always proposes an identity update rather than applying it', () => {
    const candidates = build(extraction({ identity: { email: 'new@example.com' } }));
    const identity = candidates.find((c) => c.entityType === CvImportEntityType.IDENTITY_UPDATE);
    expect(identity).toBeDefined();
    expect(identity?.reviewStatus).not.toBe(CvImportReviewStatus.CONFIRMED);
  });

  it('raises a professional registration with no registration body', () => {
    const [candidate] = build(
      extraction({
        professionalRegistrations: [
          { officialName: 'Registered Nurse', issueDate: null, expiryDate: null, ...provenance },
        ],
      })
    );
    expect(candidate.conflictCode).toBe('MISSING_REQUIRED_FIELD');
  });
});

describe('reusable evidence', () => {
  it('routes free-form achievements to reusable evidence, and nothing else does', () => {
    const candidates = build(
      extraction({
        experience: [EXPERIENCE],
        skills: [{ name: 'Venepuncture', ...provenance }],
        otherEvidence: [
          { title: 'Cut handover time', description: 'Cut ward handover time by 20%.', ...provenance },
        ],
      })
    );
    const evidence = candidates.filter((c) => consumesReusableEvidenceAllowance(c.entityType));
    expect(evidence).toHaveLength(1);
    expect(evidence[0].entityType).toBe(CvImportEntityType.OTHER_EVIDENCE);
  });

  it('proposes reusable evidence without consuming anything', () => {
    // Proposals are just rows in a review list. Nothing about building them
    // touches the allowance — that happens only on confirmation.
    const [candidate] = build(
      extraction({
        otherEvidence: [{ title: 'Award', description: 'Employee of the year 2022.', ...provenance }],
      })
    );
    expect(candidate.reviewStatus).toBe(CvImportReviewStatus.PROPOSED);
  });
});
