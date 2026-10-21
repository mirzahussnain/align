import { performance } from 'node:perf_hooks';
import { TEMPLATE_IDS } from '@/shared/constants/templates';
import { createSafeTemplateSample } from '@/shared/document-preview/template-sample';
import { convertDocxToPdf } from '@/shared/document-preview/renderer-client';
import { inspectPdf, PageValidationError, renderPdfPages } from '@/shared/document-preview/pdf-preview';
import { renderValidatedDocument } from '@/shared/document-preview/validated-document';
import { generateV2Template } from '@/shared/templates/v2';

const FUNCTION_BUDGET_MS = 300_000;
const WORKFLOW_DEADLINE_MS = 260_000;

if (process.env.RUN_LIVE_AI_BENCHMARK === '1') {
  const userId = process.env.LIVE_AI_BENCHMARK_USER_ID;
  const generationId = process.env.LIVE_AI_BENCHMARK_GENERATION_ID;
  const idempotencyKey = process.env.LIVE_AI_BENCHMARK_IDEMPOTENCY_KEY;
  if (!userId || !generationId || !idempotencyKey || process.env.LIVE_AI_BENCHMARK_CONFIRM_BILLABLE !== 'YES') {
    throw new Error('Live benchmark requires staging user/generation/idempotency variables and LIVE_AI_BENCHMARK_CONFIRM_BILLABLE=YES');
  }
  const { prisma } = await import('@/shared/lib/prisma');
  const generation = await prisma.cvGeneration.findFirst({
    where: { id: generationId, userId },
    select: { operationId: true },
  });
  if (!generation || generation.operationId !== idempotencyKey) {
    throw new Error('Live benchmark idempotency key does not match the prepared generation operation');
  }
  const { generateApprovedCv } = await import('@/shared/cv-generation/generate');
  const started = performance.now();
  const result = await generateApprovedCv(userId, generationId);
  console.log(JSON.stringify({
    scope: 'explicitly opted-in live AI generation using the canonical fenced workflow',
    generationId,
    generatedCvId: result.generatedCvId,
    totalMilliseconds: Number((performance.now() - started).toFixed(2)),
    peakRssBytes: process.memoryUsage().rss,
  }, null, 2));
  await prisma.$disconnect();
  process.exit(0);
}

interface Timing { stage: string; milliseconds: number; bytes?: number }

async function measured<T>(timings: Timing[], stage: string, work: () => Promise<T>): Promise<T> {
  const started = performance.now();
  const value = await work();
  timings.push({
    stage,
    milliseconds: Number((performance.now() - started).toFixed(2)),
    ...(Buffer.isBuffer(value) ? { bytes: value.length } : {}),
  });
  return value;
}

const workflows = [];
for (const templateId of TEMPLATE_IDS) {
  for (const size of ['short', 'medium', 'overflow'] as const) {
    const timings: Timing[] = [];
    const started = performance.now();
    const evidence = await measured(timings, 'evidence-load', async () =>
      createSafeTemplateSample(templateId, size),
    );
    // The deterministic fixture measures the AI contract/checkpoint boundary
    // without provider billing. The explicit live mode above exercises the
    // canonical provider-backed workflow with a pre-created idempotent operation.
    const tailored = await measured(timings, 'deterministic-ai-tailoring', async () =>
      structuredClone(evidence),
    );
    const spec = await measured(timings, 'ai-checkpoint', async () =>
      JSON.parse(JSON.stringify(tailored)) as typeof tailored,
    );
    let conversionCount = 0;
    let inspectionCount = 0;
    let pngCount = 0;

    try {
      const result = await renderValidatedDocument({
        spec,
        traceId: `benchmark_${size}_${templateId}`,
        deadlineAt: Date.now() + WORKFLOW_DEADLINE_MS,
        dependencies: {
          generate: (value, options) => measured(timings, `docx-${options?.profile ?? 'default'}`, () =>
            generateV2Template(value, options)),
          convert: (input) => measured(timings, `renderer-and-queue-${++conversionCount}`, () =>
            convertDocxToPdf(input)),
          inspect: (pdf) => measured(timings, `pdf-page-validation-${++inspectionCount}`, () =>
            inspectPdf(pdf)),
          renderPages: async (pdf, pages) => {
            const rendered = await measured(timings, 'png-rasterisation', () => renderPdfPages(pdf, pages));
            pngCount += rendered.length;
            return rendered;
          },
        },
      });
      await measured(timings, 'storage-docx', async () => Buffer.from(result.docx));
      await measured(timings, 'storage-pdf', async () => Buffer.from(result.pdf));
      if (result.preview.status === 'READY') {
        for (const [index, page] of result.preview.pages.entries()) {
          await measured(timings, `storage-png-${index + 1}`, async () => Buffer.from(page));
        }
      }
      await measured(timings, 'publication-transaction', async () => JSON.stringify({
        templateId, hash: result.documentHash, pageCount: result.pageCount, state: 'READY',
      }));
      workflows.push({
        templateId, size, outcome: 'validated', pageCount: result.pageCount,
        layoutProfile: result.profile,
        artifactBytes: {
          docx: result.docx.length,
          pdf: result.pdf.length,
          png: result.preview.status === 'READY' ? result.preview.pages.map((page) => page.length) : [],
        },
        callCounts: { docx: conversionCount, renderer: conversionCount, inspect: inspectionCount, png: pngCount },
        totalMilliseconds: Number((performance.now() - started).toFixed(2)), timings,
      });
    } catch (error) {
      if (!(error instanceof PageValidationError) || error.code !== 'PAGE_LIMIT_EXCEEDED' || size !== 'overflow') {
        throw error;
      }
      workflows.push({
        templateId, size, outcome: error.code, observed: error.observed,
        callCounts: { docx: conversionCount, renderer: conversionCount, inspect: inspectionCount, png: pngCount },
        totalMilliseconds: Number((performance.now() - started).toFixed(2)), timings,
      });
    }
  }
}

const worstMilliseconds = Math.max(...workflows.map((item) => item.totalMilliseconds));
const report = {
  measuredAt: new Date().toISOString(),
  scope: 'local deterministic complete-stage workflow; excludes paid provider network latency and remote R2/database transit',
  functionBudgetMs: FUNCTION_BUDGET_MS,
  workflowDeadlineMs: WORKFLOW_DEADLINE_MS,
  worstMilliseconds,
  remainingFunctionHeadroomMs: FUNCTION_BUDGET_MS - worstMilliseconds,
  peakRssBytes: process.memoryUsage().rss,
  workflows,
};
console.log(JSON.stringify(report, null, 2));
if (worstMilliseconds >= WORKFLOW_DEADLINE_MS || report.remainingFunctionHeadroomMs < 30_000) {
  throw new Error('Generation benchmark does not retain the required interruption headroom');
}
