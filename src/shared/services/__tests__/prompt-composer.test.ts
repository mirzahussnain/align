import { describe, it, expect } from 'vitest';
import { composeSemanticPrompt, composeJobMatchPrompt } from '../prompt-composer';
import { getOccupationProfile } from '@/shared/occupations/registry';
import { fallbackContext, analyzeCV } from '@/shared/utils/scoring-engine';
import { classifyCV } from '@/shared/services/classifier';
import { loadFixtureCV, type FixtureCV } from '@/__fixtures__/load-cv';
import type { Classification } from '@/shared/types/classification';

async function compose(fixture: FixtureCV) {
  const text = loadFixtureCV(fixture);
  const classification = await classifyCV({ cvText: text, aiAllowed: false });
  const profile = getOccupationProfile(classification.occupation);
  const baseResult = analyzeCV(text, 1, { classification, profile });
  return {
    semantic: composeSemanticPrompt(text, baseResult, profile, classification),
    jobMatch: composeJobMatchPrompt(text, 'Some job description', profile, classification),
    classification,
  };
}

/**
 * Prohibition lines legitimately NAME the things they forbid ("Do not expect
 * ... GitHub"), so tech-leakage assertions run on the prompt with those
 * DO-NOT lines removed: anywhere else, a tech term is a real contamination.
 */
const withoutProhibitionLines = (prompt: string) =>
  prompt
    .split('\n')
    .filter(l => !l.trim().startsWith('- Do not'))
    .join('\n');

describe('semantic prompt composition', () => {
  it('warehouse prompt contains no tech expectations outside prohibitions', async () => {
    const { semantic } = await compose('warehouse-flt-no-projects');
    expect(withoutProhibitionLines(semantic)).not.toMatch(
      /jest|cypress|playwright|vitest|testing framework|tech stack|staff-level technical recruiter/i
    );
  });

  it('warehouse prompt carries the profile persona and DO-NOT lines', async () => {
    const { semantic } = await compose('warehouse-flt-no-projects');
    expect(semantic).toContain('warehouse and logistics operative hiring');
    expect(semantic).toContain('STRICT PROHIBITIONS');
    expect(semantic).toContain('Do not expect a projects or portfolio section.');
    expect(semantic).toContain('Do not apply expectations from unrelated industries or occupations.');
  });

  it('nurse prompt carries the NMC credential checklist', async () => {
    const { semantic } = await compose('registered-nurse-no-nmc');
    expect(semantic).toContain('NMC registration (mandatory)');
    expect(withoutProhibitionLines(semantic)).not.toMatch(/jest|cypress|github/i);
  });

  it('tech prompt still speaks tech, via the profile not the template', async () => {
    const { semantic } = await compose('junior-dev-with-projects');
    expect(semantic).toContain('testing practice');
    expect(semantic).toContain('hiring software engineers');
  });

  it('never asks the model to classify the industry', async () => {
    const { semantic } = await compose('admin-office');
    expect(semantic).toContain('already classified upstream');
    expect(semantic).not.toMatch(/classify this cv into/i);
    expect(semantic).not.toMatch(/isTechRole|detectedIndustry|hasTesting/);
  });
});

describe('job-match prompt composition', () => {
  it('preserves the cv_build_spec contract byte-for-byte fields', async () => {
    const { jobMatch } = await compose('junior-dev-with-projects');
    for (const key of [
      '"recommended_template"',
      '"template_rationale"',
      '"section_order"',
      '"lead_project"',
      '"summary_angle"',
      '"skills_to_surface"',
      '"skills_to_deprioritise"',
      '"bullets_to_rewrite"',
      '"visa_note_required"',
      '"cover_letter_angle"',
    ]) {
      expect(jobMatch).toContain(key);
    }
  });

  it('asks for one complete canonical inventory and server-owned scoring', async () => {
    const { jobMatch } = await compose('admin-office');
    expect(jobMatch).toContain('COMPLETE JD INVENTORY');
    expect(jobMatch).toContain('Each requirement must appear exactly once');
    expect(jobMatch).toContain('location constraint');
    expect(jobMatch).toContain('shift or work-pattern requirement');
    expect(jobMatch).toContain('Do NOT calculate or return matchScore');
    expect(jobMatch).toContain('Do NOT generate requirement ids');
  });

  it('uses the v2 requirement ledger instead of parallel legacy arrays', async () => {
    const { jobMatch } = await compose('registered-nurse-no-nmc');
    expect(jobMatch).toContain('"schemaVersion": 2');
    expect(jobMatch).toContain('"requirements"');
    expect(jobMatch).toContain('"sourceSection"');
    expect(jobMatch).toContain('person specification');
    expect(jobMatch).not.toContain('"selectionCriteria"');
    expect(jobMatch).not.toContain('"mandatorySkills"');
    expect(jobMatch).not.toContain('"matchScore"');
  });

  it('tech depth examples appear only for technical specialists', async () => {
    const dev = await compose('junior-dev-with-projects');
    expect(dev.jobMatch).toContain('PyTorch');

    const warehouse = await compose('warehouse-flt-no-projects');
    expect(warehouse.jobMatch).not.toContain('PyTorch');
    expect(warehouse.jobMatch).toContain('reach truck vs counterbalance');
  });

  it('no tech recruiter persona for non-tech occupations', async () => {
    const { jobMatch } = await compose('registered-nurse-no-nmc');
    expect(jobMatch).not.toMatch(/technical recruiter|top uk tech company/i);
    expect(jobMatch).toContain('healthcare recruiter');
  });
});

describe('generic fallback prompts stay neutral', () => {
  it('uses the generic persona and no occupation assumptions', () => {
    const ctx = fallbackContext();
    const text = 'A CV about something unclassifiable with enough words to analyse.';
    const baseResult = analyzeCV(text, 1, ctx);
    const prompt = composeSemanticPrompt(text, baseResult, ctx.profile, ctx.classification as Classification);
    expect(prompt).toContain('screening CVs across industries');
    expect(prompt).not.toMatch(/jest|nmc|flt/i);
  });
});
