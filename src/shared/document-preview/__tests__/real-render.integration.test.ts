import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { extractText } from 'unpdf';
import { TEMPLATE_IDS } from '@/shared/constants/templates';
import { renderValidatedDocument } from '../validated-document';
import { createSafeTemplateSample } from '../template-sample';
import { convertDocxToPdf } from '../renderer-client';
import { inspectPdf } from '../pdf-preview';
import type { CvBuildSpecV2 } from '@/shared/cv-generation/build-spec-types';

const rendererIntegrationEnabled = process.env.RUN_RENDERER_INTEGRATION === '1';
const databaseUrl = process.env.DATABASE_URL ?? '';
const localDatabaseEnabled = /@(localhost|127\.0\.0\.1|host\.docker\.internal)[:/]/u.test(databaseUrl);

function underfilledBoundarySample(): CvBuildSpecV2 {
  const spec = createSafeTemplateSample('architect', 'short');
  const evidenceLine = (id: string, text: string) => ({ id, text });
  spec.sections = [
    {
      type: 'PROFILE', heading: 'Profile', lines: [evidenceLine('profile', 'Software engineer with commercial experience designing and shipping full-stack products, asynchronous services, document workflows and reliable cloud infrastructure. Experienced across typed web applications, data systems, computer vision and evidence-led product delivery from idea through production.')],
    },
    {
      type: 'EXPERIENCE', heading: 'Experience', items: [
        { id: 'current', title: 'Software Engineer', employer: 'Independent Products', startDate: '2025-10', current: true, lines: [
          evidenceLine('current-1', 'Built and shipped full-stack products across frontend, backend, APIs, authentication, databases and infrastructure from requirements through production.'),
          evidenceLine('current-2', 'Developed browser workflows, real-time features and asynchronous processing using typed web technologies and cloud services.'),
          evidenceLine('current-3', 'Diagnosed authentication, storage and performance issues with automated tests, type checking and release validation.'),
        ], links: [] },
        { id: 'middle', title: 'Software Engineer', employer: 'Example Agile Solutions', startDate: '2023-12', endDate: '2024-05', lines: [
          evidenceLine('middle-1', 'Reduced redundant API calls through query caching and improved database response time by refactoring multi-join queries.'),
          evidenceLine('middle-2', 'Built reusable typed components while collaborating through sprint planning and code review.'),
          evidenceLine('middle-3', 'Implemented role-based access control for sensitive workflows and maintained data isolation.'),
        ], links: [] },
        { id: 'earlier', title: 'Associate Web Developer', employer: 'Example AI', startDate: '2022-08', endDate: '2022-10', lines: [
          evidenceLine('earlier-1', 'Resolved data-fetching race conditions and contributed to schema refactoring that improved query efficiency.'),
        ], links: [] },
      ],
    },
    {
      type: 'EDUCATION', heading: 'Education', items: [
        { id: 'masters', degree: 'MSc Computer Science', institution: 'Example University', startDate: '2024-09', endDate: '2025-10', lines: [], links: [] },
        { id: 'bachelors', degree: 'BSc Software Engineering', institution: 'Example Institute', startDate: '2019-09', endDate: '2023-07', lines: [], links: [] },
      ],
    },
    {
      type: 'SKILLS', heading: 'Skills', items: [
        { id: 'backend', category: 'Backend', skills: ['FastAPI', 'Java', 'Node.js', 'Python', 'REST APIs', 'WebSockets'].map((name) => ({ id: 'skill-' + name, name })) },
        { id: 'frontend', category: 'Frontend', skills: ['JavaScript', 'Next.js', 'React', 'Responsive UI', 'TypeScript'].map((name) => ({ id: 'skill-' + name, name })) },
        { id: 'data', category: 'Data & Architecture', skills: ['Event-driven systems', 'MongoDB', 'PostgreSQL', 'RabbitMQ', 'Redis'].map((name) => ({ id: 'skill-' + name, name })) },
        { id: 'additional', category: 'Additional Skills', skills: ['Cloud storage', 'Computer vision', 'External APIs', 'LLM integration', 'Role-based access', 'Vector search', 'Webhooks'].map((name) => ({ id: 'skill-' + name, name })) },
        { id: 'delivery', category: 'Testing & Delivery', skills: ['API testing', 'Azure', 'CI/CD', 'Cloudflare', 'Docker', 'Git', 'GitHub Actions', 'Playwright', 'Vercel', 'Vitest'].map((name) => ({ id: 'skill-' + name, name })) },
      ],
    },
    {
      type: 'PROJECTS', heading: 'Projects', items: [
        { id: 'scanner', name: 'Document Scanner', technologies: [], lines: [
          evidenceLine('scanner-1', 'Built a mobile-first scanning platform with on-device document detection and browser-based editing.'),
          evidenceLine('scanner-2', 'Engineered a computer-vision pipeline with geometric filtering and stable capture cadence.'),
        ], links: [{ id: 'scanner-link', label: 'Scanner repository', url: 'https://example.invalid/scanner', type: 'PROJECT_REPOSITORY' }] },
        { id: 'workflow', name: 'Realtime Workflow Engine', technologies: [], lines: [
          evidenceLine('workflow-1', 'Designed a modular platform using two-tier caching, cursor pagination and real-time WebSocket communication.'),
          evidenceLine('workflow-2', 'Implemented asynchronous processing for webhook-driven workflows and provider-agnostic storage.'),
        ], links: [{ id: 'workflow-link', label: 'Workflow repository', url: 'https://example.invalid/workflow', type: 'PROJECT_REPOSITORY' }] },
        { id: 'career', name: 'Career Platform', technologies: [], lines: [
          evidenceLine('career-1', 'Built a full-stack career platform with structured feedback, skills analysis and job-fit recommendations.'),
          evidenceLine('career-2', 'Integrated external APIs with authenticated database workflows, protected routes and caching.'),
        ], links: [{ id: 'career-link', label: 'Career repository', url: 'https://example.invalid/career', type: 'PROJECT_REPOSITORY' }] },
      ],
    },
  ];
  for (const section of spec.sections) {
    if (section.type !== 'EXPERIENCE' && section.type !== 'PROJECTS') continue;
    for (const item of section.items) {
      for (const line of item.lines) {
        line.text += ' The implementation was verified with repeatable tests and production-focused review.';
      }
    }
  }
  return spec;
}

if (process.env.npm_lifecycle_event === 'test:renderer' && !rendererIntegrationEnabled) {
  throw new Error('Set RUN_RENDERER_INTEGRATION=1 for the dedicated renderer job');
}

describe.skipIf(!rendererIntegrationEnabled)('real Gotenberg render matrix', () => {
  it.each(TEMPLATE_IDS)('%s renders the safe short sample as one A4 page', async (templateId) => {
    const result = await renderValidatedDocument({
      spec: createSafeTemplateSample(templateId, 'short'),
      traceId: `real_short_${templateId}`,
    });
    expect(result.pageCount).toBe(1);
    expect(result.preview.status).toBe('READY');
    const extracted = await extractText(Uint8Array.from(result.pdf), { mergePages: true });
    expect(extracted.text).toContain('Jordan Taylor');
    expect(extracted.text).toContain('Reduced service response time by 32%');
    expect(extracted.text.indexOf('Evidence-led product engineer')).toBeLessThan(
      extracted.text.indexOf('Reduced service response time by 32%'),
    );
  }, 180_000);

  it.each(TEMPLATE_IDS)('%s renders the safe medium sample as exactly two pages', async (templateId) => {
    const result = await renderValidatedDocument({
      spec: createSafeTemplateSample(templateId, 'medium'),
      traceId: `real_medium_${templateId}`,
    });
    expect(result.pageCount).toBe(2);
    expect(result.preview).toMatchObject({ status: 'READY' });
    if (result.preview.status === 'READY') {
      expect(result.preview.pages).toHaveLength(2);
      for (const png of result.preview.pages) {
        expect(png.readUInt32BE(16)).toBeLessThanOrEqual(1_200);
        expect(png.readUInt32BE(20) / png.readUInt32BE(16)).toBeCloseTo(842 / 595, 1);
      }
    }
  }, 180_000);

  it.each(TEMPLATE_IDS)('%s rejects an overflow sample without content loss', async (templateId) => {
    const spec = createSafeTemplateSample(templateId, 'overflow');
    const original = structuredClone(spec);
    await expect(renderValidatedDocument({
      spec,
      traceId: `real_overflow_${templateId}`,
    })).rejects.toMatchObject({ code: 'PAGE_LIMIT_EXCEEDED' });
    expect(spec).toEqual(original);
  }, 240_000);

  it('evaluates a short final page, preserves content, and keeps the bounded project entry intact', async () => {
    const spec = underfilledBoundarySample();
    const result = await renderValidatedDocument({ spec, traceId: 'real_underfilled_boundary' });
    const inspection = await inspectPdf(result.pdf);
    const extracted = await extractText(Uint8Array.from(result.pdf));
    expect(result.pageCount).toBe(2);
    expect(result.profile).toBe('preferred');
    expect(inspection.finalPageOccupancy).toBeLessThan(0.3);
    expect(extracted.text).toHaveLength(2);
    const pages = extracted.text as string[];
    expect(pages[0]).not.toContain('Realtime Workflow Engine');
    expect(pages[1]).toContain('Realtime Workflow Engine');
    expect(pages[1]).toContain('Designed a modular platform');
    expect(pages[1]).toContain('Implemented asynchronous processing');
    const fingerprint = (value: string) => value.normalize('NFKC').toLocaleLowerCase('en').replace(/[^\p{L}\p{N}]+/gu, '');
    const renderedFingerprint = fingerprint(pages.join('\n'));
    for (const text of spec.sections.flatMap((section) =>
      'lines' in section
        ? section.lines.map((line) => line.text)
        : section.items.flatMap((item) => 'lines' in item ? item.lines.map((line) => line.text) : []))) {
      expect(renderedFingerprint).toContain(fingerprint(text));
    }
  }, 240_000);
});

describe.skipIf(!rendererIntegrationEnabled || !localDatabaseEnabled)(
  'real renderer generation lock',
  () => {
    it('converts and records one artifact set for concurrent requests, then reuses READY', async () => {
      const { prisma } = await import('@/shared/lib/prisma');
      const { claimGeneration } = await import('@/shared/cv-generation/generation-lease');
      const suffix = randomUUID();
      const userId = `real_render_owner_${suffix}`;
      const generationId = `real_render_generation_${suffix}`;
      const generatedCvId = `real_render_cv_${suffix}`;
      let conversionCalls = 0;
      let storedArtifactSets = 0;

      await prisma.user.create({
        data: { id: userId, name: 'Renderer Lock Test', email: `${userId}@example.test` },
      });
      await prisma.cvGeneration.create({
        data: {
          id: generationId, userId, operationId: `operation_${suffix}`,
          sourceMode: 'CAREER_PROFILE', status: 'PLAN_APPROVED',
        },
      });

      const request = async () => {
        const claim = await claimGeneration({ userId, generationId, now: new Date() });
        if (claim.status !== 'claimed') return claim.status;
        const rendered = await renderValidatedDocument({
          spec: createSafeTemplateSample('architect', 'medium'),
          traceId: `real_lock_${suffix}`,
          dependencies: {
            convert: async (input) => {
              conversionCalls += 1;
              return convertDocxToPdf(input);
            },
          },
        });
        if (rendered.preview.status !== 'READY') throw new Error('Expected rendered pages');
        storedArtifactSets += 1;
        await prisma.$transaction([
          prisma.generatedCV.create({
            data: {
              id: generatedCvId, userId, cvGenerationId: generationId,
              template: 'architect', data: {},
              fileKey: `users/${userId}/${generatedCvId}/CV.docx`,
            },
          }),
          prisma.generatedCvPreview.create({
            data: {
              generatedCvId, userId, documentHash: rendered.documentHash,
              rendererVersion: 'real-integration', status: 'READY',
              pageCount: rendered.pageCount,
              pdfKey: `users/${userId}/${generatedCvId}/previews/${rendered.documentHash}/document.pdf`,
              pdfSize: rendered.pdf.length,
              pageImageKeys: rendered.preview.pages.map((_, index) =>
                `users/${userId}/${generatedCvId}/previews/${rendered.documentHash}/page-${index + 1}.png`),
              pageImageSizes: rendered.preview.pages.map((page) => page.length),
              attemptCount: 1,
            },
          }),
          prisma.cvGeneration.update({
            where: { id: generationId },
            data: {
              status: 'COMPLETED',
              generationLeaseToken: null, generationLeaseExpiresAt: null,
            },
          }),
        ]);
        return 'completed';
      };

      try {
        const concurrent = await Promise.all([request(), request()]);
        expect(concurrent.sort()).toEqual(['completed', 'in_progress']);
        expect(conversionCalls).toBe(1);
        expect(storedArtifactSets).toBe(1);
        expect(await request()).toBe('completed');
        expect(conversionCalls).toBe(1);
        expect(storedArtifactSets).toBe(1);
        expect(await prisma.generatedCvPreview.count({ where: { generatedCvId } })).toBe(1);
      } finally {
        await prisma.user.delete({ where: { id: userId } }).catch(() => {});
      }
    }, 180_000);
  },
);
