import 'server-only';
import { createHash } from 'node:crypto';
import type { CvBuildSpecV2 } from '@/shared/cv-generation/build-spec-types';
import { CV_TEMPLATE_DEFINITIONS } from '@/shared/constants/templates';
import {
  CV_LAYOUT_PROFILES,
  type CvLayoutProfile,
  type CvTemplateRenderOptions,
} from '@/shared/templates/layout';
import { generateV2Template } from '@/shared/templates/v2';
import {
  convertDocxToPdf,
  type RendererRetryBudget,
} from './renderer-client';
import { DOCUMENT_RENDERER_VERSION } from './renderer-config';
import {
  inspectPdf,
  PageValidationError,
  renderPdfPages,
  type ObservedPageCount,
  type PdfInspection,
} from './pdf-preview';

export const UNDERFILLED_FINAL_PAGE_THRESHOLD = 0.3;

export const DOCUMENT_RENDER_CONTRACT_VERSION =
  `gotenberg-${DOCUMENT_RENDERER_VERSION}-libreoffice-v1`;

export interface RenderDependencies {
  generate?: (
    spec: CvBuildSpecV2,
    options?: CvTemplateRenderOptions,
  ) => Promise<Buffer>;
  convert?: (input: {
    docx: Buffer;
    traceId: string;
    signal?: AbortSignal;
    retryBudget?: RendererRetryBudget;
    deadlineAt?: number;
  }) => Promise<Buffer>;
  inspect?: (pdf: Buffer) => Promise<PdfInspection>;
  renderPages?: (pdf: Buffer, pageCount: 1 | 2) => Promise<Buffer[]>;
  rendererContractVersion?: string;
}

interface RenderValidatedDocumentInput {
  spec: CvBuildSpecV2;
  traceId: string;
  signal?: AbortSignal;
  retryBudget?: RendererRetryBudget;
  deadlineAt?: number;
  dependencies?: RenderDependencies;
}

export interface ValidatedDocument {
  docx: Buffer;
  pdf: Buffer;
  pageCount: 1 | 2;
  profile: CvLayoutProfile;
  documentHash: string;
  preview:
    | { status: 'READY'; pages: Buffer[] }
    | { status: 'FAILED'; failureCode: 'THUMBNAIL_RENDER_FAILED' };
}

function documentHash(
  docx: Buffer,
  rendererContractVersion: string,
  templateVersion: string,
) {
  return createHash('sha256')
    .update(docx)
    .update('\0renderer:')
    .update(rendererContractVersion)
    .update('\0template:')
    .update(templateVersion)
    .digest('hex');
}

function acceptedPageCount(pageCount: number): pageCount is 1 | 2 {
  return pageCount === 1 || pageCount === 2;
}

export async function renderValidatedDocument(
  input: RenderValidatedDocumentInput,
): Promise<ValidatedDocument> {
  const generate = input.dependencies?.generate ?? generateV2Template;
  const convert = input.dependencies?.convert ?? convertDocxToPdf;
  const inspect = input.dependencies?.inspect ?? inspectPdf;
  const renderPages = input.dependencies?.renderPages ?? renderPdfPages;
  const rendererContractVersion =
    input.dependencies?.rendererContractVersion ?? DOCUMENT_RENDER_CONTRACT_VERSION;
  const observed: ObservedPageCount[] = [];
  const twoPageCandidates: Array<{ docx: Buffer; pdf: Buffer; profile: CvLayoutProfile }> = [];
  let accepted: { docx: Buffer; pdf: Buffer; profile: CvLayoutProfile; pageCount: 1 | 2 } | undefined;
  let seekingOnePage = false;

  for (const profile of CV_LAYOUT_PROFILES) {
    const docx = await generate(input.spec, { profile });
    const pdf = await convert({
      docx,
      traceId: input.traceId,
      signal: input.signal,
      retryBudget: input.retryBudget,
      deadlineAt: input.deadlineAt,
    });
    const { pageCount, finalPageOccupancy } = await inspect(pdf);
    if (!Number.isSafeInteger(pageCount) || pageCount < 1) {
      throw new PageValidationError('PAGE_VALIDATION_UNAVAILABLE', observed);
    }
    observed.push({ profile, pageCount });
    if (!acceptedPageCount(pageCount)) continue;
    if (pageCount === 1) {
      accepted = { docx, pdf, profile, pageCount };
      break;
    }
    twoPageCandidates.push({ docx, pdf, profile });
    if (finalPageOccupancy < UNDERFILLED_FINAL_PAGE_THRESHOLD) {
      seekingOnePage = true;
      continue;
    }
    if (!seekingOnePage) {
      accepted = { docx, pdf, profile, pageCount };
      break;
    }
  }

  accepted ??= twoPageCandidates[0]
    ? { ...twoPageCandidates[0], pageCount: 2 }
    : undefined;
  if (accepted) {
    const hash = documentHash(
      accepted.docx,
      rendererContractVersion,
      CV_TEMPLATE_DEFINITIONS[input.spec.presentation.templateId].version,
    );
    try {
      const pages = await renderPages(accepted.pdf, accepted.pageCount);
      if (pages.length !== accepted.pageCount) {
        throw new Error('Thumbnail page count mismatch');
      }
      return {
        docx: accepted.docx,
        pdf: accepted.pdf,
        pageCount: accepted.pageCount,
        profile: accepted.profile,
        documentHash: hash,
        preview: { status: 'READY', pages },
      };
    } catch {
      return {
        docx: accepted.docx,
        pdf: accepted.pdf,
        pageCount: accepted.pageCount,
        profile: accepted.profile,
        documentHash: hash,
        preview: {
          status: 'FAILED',
          failureCode: 'THUMBNAIL_RENDER_FAILED',
        },
      };
    }
  }

  throw new PageValidationError('PAGE_LIMIT_EXCEEDED', observed);
}

export { PageValidationError };
