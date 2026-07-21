import { describe, expect, it } from 'vitest';
import type { ProfileData } from '@/features/dashboard/data/load-profile';
import type { JobRequirementLedgerEntry } from '@/shared/types/ai';
import {
  buildProfileCandidates,
  resolveApprovedProfileEvidence,
  validateProfileEvidenceSuggestions,
} from '@/shared/services/profile-reconciler';
import {
  ProfileEvidenceValidationError,
  profileEvidenceRefKey,
} from '@/shared/types/profile-reasoning';

const PERSONAL: ProfileData['personal'] = {
  label: 'Finance',
  fullName: 'A Candidate',
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
};

function profile(overrides: Partial<ProfileData> = {}): ProfileData {
  return {
    profileId: 'profile-a',
    label: 'Finance',
    targetIndustry: 'finance',
    personal: PERSONAL,
    experience: [
      {
        id: 'experience-db-1',
        jobTitle: 'Finance Assistant',
        company: 'North Ltd',
        location: 'Leeds',
        type: 'FULL_TIME',
        startDate: '2023-01',
        endDate: '',
        current: true,
        achievements: ['Created monthly reports using pivot tables and XLOOKUP'],
      },
      {
        id: 'experience-db-2',
        jobTitle: 'Administrator',
        company: 'South Ltd',
        location: '',
        type: '',
        startDate: '2021-01',
        endDate: '2022-12',
        current: false,
        achievements: ['Maintained accurate customer records'],
      },
    ],
    projects: [
      {
        id: 'project-db-1',
        name: 'Reporting dashboard',
        stack: 'Excel',
        startDate: '',
        endDate: '',
        achievements: ['Automated weekly reporting'],
      },
    ],
    education: [
      {
        id: 'education-db-1',
        degree: 'BSc Accounting',
        university: 'Leeds University',
        startDate: '2018-09',
        endDate: '2021-06',
        current: false,
        grade: '2:1',
        description: 'Financial reporting and audit',
      },
    ],
    skills: [
      {
        id: 'skill-group-db-1',
        category: 'Tools',
        skills: ['Excel', 'Power BI'],
        skillItems: [
          { id: 'skill-db-1', name: 'Excel' },
          { id: 'skill-db-2', name: 'Power BI' },
        ],
      },
    ],
    certifications: [
      {
        id: 'certification-db-1',
        name: 'Microsoft Office Specialist: Excel Associate',
        issuer: 'Microsoft',
        year: '2024',
      },
    ],
    ...overrides,
  };
}

function requirement(
  id = 'requirement-001',
  status: JobRequirementLedgerEntry['status'] = 'partial'
): JobRequirementLedgerEntry {
  return {
    id,
    text: 'Advanced Excel',
    importance: 'mandatory',
    category: 'tool',
    sourceSection: 'job_description',
    evidenceRequired: true,
    status,
    evidence: [],
    confidence: 0.95,
    deduction: { points: 4, reason: 'Partly evidenced', rubric: 'partial_match' },
  };
}

describe('stable profile evidence', () => {
  it('uses database ids for every individual evidence type, including skills and certifications', () => {
    const refs = buildProfileCandidates(profile()).map((candidate) => candidate.evidenceRef);

    expect(refs).toEqual(
      expect.arrayContaining([
        { type: 'experience', id: 'experience-db-1' },
        { type: 'project', id: 'project-db-1' },
        { type: 'education', id: 'education-db-1' },
        { type: 'skill', id: 'skill-db-1' },
        { type: 'skill', id: 'skill-db-2' },
        { type: 'certification', id: 'certification-db-1' },
      ])
    );
    expect(refs.map(profileEvidenceRefKey)).not.toContain('project:0');
    expect(refs.map(profileEvidenceRefKey)).not.toContain('skill:0:0');
  });

  it('keeps references unchanged when profile records are reordered', () => {
    const original = buildProfileCandidates(profile()).map((candidate) =>
      profileEvidenceRefKey(candidate.evidenceRef)
    );
    const reorderedProfile = profile();
    reorderedProfile.experience.reverse();
    reorderedProfile.skills[0].skillItems.reverse();
    reorderedProfile.certifications.reverse();
    const reordered = buildProfileCandidates(reorderedProfile).map((candidate) =>
      profileEvidenceRefKey(candidate.evidenceRef)
    );

    expect(reordered.sort()).toEqual(original.sort());
  });

  it('loads certifications as selective, independently addressable candidates', () => {
    const candidates = buildProfileCandidates(profile());
    const certification = candidates.find(
      (candidate) => candidate.evidenceRef.type === 'certification'
    );

    expect(certification).toEqual({
      evidenceRef: { type: 'certification', id: 'certification-db-1' },
      evidenceText: 'Microsoft Office Specialist: Excel Associate — Microsoft — 2024',
      evidenceLocation: 'Microsoft Office Specialist: Excel Associate — Certification or licence',
    });
  });

  it('replaces AI-provided evidence wording and location with canonical stored content', () => {
    const result = validateProfileEvidenceSuggestions(
      [
        {
          requirementId: 'requirement-001',
          evidenceRef: { type: 'experience', id: 'experience-db-1' },
          evidenceText: 'Invented £2m saving',
          evidenceLocation: 'Invented role',
          rationale: 'The reporting work demonstrates advanced spreadsheet use.',
          confidence: 0.91,
        },
      ],
      buildProfileCandidates(profile()),
      [requirement()]
    );

    expect(result[0].evidenceText).toBe(
      'Created monthly reports using pivot tables and XLOOKUP'
    );
    expect(result[0].evidenceLocation).toBe(
      'Finance Assistant at North Ltd — Work experience'
    );
    expect(result[0]).not.toHaveProperty('approved');
  });

  it('rejects unknown requirements and duplicate requirement/evidence pairs', () => {
    const raw = {
      requirementId: 'requirement-001',
      evidenceRef: { type: 'skill', id: 'skill-db-1' },
      rationale: 'Relevant tool',
      confidence: 0.9,
    };
    const candidates = buildProfileCandidates(profile());

    expect(() =>
      validateProfileEvidenceSuggestions(
        [{ ...raw, requirementId: 'requirement-999' }],
        candidates,
        [requirement()]
      )
    ).toThrow(ProfileEvidenceValidationError);
    expect(() =>
      validateProfileEvidenceSuggestions([raw, raw], candidates, [requirement()])
    ).toThrow(/Duplicate requirement and evidence pair/);
    expect(() =>
      validateProfileEvidenceSuggestions(
        [{ ...raw, evidenceRef: { type: 'skill_group', id: 'skill-group-db-1' } }],
        candidates,
        [requirement()]
      )
    ).toThrow(/unsupported evidence type/);
  });

  it('rejects deleted, cross-profile, and mistyped evidence records', () => {
    const approval = {
      requirementId: 'requirement-001',
      evidenceRef: { type: 'skill' as const, id: 'skill-db-1' },
    };
    const otherProfile = profile({
      profileId: 'profile-b',
      skills: [
        {
          id: 'other-group',
          category: 'Tools',
          skills: ['Word'],
          skillItems: [{ id: 'other-skill', name: 'Word' }],
        },
      ],
    });

    expect(() =>
      resolveApprovedProfileEvidence(otherProfile, [approval], [requirement()])
    ).toThrow(/no longer exists in this profile/);
    expect(() =>
      resolveApprovedProfileEvidence(
        profile(),
        [
          {
            requirementId: 'requirement-001',
            evidenceRef: { type: 'project', id: 'skill-db-1' },
          },
        ],
        [requirement()]
      )
    ).toThrow(/no longer exists in this profile/);
  });

  it('ties approval to a requirement and re-resolves canonical evidence at generation time', () => {
    const requirements = [requirement('requirement-001'), requirement('requirement-002')];
    const evidenceRef = { type: 'skill' as const, id: 'skill-db-1' };
    const overlay = resolveApprovedProfileEvidence(
      profile(),
      [
        { requirementId: 'requirement-001', evidenceRef },
        { requirementId: 'requirement-002', evidenceRef },
      ],
      requirements
    );

    expect(overlay.map((entry) => entry.requirementId)).toEqual([
      'requirement-001',
      'requirement-002',
    ]);
    expect(overlay.every((entry) => entry.resolvedEvidenceText === 'Excel')).toBe(true);
    expect(overlay.every((entry) => entry.sourceProfileId === 'profile-a')).toBe(true);
    expect(overlay.every((entry) => entry.userApproved)).toBe(true);
  });

  it('rejects duplicate approved requirement/evidence pairs', () => {
    const approval = {
      requirementId: 'requirement-001',
      evidenceRef: { type: 'skill' as const, id: 'skill-db-1' },
    };

    expect(() =>
      resolveApprovedProfileEvidence(profile(), [approval, approval], [requirement()])
    ).toThrow(/Duplicate requirement and evidence pair/);
  });
});
