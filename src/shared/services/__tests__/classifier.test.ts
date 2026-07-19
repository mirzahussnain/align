import { describe, it, expect, vi } from 'vitest';
import { classifyCV, scoreOccupationEvidence, deriveSeniority } from '../classifier';
import { loadFixtureCV } from '@/__fixtures__/load-cv';

/** AI stub that must not be reached unless a test expects it. */
const aiMustNotRun = vi.fn(async () => {
  throw new Error('AI tier consulted when a deterministic tier should have resolved');
});

describe('precedence: job description beats everything', () => {
  it('classifies from the JD title even when CV and profile disagree', async () => {
    const c = await classifyCV(
      {
        cvText: loadFixtureCV('warehouse-flt-no-projects'),
        jobDescription: 'Office Administrator\nWe are hiring an administrator for our Wigan depot...',
        profileTarget: { occupation: 'software_engineer' },
        aiAllowed: true,
      },
      aiMustNotRun
    );
    expect(c.occupation).toBe('administrator');
    expect(c.source).toBe('job_description');
    expect(c.confidence).toBe(0.95);
    expect(c.reasonCodes).toContain('JOB_TITLE_EXACT_MATCH');
  });

  it('a warehouse-to-admin career changer is evaluated against the target role', async () => {
    // The core cross-industry case: historic occupation must not win.
    const c = await classifyCV(
      {
        cvText: loadFixtureCV('warehouse-flt-no-projects'),
        jobDescription: 'Administrative Assistant — NHS Trust\nBand 3 administrative support role...',
        aiAllowed: true,
      },
      aiMustNotRun
    );
    expect(c.occupation).toBe('administrator');
  });
});

describe('precedence: profile target beats CV evidence', () => {
  it('uses a valid target occupation', async () => {
    const c = await classifyCV(
      {
        cvText: loadFixtureCV('warehouse-flt-no-projects'),
        profileTarget: { occupation: 'warehouse_operative', seniority: 'mid' },
        aiAllowed: true,
      },
      aiMustNotRun
    );
    expect(c.occupation).toBe('warehouse_operative');
    expect(c.source).toBe('profile_target');
    expect(c.seniority).toBe('mid');
    expect(c.reasonCodes).toContain('PROFILE_TARGET_SET');
  });

  it('resolves a free-text role title deterministically', async () => {
    const c = await classifyCV(
      {
        cvText: loadFixtureCV('admin-office'),
        profileTarget: { roleTitle: 'Warehouse Administrator' },
        aiAllowed: true,
      },
      aiMustNotRun
    );
    // "Warehouse Administrator" is an administrator occupation in a warehouse sector.
    expect(c.occupation).toBe('administrator');
    expect(c.source).toBe('profile_target');
  });

  it('ignores an unknown occupation string and falls through', async () => {
    const c = await classifyCV(
      {
        cvText: loadFixtureCV('registered-nurse-no-nmc'),
        profileTarget: { occupation: 'astronaut' },
        aiAllowed: true,
      },
      aiMustNotRun
    );
    expect(c.source).toBe('dictionary_evidence');
    expect(c.occupation).toBe('registered_nurse');
  });
});

describe('deterministic evidence tier on golden fixtures', () => {
  const cases = [
    ['warehouse-flt-no-projects', 'warehouse_operative'],
    ['junior-dev-with-projects', 'software_engineer'],
    ['registered-nurse-no-nmc', 'registered_nurse'],
    ['admin-office', 'administrator'],
  ] as const;

  it.each(cases)('%s → %s without AI', async (fixture, occupation) => {
    const c = await classifyCV({ cvText: loadFixtureCV(fixture), aiAllowed: false }, aiMustNotRun);
    expect(c.occupation).toBe(occupation);
    expect(c.source).toBe('dictionary_evidence');
    expect(c.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it('classification carries the profile-derived workflow fields', async () => {
    const c = await classifyCV({ cvText: loadFixtureCV('registered-nurse-no-nmc'), aiAllowed: false }, aiMustNotRun);
    expect(c.regulated).toBe(true);
    expect(c.applicationWorkflow).toBe('supporting_statement_led');
    expect(c.primaryArtifact).toBe('supporting_statement');
    expect(c.roleArchetype).toBe('regulated_clinician');
  });

  it('every result carries reason codes', async () => {
    for (const [fixture] of cases) {
      const c = await classifyCV({ cvText: loadFixtureCV(fixture), aiAllowed: false }, aiMustNotRun);
      expect(c.reasonCodes.length).toBeGreaterThan(0);
    }
  });
});

describe('sector vocabulary must not decide occupation', () => {
  // A data-analyst-shaped CV soaked in NHS vocabulary: sector terms everywhere,
  // no nurse titles, no clinical task patterns, no NMC.
  const nhsAnalystCv = `AMARA OKafor
Leeds | amara.okafor@example.com

PROFILE
Data analyst with 4 years' experience in NHS informatics teams, turning patient
activity data into actionable reporting for clinical and operational leaders.

SKILLS
SQL, Power BI, Excel, Python, data quality, information governance

EXPERIENCE
Data Analyst — NHS Trust Informatics, Leeds
Built Power BI dashboards for patient flow, bed occupancy, and waiting lists
Automated monthly SystmOne data extracts with SQL and Python
Worked with clinical teams on data quality and information governance

EDUCATION
BSc Mathematics, University of Leeds`;

  it('does not classify the NHS data analyst as a nurse', async () => {
    const c = await classifyCV({ cvText: nhsAnalystCv, aiAllowed: false }, aiMustNotRun);
    expect(c.occupation).not.toBe('registered_nurse');
  });

  it('sector-only evidence is capped as ambiguous', () => {
    // Text containing warehouse sector vocabulary but no operative titles/tasks.
    const sectorSoup =
      'Discussion of warehouse management systems, supply chain, pallets, logistics networks and distribution centres in the UK.';
    const evidence = scoreOccupationEvidence(sectorSoup);
    expect(evidence.confidence).toBeLessThan(0.8);
  });
});

describe('AI tier and fallback', () => {
  const ambiguousCv = `ALEX MORGAN
Operations Coordinator
Coordinated cross-functional work across teams, maintained documentation,
tracked deliverables, and supported process improvement initiatives.`;

  it('consults the AI tier only when ambiguous, and caps its confidence', async () => {
    const aiStub = vi.fn(async () => ({
      occupation: 'administrator' as const,
      sector: 'admin_office' as const,
      seniority: 'mid' as const,
      confidence: 0.97,
    }));
    const c = await classifyCV({ cvText: ambiguousCv, aiAllowed: true }, aiStub);
    expect(aiStub).toHaveBeenCalledOnce();
    expect(c.occupation).toBe('administrator');
    expect(c.source).toBe('ai');
    expect(c.confidence).toBeLessThanOrEqual(0.9);
    expect(c.reasonCodes).toContain('AI_CLASSIFIED');
    expect(c.seniority).toBe('mid');
  });

  it('falls back to generic when AI is not allowed', async () => {
    const c = await classifyCV({ cvText: ambiguousCv, aiAllowed: false }, aiMustNotRun);
    expect(c.occupation).toBe('generic');
    expect(c.source).toBe('fallback');
    expect(c.confidence).toBeLessThanOrEqual(0.4);
    expect(c.reasonCodes).toContain('FALLBACK');
  });

  it('falls back to generic when the AI returns nothing', async () => {
    const aiNull = vi.fn(async () => null);
    const c = await classifyCV({ cvText: ambiguousCv, aiAllowed: true }, aiNull);
    expect(c.occupation).toBe('generic');
    expect(c.source).toBe('fallback');
  });
});

describe('deriveSeniority', () => {
  it.each([
    ['Senior Frontend Engineer at Acme', 'senior'],
    ['Principal Engineer — Platform', 'lead'],
    ['Junior software developer with 1 year of experience', 'entry'],
    ['Graduate nurse starting rotation', 'entry'],
  ] as const)('"%s" → %s', (text, expected) => {
    expect(deriveSeniority(text)).toBe(expected);
  });

  it('falls back to years-of-experience arithmetic', () => {
    expect(deriveSeniority("Administrator with 9 years' experience in office management")).toBe('senior');
    expect(deriveSeniority("Administrator with 4 years' experience")).toBe('mid');
  });
});
