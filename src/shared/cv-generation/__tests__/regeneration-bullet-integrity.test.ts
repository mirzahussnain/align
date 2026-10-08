import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { extractStoredCv } from '@/shared/services/cv-extraction';
import { extractionToCandidateEvidence } from '../source-cv';
import { proposeCvPlan } from '../planner';
import { assembleCvBuildSpec } from '../build-spec';
import { generateV2Template } from '@/shared/templates/v2';
import type { ApprovedCvPlan } from '../types';

const affectedPdf = new URL('../../services/cv-extraction/__tests__/fixtures/Hussnain_Ali_CV_Finalv2.pdf', import.meta.url);

describe('CV regeneration bullet integrity', () => {
  it('regenerates the affected PDF as complete, ordered, one-paragraph DOCX bullets', async () => {
    const extraction = await extractStoredCv(await readFile(affectedPdf));
    const evidence = extractionToCandidateEvidence(extraction.structured, { cvRevisionId: 'affected-cv', extractionId: 'affected-extraction' });
    const proposed = proposeCvPlan({ evidence, reconciliation: { schemaVersion: 1, items: [] }, sourceMode: 'JOB_MATCH', atsStrategy: 'STANDARD', target: {} });
    const plan: ApprovedCvPlan = { ...proposed, approvedAt: new Date(0).toISOString() };
    const spec = assembleCvBuildSpec({ generationId: 'affected-regeneration', evidence, plan, templateId: 'architect' });
    const experience = spec.sections.find((section) => section.type === 'EXPERIENCE');
    if (experience?.type !== 'EXPERIENCE') throw new Error('Expected experience section');

    expect(experience.items.map(({ title }) => title)).toEqual([
      'Software Engineer',
      'Software Engineer (Junior Full-Stack Developer)',
      'Associate Web Developer',
    ]);
    const experienceLines = experience.items.flatMap(({ lines }) => lines.map(({ text }) => text));
    expect(experienceLines).toContain('Diagnosed authentication, storage, performance and mobile-browser issues, validating releases through automated tests, type checking, linting and real-device testing.');
    expect(experienceLines).toContain('Reduced redundant API calls by 30% through RTK Query caching and improved average database response time by 20% by refactoring multi-join Prisma queries.');
    expect(experienceLines).not.toContain('linting and real-device testing.');
    expect(experienceLines).not.toContain('join Prisma queries.');
    expect(experienceLines.join(' ')).not.toContain('refactor ing');

    const archive = await JSZip.loadAsync(await generateV2Template(spec));
    const xml = await archive.file('word/document.xml')!.async('string');
    const renderedLineCount = spec.sections.reduce((count, section) =>
      count + ('items' in section ? section.items.reduce((itemCount, item) => itemCount + ('lines' in item ? item.lines.length : 0), 0) : 0), 0);
    expect(xml.match(/<w:numPr>/gu)).toHaveLength(renderedLineCount);
    expect(xml.indexOf('Software Engineer')).toBeLessThan(xml.indexOf('Software Engineer (Junior Full-Stack Developer)'));
    expect(xml.indexOf('Software Engineer (Junior Full-Stack Developer)')).toBeLessThan(xml.indexOf('Associate Web Developer'));
    for (const line of experienceLines) expect(xml.split(line)).toHaveLength(2);
    expect(xml).not.toContain('refactor ing');
  });
});
