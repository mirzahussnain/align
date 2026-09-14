import { describe, it, expect } from 'vitest';
import { routeWorkflow } from '../workflow-router';
import { classifyCV } from '../classifier';
import { loadFixtureCV } from '@/__fixtures__/load-cv';

const classify = (fixture: Parameters<typeof loadFixtureCV>[0]) =>
  classifyCV({ cvText: loadFixtureCV(fixture), aiAllowed: false });

describe('routeWorkflow', () => {
  it('undefined classification renders the plain cv_led dashboard', () => {
    const w = routeWorkflow(undefined);
    expect(w.primaryArtifact).toBe('cv');
    expect(w.framing).toBeNull();
    expect(w.emphasis).toEqual(['cv_quality']);
  });

  it('software engineer stays cv_led with no framing banner', async () => {
    const w = routeWorkflow(await classify('junior-dev-with-projects'));
    expect(w.primaryArtifact).toBe('cv');
    expect(w.framing).toBeNull();
  });

  it('warehouse operative gets screening-readiness emphasis', async () => {
    const w = routeWorkflow(await classify('warehouse-flt-no-projects'));
    expect(w.primaryArtifact).toBe('application_form');
    expect(w.emphasis).toContain('screening_readiness');
    expect(w.framing).toMatch(/application form/i);
  });

  it('registered nurse routes to supporting-statement emphasis', async () => {
    const w = routeWorkflow(await classify('registered-nurse-no-nmc'));
    expect(w.primaryArtifact).toBe('supporting_statement');
    expect(w.emphasis).toContain('criterion_mapping');
    expect(w.framing).toMatch(/supporting statement/i);
  });

  it('hybrid administrator names a single primary artifact', async () => {
    const w = routeWorkflow(await classify('admin-office'));
    expect(w.primaryArtifact).toBe('cv');
    expect(w.secondaryArtifacts).toContain('application_form');
  });
});
