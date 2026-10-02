import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const wizardPath = join(root, 'src/features/cv-generation/components/CvGenerationWizard.tsx');
const cvViewPath = join(root, 'src/features/dashboard/components/views/CvsView.tsx');
const jobMatchPath = join(root, 'src/features/cv-analyzer/components/job-match/JobMatchDashboard.tsx');

describe('canonical CV generation wizard contract', () => {
  it('uses one persisted session flow for both independent source modes and ATS strategies', () => {
    const source = readFileSync(wizardPath, 'utf8');
    expect(source).toContain("sourceMode === 'JOB_MATCH'");
    expect(source).toContain("sourceMode === 'CAREER_PROFILE'");
    expect(source).toContain("atsStrategy === 'STANDARD'");
    expect(source).toContain("atsStrategy === 'COMPOSITE'");
    expect(source).toContain("'/api/cv-generations'");
    expect(source).not.toContain('/api/cv/regenerate');
    expect(source).not.toContain('/api/cv/from-profile');
  });

  it('keeps save-and-reconcile, confirmed missing, plan review, approval, and generation as distinct steps', () => {
    const source = readFileSync(wizardPath, 'utf8');
    for (const route of ['/evidence', '/confirmed-missing', '/plan', '/approve', '/generate']) {
      expect(source).toContain(route);
    }
    expect(source).toContain('Save and re-check all requirements');
    expect(source).toContain('Review the CV plan');
    expect(source).toContain('Approve plan and generate');
  });

  it('is the generation component used by both product entry points', () => {
    for (const path of [cvViewPath, jobMatchPath]) {
      const source = readFileSync(path, 'utf8');
      expect(source).toContain("@/features/cv-generation/components/CvGenerationWizard");
      expect(source).not.toContain("@/features/cv-rewrite/components/RewriteWizardModal");
      expect(source).not.toContain("@/features/cv-rewrite/components/GenerateCvWizardModal");
    }
  });

  it('uses truthful ATS language and never promises a score or pass', () => {
    const source = readFileSync(wizardPath, 'utf8');
    expect(source).toContain('No keyword stuffing or score guarantee.');
    expect(source).not.toMatch(/guaranteed? ATS pass/i);
    expect(source).not.toMatch(/100% ATS/i);
  });
});
