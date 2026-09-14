import { describe, expect, it, vi } from 'vitest';

// cv-generation (for profileToRewrittenData) imports prisma/storage for its
// persist path; stub them so this pure-logic test never touches a DB or bucket.
vi.mock('@/shared/lib/prisma', () => ({ prisma: {} }));
vi.mock('@/shared/lib/storage', () => ({ storage: {}, keyFor: {} }));
vi.mock('@/shared/services/storage-quota', () => ({ pruneGeneratedCvs: vi.fn() }));

import { profileToRewrittenData } from '@/shared/services/cv-generation';
import { buildTrustedGenerationContext } from '@/shared/services/trusted-generation-context';
import { buildEvidenceCorpus } from '@/shared/services/cv-evidence';
import { formatDateRange } from '@/shared/utils/date';
import type { RewrittenCVData } from '@/shared/templates/types';
import type { RewriteRequirement } from '@/shared/types/cv-rewrite';
import {
  buildProfileEvidenceCorpus,
  collectGeneratedClaimText,
  experienceDurationFact,
  profileDateEntities,
  scanUnsupportedClaims,
  toolVocabularyFromRequirements,
  unsupportedClaimUserMessage,
} from '@/shared/services/cv-generation-safety';
import { makeProfile } from './fixtures/profile';

const NOW = new Date('2025-06-15T00:00:00Z');

/** Scan a full ProfileData through the deterministic build path. */
function scanProfileBuild(profile: ReturnType<typeof makeProfile>) {
  const trusted = buildTrustedGenerationContext({ profile, approvedEvidence: [], now: NOW });
  const data = profileToRewrittenData(profile);
  return {
    data,
    flags: scanUnsupportedClaims({
      cv: data,
      corpus: buildProfileEvidenceCorpus(profile),
      durationFact: experienceDurationFact(trusted),
      dateEntities: profileDateEntities(profile, formatDateRange),
    }),
  };
}

function emptyCv(overrides: Partial<RewrittenCVData> = {}): RewrittenCVData {
  return {
    fullName: 'A Candidate',
    tagline: '',
    contact: { email: '', phone: '', location: '' },
    professionalSummary: '',
    education: [],
    projects: [],
    experience: [],
    coreSkills: [],
    certifications: [],
    ...overrides,
  };
}

describe('deterministic Profile build — duration safety', () => {
  it('Case 1: a project-only candidate produces no professional-duration claim', () => {
    const profile = makeProfile({
      projects: [
        { id: 'p1', name: 'Realtime Ingest', skills: [], startDate: '2023-01', endDate: '2024-01', achievements: ['Built a streaming pipeline'] },
      ],
    });
    const { flags } = scanProfileBuild(profile);
    expect(flags).toHaveLength(0);
  });

  it('rejects a user tagline claiming tenure a project-only history cannot support', () => {
    const profile = makeProfile({
      personal: { ...makeProfile().personal, tagline: 'Data Analyst · 2+ yrs' },
      projects: [
        { id: 'p1', name: 'Analysis', skills: [], startDate: '2023-01', endDate: '2024-01', achievements: [] },
      ],
    });
    const { flags } = scanProfileBuild(profile);
    expect(flags.some((flag) => flag.kind === 'experience_duration')).toBe(true);
  });

  it('rejects an education-only tenure claim', () => {
    const profile = makeProfile({
      personal: { ...makeProfile().personal, tagline: 'Researcher · 3 years' },
      education: [
        { id: 'e1', degree: 'MSc CS', university: 'UOM', startDate: '', endDate: '2025', current: false, grade: '', description: '' },
      ],
    });
    const { flags } = scanProfileBuild(profile);
    expect(flags.some((flag) => flag.kind === 'experience_duration')).toBe(true);
  });

  it('allows a tenure claim backed by qualifying month-precise experience', () => {
    const profile = makeProfile({
      personal: { ...makeProfile().personal, tagline: 'Engineer · 2 yrs' },
      experience: [
        { id: 'x1', jobTitle: 'Engineer', company: 'Acme', location: '', type: 'FULL_TIME', startDate: '2022-01', endDate: '2023-12', current: false, achievements: [] },
      ],
    });
    const { flags } = scanProfileBuild(profile);
    expect(flags.some((flag) => flag.kind === 'experience_duration')).toBe(false);
  });

  it('rejects a tenure claim that exceeds the deterministically supported months', () => {
    const profile = makeProfile({
      personal: { ...makeProfile().personal, tagline: 'Engineer · 5+ yrs' },
      experience: [
        { id: 'x1', jobTitle: 'Engineer', company: 'Acme', location: '', type: 'FULL_TIME', startDate: '2022-01', endDate: '2023-12', current: false, achievements: [] },
      ],
    });
    const { flags } = scanProfileBuild(profile);
    expect(flags.some((flag) => flag.kind === 'experience_duration')).toBe(true);
  });
});

describe('deterministic Profile build — date precision', () => {
  it('Case 2: an end-year-only Education renders the single year, never a range', () => {
    const profile = makeProfile({
      education: [
        { id: 'e1', degree: 'MSc CS', university: 'UOM', startDate: '', endDate: '2025', current: false, grade: '', description: '' },
      ],
    });
    const { data, flags } = scanProfileBuild(profile);
    // The rendered range collapses to the single supported year.
    expect(formatDateRange(data.education[0].startDate, data.education[0].endDate)).toBe('2025');
    expect(flags.some((flag) => flag.kind === 'date_expansion')).toBe(false);
  });

  it('preserves month precision without inventing a day or widening the range', () => {
    const profile = makeProfile({
      experience: [
        { id: 'x1', jobTitle: 'Engineer', company: 'Acme', location: '', type: 'FULL_TIME', startDate: '2024-12', endDate: '', current: true, achievements: [] },
      ],
    });
    const { data } = scanProfileBuild(profile);
    expect(formatDateRange(data.experience[0].startDate, data.experience[0].endDate)).toBe('Dec 2024 – Present');
  });

  it('flags a rendered range that invents a start the record does not have', () => {
    const flags = scanUnsupportedClaims({
      cv: emptyCv(),
      corpus: buildEvidenceCorpus([]),
      durationFact: experienceDurationFact(
        buildTrustedGenerationContext({ profile: makeProfile(), approvedEvidence: [], now: NOW })
      ),
      dateEntities: [{ canonical: { startDate: '', endDate: '2025' }, rendered: '2023 – 2025' }],
    });
    expect(flags.some((flag) => flag.kind === 'date_expansion')).toBe(true);
  });
});

describe('scanUnsupportedClaims — vocabulary detectors', () => {
  const insufficient = experienceDurationFact(
    buildTrustedGenerationContext({ profile: makeProfile(), approvedEvidence: [], now: NOW })
  );

  it('rejects unsupported seniority', () => {
    const flags = scanUnsupportedClaims({
      cv: emptyCv({ tagline: 'Senior Software Engineer' }),
      corpus: buildEvidenceCorpus(['Software Engineer at Acme building services']),
      durationFact: insufficient,
    });
    expect(flags.some((flag) => flag.kind === 'seniority')).toBe(true);
  });

  it('passes seniority already present in evidence', () => {
    const flags = scanUnsupportedClaims({
      cv: emptyCv({ tagline: 'Senior Software Engineer' }),
      corpus: buildEvidenceCorpus(['Senior Software Engineer at Acme']),
      durationFact: insufficient,
    });
    expect(flags.some((flag) => flag.kind === 'seniority')).toBe(false);
  });

  it('rejects a JD-only tool claimed as a skill', () => {
    const flags = scanUnsupportedClaims({
      cv: emptyCv({ coreSkills: [{ category: 'Tools', skills: 'HubSpot, Excel' }] }),
      corpus: buildEvidenceCorpus(['Managed spreadsheets in Excel']),
      durationFact: insufficient,
      toolVocabulary: ['hubspot'],
    });
    expect(flags.some((flag) => flag.kind === 'tool')).toBe(true);
  });

  it('rejects an unsupported metric', () => {
    const flags = scanUnsupportedClaims({
      cv: emptyCv({
        experience: [
          { jobTitle: 'Analyst', company: 'Acme', location: '', type: '', startDate: '', endDate: '', achievements: [{ label: '', body: 'Increased revenue by £250,000' }] },
        ],
      }),
      corpus: buildEvidenceCorpus(['Worked on revenue reporting']),
      durationFact: insufficient,
    });
    expect(flags.some((flag) => flag.kind === 'metric')).toBe(true);
  });

  it('rejects an unsupported commercial-context claim', () => {
    const flags = scanUnsupportedClaims({
      cv: emptyCv({ professionalSummary: 'Strong client-facing campaign management background.' }),
      corpus: buildEvidenceCorpus(['Academic research projects on data pipelines']),
      durationFact: insufficient,
    });
    expect(flags.some((flag) => flag.kind === 'commercial_context')).toBe(true);
  });

  it('passes a fully supported CV', () => {
    const flags = scanUnsupportedClaims({
      cv: emptyCv({ professionalSummary: 'Software engineer building data pipelines.' }),
      corpus: buildEvidenceCorpus(['Software engineer building data pipelines at Acme']),
      durationFact: insufficient,
    });
    expect(flags).toHaveLength(0);
  });
});

describe('supporting helpers', () => {
  it('collectGeneratedClaimText gathers claims but excludes contact details', () => {
    const text = collectGeneratedClaimText(
      emptyCv({ tagline: 'Lead Engineer', contact: { email: 'secret@x.com', phone: '999', location: 'Mars' } })
    );
    expect(text).toContain('Lead Engineer');
    expect(text).not.toContain('secret@x.com');
  });

  it('toolVocabularyFromRequirements yields tokens only from unmet tool requirements', () => {
    const requirements: RewriteRequirement[] = [
      { id: 'r1', text: 'HubSpot CRM experience', importance: 'mandatory', status: 'not_met', category: 'tool', cvEvidence: [], approvedProfileEvidence: [] },
      { id: 'r2', text: 'Excel', importance: 'mandatory', status: 'met', category: 'tool', cvEvidence: [], approvedProfileEvidence: [] },
      { id: 'r3', text: 'Right to work in the UK', importance: 'mandatory', status: 'not_met', category: 'eligibility', cvEvidence: [], approvedProfileEvidence: [] },
    ];
    const vocab = toolVocabularyFromRequirements(requirements);
    expect(vocab).toContain('hubspot');
    expect(vocab).toContain('crm');
    expect(vocab).not.toContain('excel'); // met — already evidenced
    expect(vocab).not.toContain('work'); // not a tool requirement
  });

  it('unsupportedClaimUserMessage never leaks internal claim fragments', () => {
    const message = unsupportedClaimUserMessage([
      { kind: 'experience_duration', claim: '2+ yrs', reason: 'internal' },
    ]);
    expect(message).not.toContain('2+ yrs');
    expect(message).not.toContain('internal');
    expect(message.length).toBeGreaterThan(0);
  });
});
