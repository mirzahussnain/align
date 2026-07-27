import { describe, expect, it } from 'vitest';
import { CvImportEntityType, CvImportReviewStatus } from '@/generated/prisma/client';
import type { ProfileData } from '@/features/dashboard/data/load-profile';
import { buildImportCandidates, type CandidateDraft } from '../candidates';
import { compareWithCurrent, identityProposals } from '../identity-fields';
import { validateImportPayload } from '../payloads';
import { emptyExtractionPayload, type CvExtractionPayload } from '../../cv-extraction/types';

/**
 * Identity and the professional summary as reviewable proposals.
 *
 * The behaviour under test is the rule that nothing shared is ever written
 * without an explicit decision: a field the profile already fills differently is
 * a CONFLICT, one it fills identically is a DUPLICATE, and one it does not fill
 * is an addition — per FIELD, so accepting the LinkedIn URL from a CV does not
 * also accept its out-of-date phone number.
 */

function profileWith(personal: Partial<ProfileData['personal']> = {}): ProfileData {
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
      ...personal,
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
  };
}

function extraction(overrides: Partial<CvExtractionPayload> = {}): CvExtractionPayload {
  return { ...emptyExtractionPayload(), ...overrides };
}

function build(payload: CvExtractionPayload, profile = profileWith()): CandidateDraft[] {
  return buildImportCandidates({ extraction: payload, profile, accountFullName: 'Amara Okafor' });
}

function identityFor(drafts: CandidateDraft[], field: string) {
  return drafts.find(
    (draft) =>
      draft.entityType === CvImportEntityType.IDENTITY_UPDATE &&
      (draft.structuredData as { field?: string }).field === field
  );
}

describe('identity proposals, one per field', () => {
  it('proposes each supplied field on its own', () => {
    const drafts = build(
      extraction({
        identity: {
          fullName: 'Amara Okafor',
          email: 'amara@example.com',
          phone: '+44 7737 853800',
          phoneDialCode: '+44',
          phoneNumber: '7737853800',
          phoneCountry: 'GB',
          linkedin: 'https://linkedin.com/in/amara-okafor',
          github: 'https://github.com/amaraokafor',
          website: 'https://amaraokafor.dev',
        },
      })
    );
    const fields = drafts
      .filter((draft) => draft.entityType === CvImportEntityType.IDENTITY_UPDATE)
      .map((draft) => (draft.structuredData as { field: string }).field);
    expect(fields).toEqual(['fullName', 'email', 'phone', 'linkedin', 'github', 'website']);
  });

  it('proposes nothing for a field the CV did not state', () => {
    const drafts = build(extraction({ identity: { email: 'amara@example.com' } }));
    expect(identityFor(drafts, 'linkedin')).toBeUndefined();
    expect(identityFor(drafts, 'phone')).toBeUndefined();
  });

  it('carries the phone as three columns, never as one string', () => {
    const drafts = build(
      extraction({
        identity: {
          phone: '+44 7737-853800',
          phoneDialCode: '+44',
          phoneNumber: '7737853800',
          phoneCountry: 'GB',
        },
      })
    );
    // The whole defect in one assertion: the dial code is its own value and the
    // number column holds the national part only.
    expect(identityFor(drafts, 'phone')?.structuredData).toMatchObject({
      phoneDialCode: '+44',
      phoneNumber: '7737853800',
      phoneCountry: 'GB',
      rawValue: '+44 7737-853800',
    });
    expect(identityFor(drafts, 'phone')?.structuredData).not.toHaveProperty('phone');
  });

  it('keeps a phone it could not resolve, flagged rather than dropped', () => {
    const drafts = build(extraction({ identity: { phone: '07737 853800' } }));
    const phone = identityFor(drafts, 'phone');
    expect(phone?.conflictCode).toBe('AMBIGUOUS_VALUE');
    expect(phone?.reviewStatus).toBe(CvImportReviewStatus.CONFLICT);
    // The raw wording survives, and the number field never receives the
    // unsplit international string.
    expect(phone?.structuredData).toMatchObject({ rawValue: '07737 853800' });
    expect((phone?.structuredData as { phoneDialCode?: string }).phoneDialCode).toBeUndefined();
  });

  it('records a confidence for each proposal', () => {
    const drafts = build(
      extraction({ identity: { linkedin: 'https://linkedin.com/in/amara-okafor' } })
    );
    expect(identityFor(drafts, 'linkedin')?.confidence).toBeGreaterThan(0.5);
  });

  it('holds a URL derived from a handle for a check, showing what the CV wrote', () => {
    const drafts = build(
      extraction({
        identity: { linkedin: 'https://linkedin.com/in/amara-okafor' },
        derivedIdentity: [{ field: 'linkedin', writtenAs: 'linkedIn/amara-okafor' }],
      })
    );
    const linkedin = identityFor(drafts, 'linkedin');
    // Classifies perfectly as a LinkedIn profile and is still not accepted: the
    // handle may not be the slug, which is exactly what the source CV showed.
    expect(linkedin?.conflictCode).toBe('UNVERIFIED_LINK');
    expect(linkedin?.reviewStatus).toBe(CvImportReviewStatus.CONFLICT);
    expect(linkedin?.confidence).toBeLessThan(0.5);
    // The user is shown their own wording, not our derivation.
    expect(linkedin?.sourceExcerpt).toBe('LinkedIn: linkedIn/amara-okafor');
    expect(linkedin?.structuredData).toMatchObject({
      linkedin: 'https://linkedin.com/in/amara-okafor',
      rawValue: 'linkedIn/amara-okafor',
    });
  });

  it('does not mark a resolved hyperlink as derived', () => {
    const drafts = build(
      extraction({ identity: { linkedin: 'https://linkedin.com/in/amara-okafor' } })
    );
    expect(identityFor(drafts, 'linkedin')?.conflictCode).toBeNull();
  });

  it('flags a URL that does not classify as the field it was found in', () => {
    // A company page is not the account holder's profile, and the CV is not
    // corrected on their behalf — it is shown for a decision.
    const drafts = build(extraction({ identity: { linkedin: 'https://linkedin.com/company/fintra' } }));
    expect(identityFor(drafts, 'linkedin')?.conflictCode).toBe('AMBIGUOUS_VALUE');
  });
});

describe('identity against what the profile already holds', () => {
  it('treats an empty field as an addition', () => {
    const drafts = build(extraction({ identity: { linkedin: 'https://linkedin.com/in/amara-okafor' } }));
    expect(identityFor(drafts, 'linkedin')?.reviewStatus).toBe(CvImportReviewStatus.PROPOSED);
  });

  it('treats an identical value as a no-op, whatever its spelling', () => {
    const drafts = build(
      extraction({ identity: { linkedin: 'https://linkedin.com/in/amara-okafor' } }),
      profileWith({ linkedin: 'http://www.linkedin.com/in/amara-okafor/' })
    );
    expect(identityFor(drafts, 'linkedin')?.reviewStatus).toBe(CvImportReviewStatus.DUPLICATE);
    expect(identityFor(drafts, 'linkedin')?.conflictCode).toBeNull();
  });

  it('never silently replaces a value the profile already has', () => {
    for (const [field, cv, current] of [
      ['linkedin', 'https://linkedin.com/in/new-handle', 'https://linkedin.com/in/old-handle'],
      ['github', 'https://github.com/newname', 'https://github.com/oldname'],
      ['website', 'https://new.example.com', 'https://old.example.com'],
    ] as const) {
      const drafts = build(
        extraction({ identity: { [field]: cv } }),
        profileWith({ [field]: current })
      );
      expect(identityFor(drafts, field)?.conflictCode, field).toBe('IDENTITY_VALUE_DIFFERS');
      expect(identityFor(drafts, field)?.reviewStatus, field).toBe(CvImportReviewStatus.CONFLICT);
    }
  });

  it('compares phones on their digits, not their punctuation', () => {
    const same = build(
      extraction({
        identity: { phone: '+44 7737-853800', phoneDialCode: '+44', phoneNumber: '7737853800' },
      }),
      profileWith({ phoneDialCode: '+44', phoneNumber: '7737853800' })
    );
    expect(identityFor(same, 'phone')?.reviewStatus).toBe(CvImportReviewStatus.DUPLICATE);

    const different = build(
      extraction({
        identity: { phone: '+44 7737-853800', phoneDialCode: '+44', phoneNumber: '7737853800' },
      }),
      profileWith({ phoneDialCode: '+44', phoneNumber: '7911999999' })
    );
    expect(identityFor(different, 'phone')?.conflictCode).toBe('IDENTITY_VALUE_DIFFERS');
  });

  it('keeps the account-name mismatch as its own distinct question', () => {
    const drafts = build(extraction({ identity: { fullName: 'Someone Else' } }));
    expect(identityFor(drafts, 'fullName')?.conflictCode).toBe('IDENTITY_MISMATCH');
  });

  it('never proposes the account email as an identity field', () => {
    // `email` here is the CONTACT address printed on a CV. The sign-in address is
    // owned by authentication and is not in the field list at all.
    const proposals = identityProposals({ email: 'contact@example.com' });
    expect(proposals.map((proposal) => proposal.field)).toEqual(['email']);
    expect(proposals[0].payload).toEqual({ email: 'contact@example.com' });
  });

  it('reports the verdict for a field directly', () => {
    const [proposal] = identityProposals({ website: 'https://amaraokafor.dev' });
    expect(compareWithCurrent(proposal, {})).toBe('addition');
    expect(compareWithCurrent(proposal, { website: 'https://amaraokafor.dev' })).toBe('duplicate');
    expect(compareWithCurrent(proposal, { website: 'https://other.example' })).toBe('conflict');
  });
});

describe('professional summary proposals', () => {
  const summary = {
    summary: 'Registered nurse with eight years of acute medical experience.',
    summarySource: { excerpt: 'Registered nurse with eight years…', sourceLocation: { line: 3 } },
  };

  it('proposes the summary read from the CV, with its excerpt', () => {
    const drafts = build(extraction(summary));
    const draft = drafts.find((entry) => entry.entityType === CvImportEntityType.PROFILE_SUMMARY_UPDATE);
    expect(draft?.reviewStatus).toBe(CvImportReviewStatus.PROPOSED);
    expect(draft?.structuredData).toMatchObject({ professionalSummary: summary.summary });
    expect(draft?.sourceExcerpt).toBe('Registered nurse with eight years…');
    expect(draft?.sourceLocation).toEqual({ line: 3 });
  });

  it('proposes nothing when the CV had no summary section', () => {
    const drafts = build(extraction({}));
    expect(
      drafts.some((draft) => draft.entityType === CvImportEntityType.PROFILE_SUMMARY_UPDATE)
    ).toBe(false);
  });

  it('requires a decision before replacing a summary the track already has', () => {
    const drafts = build(extraction(summary), profileWith({ professionalSummary: 'My own wording.' }));
    const draft = drafts.find((entry) => entry.entityType === CvImportEntityType.PROFILE_SUMMARY_UPDATE);
    expect(draft?.conflictCode).toBe('SUMMARY_ALREADY_SET');
    expect(draft?.reviewStatus).toBe(CvImportReviewStatus.CONFLICT);
  });

  it('treats an identical summary as a no-op', () => {
    const drafts = build(extraction(summary), profileWith({ professionalSummary: summary.summary }));
    const draft = drafts.find((entry) => entry.entityType === CvImportEntityType.PROFILE_SUMMARY_UPDATE);
    expect(draft?.reviewStatus).toBe(CvImportReviewStatus.DUPLICATE);
  });
});

describe('payload validation', () => {
  it('accepts a per-field identity payload', () => {
    expect(
      validateImportPayload(CvImportEntityType.IDENTITY_UPDATE, {
        field: 'phone',
        phoneDialCode: '+44',
        phoneNumber: '7737853800',
        phoneCountry: 'GB',
        rawValue: '+44 7737-853800',
      })
    ).toMatchObject({ field: 'phone', phoneDialCode: '+44' });
  });

  it('rejects an identity payload for a field that does not exist', () => {
    expect(() =>
      validateImportPayload(CvImportEntityType.IDENTITY_UPDATE, { field: 'visaStatus', rawValue: 'x' })
    ).toThrow();
  });

  it('accepts a project payload carrying its URLs', () => {
    expect(
      validateImportPayload(CvImportEntityType.PROJECT, {
        name: 'Kinetx',
        startDate: null,
        endDate: null,
        achievements: [],
        repositoryUrl: 'https://github.com/sam/kinetx',
        liveUrl: 'https://kinetx.example.com',
      })
    ).toMatchObject({ repositoryUrl: 'https://github.com/sam/kinetx' });
  });

  it('rejects an empty professional summary', () => {
    expect(() =>
      validateImportPayload(CvImportEntityType.PROFILE_SUMMARY_UPDATE, { professionalSummary: '' })
    ).toThrow();
  });
});

describe('project candidates', () => {
  it('carries a project’s repository and live URLs into its proposal', () => {
    const drafts = build(
      extraction({
        projects: [
          {
            name: 'Kinetx',
            startDate: null,
            endDate: null,
            achievements: [],
            repositoryUrl: 'https://github.com/sam/kinetx',
            liveUrl: 'https://kinetx.example.com',
            excerpt: 'Kinetx',
            sourceLocation: { line: 10 },
          },
        ],
      })
    );
    const project = drafts.find((draft) => draft.entityType === CvImportEntityType.PROJECT);
    expect(project?.structuredData).toMatchObject({
      repositoryUrl: 'https://github.com/sam/kinetx',
      liveUrl: 'https://kinetx.example.com',
    });
  });

  it('produces one candidate for one project', () => {
    const drafts = build(
      extraction({
        projects: [
          {
            name: 'Kinetx',
            startDate: null,
            endDate: null,
            achievements: [],
            excerpt: 'Kinetx',
            sourceLocation: { line: 10 },
          },
        ],
      })
    );
    expect(drafts.filter((draft) => draft.entityType === CvImportEntityType.PROJECT)).toHaveLength(1);
  });
});
