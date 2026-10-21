import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { extractText } from 'unpdf';
import { TEMPLATE_IDS } from '@/shared/constants/templates';
import { renderValidatedDocument } from '../validated-document';
import { createSafeTemplateSample } from '../template-sample';
import { convertDocxToPdf } from '../renderer-client';

const rendererIntegrationEnabled = process.env.RUN_RENDERER_INTEGRATION === '1';
const databaseUrl = process.env.DATABASE_URL ?? '';
const localDatabaseEnabled = /@(localhost|127\.0\.0\.1|host\.docker\.internal)[:/]/u.test(databaseUrl);

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
