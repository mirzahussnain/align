import { describe, it, expect, vi } from 'vitest';
import { resolveAnalysisContext, detectCvTarget } from '../analysis-context';
import { loadFixtureCV } from '@/__fixtures__/load-cv';

// The AI classifier must never be reached: every case here resolves through a
// deterministic tier. A call means a leak or a precedence regression.
const aiMustNotRun = vi.fn(async () => {
  throw new Error('AI classifier consulted when a deterministic tier should have resolved');
});

const CV_ONLY = { type: 'cv_only' } as const;

// A CV with no title, task, or credential signal — only vague prose. Used to
// prove low-confidence uploads fall to generic rather than guessing.
const ambiguousCv = `ALEX MORGAN
Operations Coordinator
Coordinated cross-functional work across teams, maintained documentation,
tracked deliverables, and supported process improvement initiatives.`;

describe('the active Profile never silently sets an uploaded CV target', () => {
  const leakCases = [
    // profile occupation, CV fixture, expected resolved occupation
    ['software_engineer', 'warehouse-flt-no-projects', 'warehouse_operative'],
    ['warehouse_operative', 'junior-dev-with-projects', 'software_engineer'],
    ['registered_nurse', 'admin-office', 'administrator'],
    ['administrator', 'junior-dev-with-projects', 'software_engineer'],
  ] as const;

  it.each(leakCases)(
    '%s Profile + %s CV → resolves %s from the CV, not the Profile',
    async (profileOccupation, fixture, expected) => {
      const { context, classification } = await resolveAnalysisContext(
        {
          mode: 'ats',
          cvText: loadFixtureCV(fixture),
          activeProfileTarget: { profileId: 'p1', occupation: profileOccupation },
          confirmProfileTarget: false,
          evidenceSource: CV_ONLY,
          aiAllowed: true,
        },
        aiMustNotRun
      );

      expect(context.resolvedTargetOccupation).toBe(expected);
      expect(classification.occupation).toBe(expected);
      expect(context.targetSource).toBe('cv_detected');
      expect(context.resolvedTargetOccupation).not.toBe(profileOccupation);
      // The disagreement is recorded for a non-blocking notice, never applied.
      expect(context.mismatch).toEqual({
        detectedOccupation: expected,
        profileOccupation,
      });
    }
  );

  it('a Profile occupation outside the known set (e.g. teaching) never leaks', async () => {
    // Stands in for "teaching Profile + retail CV" / "academic Profile + software CV":
    // an unmapped Profile family contributes nothing to the target.
    const { context } = await resolveAnalysisContext(
      {
        mode: 'ats',
        cvText: loadFixtureCV('junior-dev-with-projects'),
        activeProfileTarget: { profileId: 'p1', occupation: 'academic_researcher' },
        confirmProfileTarget: false,
        evidenceSource: CV_ONLY,
        aiAllowed: true,
      },
      aiMustNotRun
    );

    expect(context.resolvedTargetOccupation).toBe('software_engineer');
    expect(context.targetSource).toBe('cv_detected');
    // Unknown Profile occupation → no mismatch record (nothing comparable).
    expect(context.mismatch).toBeNull();
  });

  it('a generic Profile does not suppress or override CV detection', async () => {
    const { context } = await resolveAnalysisContext(
      {
        mode: 'ats',
        cvText: loadFixtureCV('hca-no-nmc'),
        activeProfileTarget: { profileId: 'p1', occupation: 'generic' },
        confirmProfileTarget: false,
        evidenceSource: CV_ONLY,
        aiAllowed: true,
      },
      aiMustNotRun
    );

    // An HCA is never a registered nurse, whatever Profile is active.
    expect(context.resolvedTargetOccupation).not.toBe('registered_nurse');
    expect(['cv_detected', 'generic_fallback']).toContain(context.targetSource);
    expect(context.mismatch).toBeNull();
  });
});

describe('agreement and explicit choice', () => {
  it('when Profile and CV agree there is no mismatch and the CV still decides', async () => {
    const { context } = await resolveAnalysisContext(
      {
        mode: 'ats',
        cvText: loadFixtureCV('junior-dev-with-projects'),
        activeProfileTarget: { profileId: 'p1', occupation: 'software_engineer' },
        confirmProfileTarget: false,
        evidenceSource: CV_ONLY,
        aiAllowed: true,
      },
      aiMustNotRun
    );

    expect(context.resolvedTargetOccupation).toBe('software_engineer');
    expect(context.targetSource).toBe('cv_detected');
    expect(context.mismatch).toBeNull();
  });

  it('an explicit user-selected target overrides CV detection', async () => {
    const { context } = await resolveAnalysisContext(
      {
        mode: 'ats',
        cvText: loadFixtureCV('junior-dev-with-projects'),
        explicitTarget: { occupation: 'warehouse_operative' },
        activeProfileTarget: { profileId: 'p1', occupation: 'software_engineer' },
        confirmProfileTarget: false,
        evidenceSource: CV_ONLY,
        aiAllowed: true,
      },
      aiMustNotRun
    );

    expect(context.resolvedTargetOccupation).toBe('warehouse_operative');
    expect(context.targetSource).toBe('user_selected_role');
  });

  it('an explicit free-text role is carried on the context', async () => {
    const { context } = await resolveAnalysisContext(
      {
        mode: 'ats',
        cvText: loadFixtureCV('admin-office'),
        explicitTarget: { roleTitle: 'Warehouse Administrator' },
        evidenceSource: CV_ONLY,
        aiAllowed: true,
      },
      aiMustNotRun
    );

    expect(context.resolvedTargetRole).toBe('Warehouse Administrator');
    expect(context.targetSource).toBe('user_selected_role');
  });

  it('the active Profile sets the target ONLY when the user confirms it', async () => {
    const { context } = await resolveAnalysisContext(
      {
        mode: 'ats',
        cvText: loadFixtureCV('junior-dev-with-projects'),
        activeProfileTarget: { profileId: 'p1', occupation: 'warehouse_operative' },
        confirmProfileTarget: true,
        evidenceSource: CV_ONLY,
        aiAllowed: true,
      },
      aiMustNotRun
    );

    expect(context.resolvedTargetOccupation).toBe('warehouse_operative');
    expect(context.targetSource).toBe('active_profile_confirmed');
    // The confirmed Profile is recorded as the target profile for round-trip.
    expect(context.targetProfileId).toBe('p1');
  });

  it('detected (unconfirmed) records no target profile', async () => {
    const { context } = await resolveAnalysisContext(
      {
        mode: 'ats',
        cvText: loadFixtureCV('warehouse-flt-no-projects'),
        activeProfileTarget: { profileId: 'p1', occupation: 'software_engineer' },
        confirmProfileTarget: false,
        evidenceSource: CV_ONLY,
        aiAllowed: true,
      },
      aiMustNotRun
    );

    expect(context.targetSource).toBe('cv_detected');
    expect(context.targetProfileId).toBeNull();
  });

  it('an explicitly confirmed regulated target is retained even without CV corroboration', async () => {
    const { context, classification } = await resolveAnalysisContext(
      {
        mode: 'ats',
        cvText: loadFixtureCV('admin-office'),
        activeProfileTarget: { profileId: 'p1', occupation: 'registered_nurse' },
        confirmProfileTarget: true,
        evidenceSource: CV_ONLY,
        aiAllowed: true,
      },
      aiMustNotRun
    );

    // Correction 2: an explicit, confirmed regulated target is authoritative and
    // is NOT replaced by the CV's own occupation. Corroboration is recorded as
    // absent so the analysis can report the registration as missing/unclear —
    // never inferred as present.
    expect(context.resolvedTargetOccupation).toBe('registered_nurse');
    expect(context.targetSource).toBe('active_profile_confirmed');
    expect(context.targetProfileId).toBe('p1');
    expect(context.regulatedEvidence).toBe('absent');
    expect(classification.regulatedEvidence).toBe('absent');
    expect(classification.reasonCodes).toContain('REGULATED_TARGET_UNCORROBORATED');
  });

  it('a confirmed saved Profile target records saved_profile_confirmed provenance', async () => {
    // The route hands the chosen saved Profile target in as activeProfileTarget
    // and marks it `saved`, so provenance distinguishes it from the active one.
    const { context } = await resolveAnalysisContext(
      {
        mode: 'ats',
        cvText: loadFixtureCV('junior-dev-with-projects'),
        activeProfileTarget: { profileId: 'saved-2', occupation: 'warehouse_operative' },
        confirmProfileTarget: true,
        confirmedTargetKind: 'saved',
        evidenceSource: CV_ONLY,
        aiAllowed: true,
      },
      aiMustNotRun
    );

    expect(context.resolvedTargetOccupation).toBe('warehouse_operative');
    expect(context.targetSource).toBe('saved_profile_confirmed');
    // The chosen saved Profile is the recorded target profile for round-trip.
    expect(context.targetProfileId).toBe('saved-2');
  });

  it('confirming the active Profile still records active_profile_confirmed', async () => {
    const { context } = await resolveAnalysisContext(
      {
        mode: 'ats',
        cvText: loadFixtureCV('junior-dev-with-projects'),
        activeProfileTarget: { profileId: 'p1', occupation: 'warehouse_operative' },
        confirmProfileTarget: true,
        confirmedTargetKind: 'active',
        evidenceSource: CV_ONLY,
        aiAllowed: true,
      },
      aiMustNotRun
    );

    expect(context.targetSource).toBe('active_profile_confirmed');
    expect(context.targetProfileId).toBe('p1');
  });
});

describe('low-confidence and generic fallback', () => {
  it('a low-confidence CV with no AI resolves to generic, not a guess', async () => {
    const { context } = await resolveAnalysisContext(
      {
        mode: 'ats',
        cvText: ambiguousCv,
        evidenceSource: CV_ONLY,
        aiAllowed: false,
      },
      aiMustNotRun
    );

    expect(context.resolvedTargetOccupation).toBe('generic');
    expect(context.targetSource).toBe('generic_fallback');
    expect(context.confidence).toBe('low');
  });
});

describe('job match: the target is the JD, the Profile is evidence only', () => {
  it('the JD overrides both the CV and the active Profile', async () => {
    const { context } = await resolveAnalysisContext(
      {
        mode: 'job_match',
        cvText: loadFixtureCV('warehouse-flt-no-projects'),
        jobDescription: 'Office Administrator\nWe are hiring an administrator for our Wigan depot.',
        activeProfileTarget: { profileId: 'p1', occupation: 'software_engineer' },
        evidenceSource: CV_ONLY,
        aiAllowed: true,
      },
      aiMustNotRun
    );

    expect(context.resolvedTargetOccupation).toBe('administrator');
    expect(context.targetSource).toBe('job_description');
  });

  it('an unrecognised JD falls to generic — the CV never sets the job-match target', async () => {
    const { context } = await resolveAnalysisContext(
      {
        mode: 'job_match',
        cvText: loadFixtureCV('warehouse-flt-no-projects'),
        jobDescription:
          'We are a fast-growing team looking for a motivated, adaptable person to help us grow.',
        activeProfileTarget: { profileId: 'p1', occupation: 'software_engineer' },
        evidenceSource: CV_ONLY,
        aiAllowed: true,
      },
      aiMustNotRun
    );

    // Not warehouse (from the CV) and not software (from the Profile) — generic.
    expect(context.resolvedTargetOccupation).toBe('generic');
    expect(context.targetSource).toBe('generic_fallback');
  });
});

describe('general (occupation-neutral) review is a deliberate user choice', () => {
  it('forceGeneric resolves to the generic profile with its own provenance', async () => {
    const { context, classification } = await resolveAnalysisContext(
      {
        mode: 'ats',
        cvText: loadFixtureCV('junior-dev-with-projects'),
        // Even with a strong software CV and an active software Profile, a general
        // review is honoured: the user opted out of occupation-specific scoring.
        activeProfileTarget: { profileId: 'p1', occupation: 'software_engineer' },
        forceGeneric: true,
        evidenceSource: CV_ONLY,
        aiAllowed: true,
      },
      aiMustNotRun
    );

    expect(context.resolvedTargetOccupation).toBe('generic');
    expect(classification.occupation).toBe('generic');
    expect(context.targetSource).toBe('user_selected_generic');
    // A deliberate choice is high-confidence, never a low-confidence fallback,
    // and it opts out of the mismatch notice.
    expect(context.confidence).toBe('high');
    expect(context.mismatch).toBeNull();
    expect(context.targetProfileId).toBeNull();
  });

  it('forceGeneric is ignored in job match — the JD stays the target', async () => {
    const { context } = await resolveAnalysisContext(
      {
        mode: 'job_match',
        cvText: loadFixtureCV('warehouse-flt-no-projects'),
        jobDescription: 'Office Administrator\nWe are hiring an administrator for our depot.',
        forceGeneric: true,
        evidenceSource: CV_ONLY,
        aiAllowed: true,
      },
      aiMustNotRun
    );

    expect(context.resolvedTargetOccupation).toBe('administrator');
    expect(context.targetSource).toBe('job_description');
  });
});

describe('detectCvTarget (deterministic pre-analysis detection)', () => {
  it('detects the CV\'s own occupation with no AI', () => {
    const detection = detectCvTarget(loadFixtureCV('warehouse-flt-no-projects'));
    expect(detection.occupation).toBe('warehouse_operative');
    expect(detection.label).toBeTruthy();
    expect(['high', 'medium', 'low']).toContain(detection.confidence);
    expect(detection.mismatch).toBeNull();
  });

  it('flags a mismatch when the CV differs from the given Profile occupation', () => {
    const detection = detectCvTarget(
      loadFixtureCV('warehouse-flt-no-projects'),
      'software_engineer'
    );
    expect(detection.mismatch).toEqual({
      detectedOccupation: 'warehouse_operative',
      profileOccupation: 'software_engineer',
    });
  });

  it('reports no mismatch when the CV and Profile agree', () => {
    const detection = detectCvTarget(
      loadFixtureCV('junior-dev-with-projects'),
      'software_engineer'
    );
    expect(detection.occupation).toBe('software_engineer');
    expect(detection.mismatch).toBeNull();
  });

  it('reports no mismatch for an unknown or generic Profile occupation', () => {
    expect(
      detectCvTarget(loadFixtureCV('warehouse-flt-no-projects'), 'generic').mismatch
    ).toBeNull();
    expect(
      detectCvTarget(loadFixtureCV('warehouse-flt-no-projects'), 'teaching').mismatch
    ).toBeNull();
  });
});

describe('evidence source is independent of the resolved target', () => {
  it('changing the evidence source does not change the resolved target family', async () => {
    const base = {
      mode: 'ats' as const,
      cvText: loadFixtureCV('warehouse-flt-no-projects'),
      activeProfileTarget: { profileId: 'p1', occupation: 'software_engineer' as const },
      confirmProfileTarget: false,
      aiAllowed: true,
    };

    const cvOnly = await resolveAnalysisContext(
      { ...base, evidenceSource: { type: 'cv_only' } },
      aiMustNotRun
    );
    const withProfile = await resolveAnalysisContext(
      { ...base, evidenceSource: { type: 'cv_and_profile', profileId: 'p1' } },
      aiMustNotRun
    );

    expect(cvOnly.context.resolvedTargetOccupation).toBe('warehouse_operative');
    expect(withProfile.context.resolvedTargetOccupation).toBe(
      cvOnly.context.resolvedTargetOccupation
    );
    expect(withProfile.context.evidenceSource).toEqual({ type: 'cv_and_profile', profileId: 'p1' });
  });
});

describe('persisted context shape', () => {
  it('carries every field the persistence/provenance layer records', async () => {
    const { context } = await resolveAnalysisContext(
      {
        mode: 'ats',
        cvText: loadFixtureCV('warehouse-flt-no-projects'),
        activeProfileTarget: { profileId: 'p1', occupation: 'software_engineer' },
        confirmProfileTarget: false,
        evidenceSource: CV_ONLY,
        aiAllowed: true,
      },
      aiMustNotRun
    );

    expect(context).toMatchObject({
      mode: 'ats',
      evidenceSource: { type: 'cv_only' },
      targetSource: 'cv_detected',
      resolvedTargetOccupation: 'warehouse_operative',
      confidence: expect.stringMatching(/high|medium|low/),
      profileId: 'p1',
    });
    // JSON-serialisable so it can ride inside rawResult unchanged.
    expect(() => JSON.parse(JSON.stringify(context))).not.toThrow();
  });
});
