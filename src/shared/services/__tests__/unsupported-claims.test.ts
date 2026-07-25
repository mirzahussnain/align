import { describe, expect, it } from 'vitest';
import { buildEvidenceCorpus } from '@/shared/services/cv-evidence';
import { deriveProfessionalExperience, type DurationExperienceInput } from '@/shared/services/derived-facts';
import {
  detectDateExpansion,
  detectDurationClaims,
  detectUnsupportedCommercialContext,
  detectUnsupportedMetrics,
  detectUnsupportedSeniority,
  detectUnsupportedTools,
  flagUnsupportedDurationClaims,
} from '@/shared/services/unsupported-claims';

const NOW = new Date('2025-06-15T00:00:00Z');
function role(o: Partial<DurationExperienceInput>): DurationExperienceInput {
  return { id: 'r', startDate: '', endDate: '', current: false, type: 'FULL_TIME', ...o };
}

describe('detectDateExpansion', () => {
  it('flags a range that invents a start the record lacks', () => {
    const flag = detectDateExpansion({ startDate: null, endDate: '2025' }, 'Studied 2023–2025');
    expect(flag?.kind).toBe('date_expansion');
  });

  it('flags a range whose endpoints disagree with canonical dates', () => {
    const flag = detectDateExpansion({ startDate: '2024', endDate: '2025' }, '2023–2025');
    expect(flag).not.toBeNull();
  });

  it('allows a range that matches canonical dates', () => {
    expect(detectDateExpansion({ startDate: '2023', endDate: '2025' }, '2023 – 2025')).toBeNull();
  });

  it('ignores text with no rendered range', () => {
    expect(detectDateExpansion({ startDate: null, endDate: '2025' }, 'Completed 2025')).toBeNull();
  });
});

describe('detectDurationClaims', () => {
  it('parses digit and word tenure claims', () => {
    const claims = detectDurationClaims('2+ years of Python; over five years leading teams');
    expect(claims.map((c) => c.minYears).sort()).toEqual([2, 5]);
  });
});

describe('flagUnsupportedDurationClaims', () => {
  it('flags every tenure claim when duration is insufficient', () => {
    const fact = deriveProfessionalExperience([], NOW);
    const flags = flagUnsupportedDurationClaims('Data Analyst · 2+ yrs', fact);
    expect(flags).toHaveLength(1);
    expect(flags[0].kind).toBe('experience_duration');
  });

  it('allows a tenure claim backed by a sufficient deterministic duration', () => {
    const fact = deriveProfessionalExperience(
      [role({ id: 'a', startDate: '2020-01', endDate: '2023-01' })], // 37 months
      NOW
    );
    expect(flagUnsupportedDurationClaims('3 years experience', fact)).toHaveLength(0);
  });
});

describe('vocabulary detectors', () => {
  const corpus = buildEvidenceCorpus(['Software Engineer at Acme building internal tools']);

  it('flags unearned seniority', () => {
    const flags = detectUnsupportedSeniority('Senior Software Engineer', corpus);
    expect(flags.map((f) => f.claim)).toContain('senior');
  });

  it('does not flag seniority present in evidence', () => {
    const senior = buildEvidenceCorpus(['Senior Software Engineer at Acme']);
    expect(detectUnsupportedSeniority('Senior Software Engineer', senior)).toHaveLength(0);
  });

  it('flags commercial context absent from evidence', () => {
    const flags = detectUnsupportedCommercialContext('Led client-facing account management', corpus);
    expect(flags.map((f) => f.kind)).toContain('commercial_context');
  });

  it('flags tools claimed but absent from evidence', () => {
    const withPython = buildEvidenceCorpus(['Built internal tools in Python at Acme']);
    const flags = detectUnsupportedTools('Expert in HubSpot and Python', withPython, ['HubSpot', 'Python']);
    expect(flags.map((f) => f.claim)).toEqual(['HubSpot']);
  });

  it('flags metrics absent from evidence', () => {
    const flags = detectUnsupportedMetrics('Improved revenue by £2,000,000', corpus);
    expect(flags.map((f) => f.kind)).toContain('metric');
  });
});
