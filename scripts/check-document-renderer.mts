import { readFile } from 'node:fs/promises';
import { config as loadEnv } from 'dotenv';
import { extractText, getDocumentProxy } from 'unpdf';
import { TEMPLATE_IDS, CV_TEMPLATE_DEFINITIONS } from '@/shared/constants/templates';
import { createSafeTemplateSample } from '@/shared/document-preview/template-sample';
import { inspectPdf } from '@/shared/document-preview/pdf-preview';
import {
  convertDocxToPdf,
  createRendererRetryBudget,
  rendererRequestHeaders,
} from '@/shared/document-preview/renderer-client';
import {
  DOCUMENT_RENDERER_VERSION,
  rendererConfig,
} from '@/shared/document-preview/renderer-config';
import { generateV2Template } from '@/shared/templates/v2';

loadEnv({ path: '.env.local', override: false, quiet: true });
loadEnv({ path: '.env', override: false, quiet: true });

const TESTED_BASE_DIGEST = 'sha256:2098722190575dbd975d8abf02e4ce83ffe20783114c5cc56f1b2ac309e6a083';
const EXPECTED_FONTS = {
  architect: 'Arial',
  editorial_refined: 'Georgia',
  technical_precision: 'Trebuchet MS',
  academic_latex: 'Times New Roman',
} as const;
const expectedFonts = new Map(TEMPLATE_IDS.map((id) => {
  const expected = EXPECTED_FONTS[id];
  if (CV_TEMPLATE_DEFINITIONS[id].font !== expected) {
    throw new Error(`${id} font metadata changed from the renderer contract`);
  }
  return [id, expected] as const;
}));
const renderer = rendererConfig();
if (!renderer.enabled) throw new Error('DOCUMENT_RENDERER_ENABLED must be true for the renderer smoke check');

const dockerfile = await readFile('docker/gotenberg/Dockerfile', 'utf8');
if (!dockerfile.includes(TESTED_BASE_DIGEST)) throw new Error('Dockerfile does not pin the real-render-tested base digest');
if (renderer.imageDigest && renderer.imageDigest !== TESTED_BASE_DIGEST) {
  throw new Error('Configured renderer digest does not match the real-render-tested base digest');
}

const endpoint = (path: string) => new URL(path, `${renderer.baseUrl.toString().replace(/\/$/u, '')}/`);
// Gotenberg deliberately leaves /health available for infrastructure probes;
// verify that an application/API route is protected instead.
const accessOnlyHeaders = rendererRequestHeaders(renderer);
accessOnlyHeaders.delete('Authorization');
const unauthenticated = await fetch(endpoint('version'), {
  headers: accessOnlyHeaders,
  redirect: 'error',
  signal: AbortSignal.timeout(10_000),
});
if (unauthenticated.status !== 401) throw new Error('Renderer unauthenticated API access was not denied');

const authenticatedHeaders = rendererRequestHeaders(renderer);
const [healthResponse, versionResponse] = await Promise.all([
  fetch(endpoint('health'), { headers: authenticatedHeaders, signal: AbortSignal.timeout(10_000) }),
  fetch(endpoint('version'), { headers: authenticatedHeaders, signal: AbortSignal.timeout(10_000) }),
]);
if (!healthResponse.ok) throw new Error(`Authenticated renderer health returned ${healthResponse.status}`);
const health = await healthResponse.json() as { status?: string; details?: { libreoffice?: { status?: string } } };
if (health.status !== 'up' || health.details?.libreoffice?.status !== 'up') {
  throw new Error('Renderer or LibreOffice health is not up');
}
if (!versionResponse.ok) throw new Error(`Renderer version returned ${versionResponse.status}`);
const version = (await versionResponse.text()).trim();
if (version !== DOCUMENT_RENDERER_VERSION || version !== renderer.rendererVersion) {
  throw new Error(`Renderer version mismatch: expected ${DOCUMENT_RENDERER_VERSION}`);
}

const verifiedFonts: string[] = [];
for (const templateId of TEMPLATE_IDS) {
  const font = expectedFonts.get(templateId)!;
  const docx = await generateV2Template(createSafeTemplateSample(templateId, 'short'));
  const pdf = await convertDocxToPdf({
    docx,
    traceId: `renderer_smoke_${templateId}`,
    retryBudget: createRendererRetryBudget(0),
    deadlineAt: Date.now() + 45_000,
  });
  const { pageCount } = await inspectPdf(pdf);
  if (pageCount !== 1) throw new Error(`${templateId} smoke document rendered to ${pageCount} pages`);
  const extracted = await extractText(Uint8Array.from(pdf), { mergePages: true });
  if (!extracted.text.includes('Jordan Taylor')) throw new Error(`${templateId} smoke document text was not preserved`);
  const proxy = await getDocumentProxy(Uint8Array.from(pdf), { useSystemFonts: true });
  const page = await proxy.getPage(1);
  const content = await page.getTextContent();
  await page.getOperatorList();
  const commonObjects = page.commonObjs as unknown as { get(id: string): Record<string, unknown> };
  const fontNames = [...new Set(content.items.flatMap((item) => 'fontName' in item ? [item.fontName] : []))];
  const embeddedFonts = fontNames.map((name) => commonObjects.get(name));
  const resolvedNames = embeddedFonts.flatMap((embedded) =>
    ['name', 'loadedName', 'fallbackName'].flatMap((property) =>
      typeof embedded[property] === 'string' ? [embedded[property].toLowerCase()] : []));
  await proxy.cleanup();
  if (!resolvedNames.some((name) => name.includes(font.toLowerCase().replaceAll(' ', '')) || name.includes(font.toLowerCase()))) {
    const observed = [...new Set(resolvedNames)].join(', ');
    throw new Error(`${templateId} did not resolve the required ${font} font (observed: ${observed})`);
  }
  verifiedFonts.push(font);
}

console.log(`Renderer smoke passed: protected, healthy, version ${version}, digest ${TESTED_BASE_DIGEST}, fonts ${verifiedFonts.join(', ')}, four synthetic one-page conversions.`);
