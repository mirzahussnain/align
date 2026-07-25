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

  it('scores against the declared target industry, not the occupation profile default sector', async () => {
    // An administrator's own occupation profile defaults to a generic office
    // sector; a declared NHS target must override that so keyword scoring
    // matches the vocabulary the user actually said they're applying into.
    const c = await classifyCV(
      {
        cvText: loadFixtureCV('admin-office'),
        profileTarget: { occupation: 'administrator', industry: 'healthcare_nhs' },
        aiAllowed: true,
      },
      aiMustNotRun
    );
    expect(c.occupation).toBe('administrator');
    expect(c.sector).toBe('healthcare_nhs');
  });

  it('ignores an unknown industry string and keeps the occupation profile default sector', async () => {
    const c = await classifyCV(
      {
        cvText: loadFixtureCV('admin-office'),
        profileTarget: { occupation: 'administrator', industry: 'not-a-real-sector' },
        aiAllowed: true,
      },
      aiMustNotRun
    );
    expect(c.occupation).toBe('administrator');
    expect(c.sector).not.toBe('not-a-real-sector');
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
    // The AI tier is flagged off by default; this test opts in explicitly.
    const c = await classifyCV(
      { cvText: ambiguousCv, aiAllowed: true, aiClassificationEnabled: true },
      aiStub
    );
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
    const c = await classifyCV(
      { cvText: ambiguousCv, aiAllowed: true, aiClassificationEnabled: true },
      aiNull
    );
    expect(c.occupation).toBe('generic');
    expect(c.source).toBe('fallback');
  });

  it('does NOT consult the AI tier by default — detection stays deterministic and cost-free', async () => {
    // The feature flag is off, so even an ambiguous CV with AI allowed must
    // resolve deterministically to the generic fallback WITHOUT any AI call.
    const aiSpy = vi.fn(async () => ({
      occupation: 'administrator' as const,
      sector: 'admin_office' as const,
      seniority: 'mid' as const,
      confidence: 0.97,
    }));
    const c = await classifyCV({ cvText: ambiguousCv, aiAllowed: true }, aiSpy);
    expect(aiSpy).not.toHaveBeenCalled();
    expect(c.occupation).toBe('generic');
    expect(c.source).toBe('fallback');
  });
});

describe('explicit regulated targets are retained; automatic detection is guarded', () => {
  // A CV with vague clinical/sector wording but no nurse title, no clinical task
  // patterns, and no NMC — the shape that must never AUTOMATICALLY become a nurse.
  const vagueClinicalCv = `JAMIE LEE
Ward-based support worker
Worked in a busy clinical environment supporting patients and clinical teams.
Familiar with patient care, hospital settings, and NHS ways of working.`;

  it('vague clinical wording cannot automatically activate Registered Nurse', async () => {
    // No explicit target, no AI: automatic detection is subject to the guard.
    const c = await classifyCV({ cvText: vagueClinicalCv, aiAllowed: false }, aiMustNotRun);
    expect(c.occupation).not.toBe('registered_nurse');
  });

  it('an explicit Registered Nurse selection remains the resolved target', async () => {
    // An admin CV carries no nurse corroboration, yet the explicit, confirmed
    // nurse target is authoritative and is NOT replaced by the CV occupation.
    const c = await classifyCV(
      {
        cvText: loadFixtureCV('admin-office'),
        profileTarget: { occupation: 'registered_nurse' },
        aiAllowed: false,
      },
      aiMustNotRun
    );
    expect(c.occupation).toBe('registered_nurse');
    expect(c.source).toBe('profile_target');
  });

  it('reports missing registration as absent rather than replacing the target', async () => {
    const c = await classifyCV(
      {
        cvText: loadFixtureCV('admin-office'),
        profileTarget: { occupation: 'registered_nurse' },
        aiAllowed: false,
      },
      aiMustNotRun
    );
    // The target is retained; corroboration is recorded as ABSENT (missing/
    // unclear), never replaced with the administrator the CV would detect.
    expect(c.occupation).toBe('registered_nurse');
    expect(c.regulatedEvidence).toBe('absent');
    expect(c.reasonCodes).toContain('REGULATED_TARGET_UNCORROBORATED');
  });

  it('does not infer regulated status — absent is never reported as present', async () => {
    const c = await classifyCV(
      {
        cvText: loadFixtureCV('admin-office'),
        profileTarget: { occupation: 'registered_nurse' },
        aiAllowed: false,
      },
      aiMustNotRun
    );
    expect(c.regulated).toBe(true); // the target IS a regulated occupation
    expect(c.regulatedEvidence).not.toBe('present'); // but no registration is inferred
  });

  it('a corroborated nurse target records regulated evidence as present', async () => {
    // The genuine nurse fixture has a "Staff Nurse" title line → corroborated.
    const c = await classifyCV(
      {
        cvText: loadFixtureCV('registered-nurse-no-nmc'),
        profileTarget: { occupation: 'registered_nurse' },
        aiAllowed: false,
      },
      aiMustNotRun
    );
    expect(c.occupation).toBe('registered_nurse');
    expect(c.regulatedEvidence).toBe('present');
    expect(c.reasonCodes).not.toContain('REGULATED_TARGET_UNCORROBORATED');
  });
});

describe('job_match mode: target comes from the JD, never the CV', () => {
  it('resolves from the JD role and duties even when the title sits below the header window', async () => {
    // The head-title check only scans the first ~1200 chars; a title deep in the
    // advert (after a long preamble) is caught by the JD-evidence fallback, which
    // reads the whole JD. Still entirely JD-derived — the CV is a software CV.
    const preamble =
      'About us: we are an established, values-led employer serving customers across the North West. '.repeat(
        16
      );
    const jd = `${preamble}
Warehouse Operative
You will be picking and packing orders, using an RF scanner, moving pallets,
carrying out stock control, and loading and unloading deliveries.`;
    const c = await classifyCV(
      { cvText: loadFixtureCV('junior-dev-with-projects'), mode: 'job_match', jobDescription: jd, aiAllowed: true },
      aiMustNotRun
    );
    expect(c.occupation).toBe('warehouse_operative');
    expect(c.source).toBe('job_description');
  });

  it('falls to generic when the JD is unrecognisable — the CV never sets the target', async () => {
    const c = await classifyCV(
      {
        // A strongly warehouse CV must NOT make a vague vacancy a warehouse match.
        cvText: loadFixtureCV('warehouse-flt-no-projects'),
        mode: 'job_match',
        jobDescription: 'We are a fast-growing team seeking a motivated, adaptable person to grow with us.',
        aiAllowed: true,
      },
      aiMustNotRun
    );
    expect(c.occupation).toBe('generic');
    expect(c.source).toBe('fallback');
  });
});

describe('cross-occupation regression matrix (deterministic calibration)', () => {
  // Confident classification of each SUPPORTED occupation from realistic CVs.
  // These lean on the golden fixtures where they exist and inline text otherwise.
  describe('each occupation classifies confidently from defining evidence', () => {
    const confident = [
      ['warehouse-flt-no-projects', 'warehouse_operative'],
      ['junior-dev-with-projects', 'software_engineer'],
      ['admin-office', 'administrator'],
      ['registered-nurse-no-nmc', 'registered_nurse'],
      ['hca-no-nmc', 'healthcare_support'],
    ] as const;

    it.each(confident)('%s → %s at >= 0.8, deterministically', async (fixture, occupation) => {
      const c = await classifyCV({ cvText: loadFixtureCV(fixture), aiAllowed: false }, aiMustNotRun);
      expect(c.occupation).toBe(occupation);
      expect(c.source).toBe('dictionary_evidence');
      expect(c.confidence).toBeGreaterThanOrEqual(0.8);
      // Every confident match spans a defining title AND defining duties.
      expect(c.reasonCodes).toContain('JOB_TITLE_EXACT_MATCH');
      expect(c.reasonCodes).toContain('CORE_TASKS_MATCH');
    });
  });

  // A technical CV that is ONLY projects (no employment title) still classifies
  // via defining duties + distinctive outputs — evidence, not job-title, decides.
  it('a technical project-only CV classifies as software engineering', async () => {
    const projectCv = `DEV PORTFOLIO — Manchester

PROJECTS
CourtBook — built a full-stack booking system with React, Node.js and PostgreSQL, deployed to production serving 2,000 users.
Wrote unit tests and end-to-end tests; set up a CI pipeline running lint, tests and deploys.
DevTracker — open-source dashboard aggregating data via a REST API, with 90% test coverage.
Refactored the API service to cut latency, and maintained the component library.`;
    const c = await classifyCV({ cvText: projectCv, aiAllowed: false }, aiMustNotRun);
    expect(c.occupation).toBe('software_engineer');
    expect(c.confidence).toBeGreaterThanOrEqual(0.8);
    expect(c.reasonCodes).toContain('DISTINCTIVE_OUTPUT_MATCH');
  });

  // --- Shared-signal ambiguity: none may decide an occupation on its own -----
  describe('shared / weak signals never decide an occupation', () => {
    it('Python + SQL alone is analytical-or-software ambiguity → generic, not software engineering', async () => {
      const toolsOnlyCv = `SAM PATEL
Analyst — Leeds
Skills: Python, SQL, Excel
Produced weekly reporting for the team and analysed datasets.`;
      const c = await classifyCV({ cvText: toolsOnlyCv, aiAllowed: false }, aiMustNotRun);
      expect(c.occupation).toBe('generic');
      expect(c.source).toBe('fallback');
      // The tool signal is recorded but was never allowed to decide.
      expect(c.reasonCodes).toContain('TOOLS_MATCH');
    });

    it('customer service alone does not decide administration', async () => {
      const csCv = `JEAN LIU
Customer Service Representative
Handled customer enquiries, resolved complaints, delivered excellent customer service.
Strong communication, teamwork and reliability.`;
      const c = await classifyCV({ cvText: csCv, aiAllowed: false }, aiMustNotRun);
      expect(c.occupation).not.toBe('administrator');
      expect(c.occupation).toBe('generic');
    });

    it('unqualified "stock" does not decide warehouse over retail', async () => {
      const stockCv = `Retail Assistant
Managed stock on the shop floor and helped customers find products.
Replenished shelves and handled stock deliveries.`;
      const c = await classifyCV({ cvText: stockCv, aiAllowed: false }, aiMustNotRun);
      expect(c.occupation).not.toBe('warehouse_operative');
    });

    it('records/documentation alone decides neither administration nor healthcare', async () => {
      const recordsCv = `Records Officer
Maintained records and documentation and kept files up to date across the organisation.`;
      const c = await classifyCV({ cvText: recordsCv, aiAllowed: false }, aiMustNotRun);
      expect(c.occupation).not.toBe('administrator');
      expect(c.occupation).not.toBe('registered_nurse');
      expect(c.occupation).toBe('generic');
    });

    it('a sparse CV with tools but no duties falls to generic', async () => {
      const sparseCv = `ALEX KIM
Familiar with Excel, SQL and RF scanners.`;
      const c = await classifyCV({ cvText: sparseCv, aiAllowed: false }, aiMustNotRun);
      expect(c.occupation).toBe('generic');
      expect(c.source).toBe('fallback');
    });
  });

  // --- No double-counting: one fragment cannot be both a duty AND an output ---
  describe('a single fragment is never counted as both a defining duty and a distinctive output', () => {
    it('an output that echoes the same text a duty claimed does not add an independent signal', () => {
      // "the production system" is claimed by the SE duty pattern (deployed…system);
      // the output pattern (production…system) matches the SAME span, so it must
      // NOT count as a second, independent defining category.
      const overlapCv = `CASEY MORGAN
Deployed the production system for a client and maintained the codebase.`;
      const e = scoreOccupationEvidence(overlapCv);
      expect(e.occupation).toBe('software_engineer');
      expect(e.reasonCodes).toContain('CORE_TASKS_MATCH');
      expect(e.reasonCodes).not.toContain('DISTINCTIVE_OUTPUT_MATCH');
      // A lone defining category → not confident (the guard denied it the second).
      expect(e.reasonCodes).toContain('INSUFFICIENT_DIVERSITY');
      expect(e.confidence).toBeLessThan(0.8);
    });

    it('an output on genuinely separate text DOES count as an independent signal', () => {
      // Same duty fragment, but the outputs (open-source, test coverage) sit on
      // their own text — genuinely separate occupational signals, so they count.
      const separateCv = `CASEY MORGAN
Deployed the production system for a client.
Published an open-source dashboard with 90% test coverage.`;
      const e = scoreOccupationEvidence(separateCv);
      expect(e.occupation).toBe('software_engineer');
      expect(e.reasonCodes).toContain('CORE_TASKS_MATCH');
      expect(e.reasonCodes).toContain('DISTINCTIVE_OUTPUT_MATCH');
      expect(e.reasonCodes).not.toContain('INSUFFICIENT_DIVERSITY');
    });
  });

  // --- The clinical boundary: support work must not become registered nursing -
  it('patient support with personal care classifies as healthcare support, never registered nurse', async () => {
    const supportCv = `SOPHIE REID
Support Worker — Leeds
Provided personal care and moving and handling for patients in a care home.
Recorded care notes and reported safeguarding concerns to senior staff.`;
    const c = await classifyCV({ cvText: supportCv, aiAllowed: false }, aiMustNotRun);
    expect(c.occupation).toBe('healthcare_support');
    expect(c.occupation).not.toBe('registered_nurse');
  });

  // --- Mixed-career: genuinely balanced evidence → low confidence → generic ---
  it('a balanced two-occupation CV resolves to generic rather than a marginal winner', async () => {
    const mixedCv = `JORDAN BLAKE
Warehouse Operative and Office Administrator
Picking and packing orders to targets; diary management and minute taking for the site team.`;
    const c = await classifyCV({ cvText: mixedCv, aiAllowed: false }, aiMustNotRun);
    expect(c.occupation).toBe('generic');
    expect(c.confidence).toBeLessThan(0.8);
  });

  // --- Unsupported occupation: no defensible profile → generic (never forced) --
  it('a clear but UNSUPPORTED occupation resolves to generic, not the nearest weak profile', async () => {
    const chefCv = `MARIA SANTOS
Head Chef — Bristol
Ran a busy kitchen brigade, designed seasonal menus, controlled food cost and GP margin,
led kitchen staff, and maintained food hygiene and allergen compliance.`;
    const c = await classifyCV({ cvText: chefCv, aiAllowed: false }, aiMustNotRun);
    expect(c.occupation).toBe('generic');
    expect(c.source).toBe('fallback');
  });

  // --- Explicit target authority: overrides automatic CV detection ------------
  it('an explicit target overrides the occupation the CV evidence would detect', async () => {
    // The CV is unambiguously a warehouse operative, but the user targets admin.
    const c = await classifyCV(
      {
        cvText: loadFixtureCV('warehouse-flt-no-projects'),
        profileTarget: { occupation: 'administrator' },
        aiAllowed: false,
      },
      aiMustNotRun
    );
    expect(c.occupation).toBe('administrator');
    expect(c.source).toBe('profile_target');
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
