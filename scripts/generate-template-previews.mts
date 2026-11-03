import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { CV_TEMPLATE_DEFINITIONS, TEMPLATE_IDS } from '@/shared/constants/templates';
import { createSafeTemplateSample } from '@/shared/document-preview/template-sample';
import {
  DOCUMENT_RENDER_CONTRACT_VERSION,
  renderValidatedDocument,
} from '@/shared/document-preview/validated-document';

const OUTPUT_DIRECTORY = path.resolve('public/template-previews/v1');
const FORBIDDEN_FIXTURE_MARKERS = ['@gmail.', '@outlook.', 'hussnain', 'amina'];

function assertSafeFixture(value: unknown) {
  const serialized = JSON.stringify(value).toLowerCase();
  for (const marker of FORBIDDEN_FIXTURE_MARKERS) {
    if (serialized.includes(marker)) {
      throw new Error(`Template preview fixture contains forbidden marker: ${marker}`);
    }
  }
}

await mkdir(OUTPUT_DIRECTORY, { recursive: true });
const templates: Record<string, unknown> = {};

for (const templateId of TEMPLATE_IDS) {
  const sample = createSafeTemplateSample(templateId, 'medium');
  assertSafeFixture(sample);
  const rendered = await renderValidatedDocument({
    spec: sample,
    traceId: `template_preview_${templateId}`,
  });
  if (rendered.preview.status !== 'READY') {
    throw new Error(`Thumbnail generation failed for ${templateId}`);
  }
  const firstPage = rendered.preview.pages[0];
  const filename = `${templateId}-page-1.png`;
  await writeFile(path.join(OUTPUT_DIRECTORY, filename), firstPage);
  templates[templateId] = {
    file: `/template-previews/v1/${filename}`,
    width: firstPage.readUInt32BE(16),
    height: firstPage.readUInt32BE(20),
    pageCount: rendered.pageCount,
    layoutProfile: rendered.profile,
    templateVersion: CV_TEMPLATE_DEFINITIONS[templateId].version,
    rendererContractVersion: DOCUMENT_RENDER_CONTRACT_VERSION,
    sha256: createHash('sha256').update(firstPage).digest('hex'),
  };
}

await writeFile(
  path.join(OUTPUT_DIRECTORY, 'manifest.json'),
  `${JSON.stringify({ version: 1, sample: 'safe-medium-v1', templates }, null, 2)}\n`,
);
console.log(`Generated ${TEMPLATE_IDS.length} verified template previews in ${OUTPUT_DIRECTORY}`);
