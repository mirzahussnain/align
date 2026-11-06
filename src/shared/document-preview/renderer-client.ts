import 'server-only';
import {
  rendererConfig,
  RendererConfigurationError,
  type DocumentRendererConfig,
} from './renderer-config';
import { logDocumentPipelineEvent } from './diagnostics';

export const MAX_DOCX_BYTES = 10 * 1024 * 1024;

export interface RendererRetryBudget {
  take(): boolean;
  readonly remaining: number;
}

export function createRendererRetryBudget(maxRetries = 1): RendererRetryBudget {
  let remaining = Math.max(0, Math.floor(maxRetries));
  return {
    take() {
      if (remaining === 0) return false;
      remaining -= 1;
      return true;
    },
    get remaining() {
      return remaining;
    },
  };
}

export class DocumentConversionError extends Error {
  readonly code = 'DOCUMENT_CONVERSION_FAILED' as const;

  constructor(
    message: string,
    readonly retryable: boolean,
    readonly status?: number,
    readonly automaticRetry = false,
  ) {
    super(message);
    this.name = 'DocumentConversionError';
  }
}

export class RendererUnavailableError extends Error {
  readonly code = 'RENDERER_UNAVAILABLE' as const;
  readonly retryable = true;

  constructor(message = 'Document rendering is currently unavailable') {
    super(message);
    this.name = 'RendererUnavailableError';
  }
}

interface ConvertDocxInput {
  docx: Buffer;
  traceId: string;
  signal?: AbortSignal;
  retryBudget?: RendererRetryBudget;
  deadlineAt?: number;
}

const safeTraceId = /^[A-Za-z0-9_-]{1,64}$/u;

function authorization(config: DocumentRendererConfig) {
  return `Basic ${Buffer.from(`${config.username}:${config.password}`).toString('base64')}`;
}

export function rendererRequestHeaders(
  config: DocumentRendererConfig,
  additionalHeaders?: HeadersInit,
) {
  const headers = new Headers(additionalHeaders);
  headers.set('Authorization', authorization(config));
  if (config.cloudflareAccessClientId && config.cloudflareAccessClientSecret) {
    headers.set('CF-Access-Client-Id', config.cloudflareAccessClientId);
    headers.set('CF-Access-Client-Secret', config.cloudflareAccessClientSecret);
  }
  return headers;
}

export function rendererRequestInit(
  config: DocumentRendererConfig,
  init: RequestInit = {},
): RequestInit {
  return {
    ...init,
    redirect: 'error',
    headers: rendererRequestHeaders(config, init.headers),
  };
}

function requestSignal(
  timeoutMs: number,
  parentSignal?: AbortSignal,
): { signal: AbortSignal; dispose: () => void } {
  const controller = new AbortController();
  const abortFromParent = () => controller.abort(parentSignal?.reason);
  if (parentSignal?.aborted) abortFromParent();
  else parentSignal?.addEventListener('abort', abortFromParent, { once: true });
  const timer = setTimeout(
    () => controller.abort(new Error('Document renderer timed out')),
    timeoutMs,
  );
  return {
    signal: controller.signal,
    dispose() {
      clearTimeout(timer);
      parentSignal?.removeEventListener('abort', abortFromParent);
    },
  };
}

function retryableStatus(status: number) {
  return status === 502 || status === 503;
}

function retryOrThrow(
  error: DocumentConversionError,
  retryBudget: RendererRetryBudget,
  deadlineAt?: number,
) {
  if (
    error.automaticRetry &&
    retryBudget.take() &&
    (deadlineAt === undefined || Date.now() < deadlineAt)
  ) {
    return true;
  }
  throw error;
}

async function sendConversion(
  input: ConvertDocxInput,
  config: DocumentRendererConfig,
): Promise<Buffer> {
  const startedAt = Date.now();
  const logFailure = (category: string, upstreamStatus?: number) => {
    logDocumentPipelineEvent('document_pipeline_stage_failed', {
      traceId: input.traceId,
      stage: 'gotenberg_conversion',
      category,
      durationMs: Date.now() - startedAt,
      upstreamStatus,
    });
  };
  const remaining = input.deadlineAt === undefined
    ? config.timeoutMs
    : Math.min(config.timeoutMs, input.deadlineAt - Date.now());
  if (remaining <= 0) {
    logFailure('deadline_exceeded');
    throw new DocumentConversionError('Document-rendering deadline exceeded', true);
  }

  const form = new FormData();
  form.append(
    'files',
    new Blob([Uint8Array.from(input.docx).buffer], {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    }),
    'document.docx',
  );
  form.append('skipEmptyPages', 'false');
  const request = requestSignal(remaining, input.signal);
  let response: Response;
  try {
    response = await fetch(
      new URL('/forms/libreoffice/convert', config.baseUrl),
      rendererRequestInit(config, {
        method: 'POST',
        headers: {
          'Gotenberg-Trace': input.traceId,
        },
        body: form,
        signal: request.signal,
      }),
    );
  } catch (error) {
    if (request.signal.aborted) {
      logFailure('timeout_or_cancelled');
      throw new DocumentConversionError('Document renderer timed out or was cancelled', true);
    }
    if (error instanceof TypeError) {
      logFailure('network_error');
      throw new DocumentConversionError(
        'Document renderer network request failed',
        true,
        undefined,
        true,
      );
    }
    logFailure('request_error');
    throw new DocumentConversionError('Document renderer request failed', false);
  } finally {
    request.dispose();
  }

  if (!response.ok) {
    logFailure('upstream_http', response.status);
    throw new DocumentConversionError(
      `Document renderer returned HTTP ${response.status}`,
      retryableStatus(response.status),
      response.status,
      retryableStatus(response.status),
    );
  }
  const contentType = response.headers.get('content-type')?.split(';', 1)[0]?.trim();
  if (contentType !== 'application/pdf') {
    logFailure('unexpected_content_type', response.status);
    throw new DocumentConversionError('Document renderer returned a non-PDF response', false);
  }
  let pdf: Buffer;
  try {
    pdf = Buffer.from(await response.arrayBuffer());
  } catch {
    logFailure('response_read_error', response.status);
    throw new DocumentConversionError('Document renderer response could not be read', true);
  }
  if (pdf.length < 5 || pdf.subarray(0, 5).toString('ascii') !== '%PDF-') {
    logFailure('invalid_pdf_response', response.status);
    throw new DocumentConversionError('Document renderer returned invalid PDF bytes', false);
  }
  logDocumentPipelineEvent('document_pipeline_stage_completed', {
    traceId: input.traceId,
    stage: 'gotenberg_conversion',
    category: 'pdf_response',
    durationMs: Date.now() - startedAt,
    upstreamStatus: response.status,
  });
  return pdf;
}

export async function convertDocxToPdf(input: ConvertDocxInput): Promise<Buffer> {
  if (!safeTraceId.test(input.traceId)) {
    throw new DocumentConversionError('Document renderer trace ID is invalid', false);
  }
  if (input.docx.length > MAX_DOCX_BYTES) {
    throw new DocumentConversionError('DOCX exceeds the renderer input limit', false, 413);
  }

  const configurationStartedAt = Date.now();
  let config: DocumentRendererConfig;
  try {
    config = rendererConfig();
  } catch (error) {
    if (error instanceof RendererConfigurationError) {
      logDocumentPipelineEvent('document_pipeline_stage_failed', {
        traceId: input.traceId,
        stage: 'renderer_configuration',
        category: 'invalid_configuration',
        durationMs: Date.now() - configurationStartedAt,
      });
      throw new RendererUnavailableError();
    }
    throw error;
  }
  if (!config.enabled) {
    logDocumentPipelineEvent('document_pipeline_stage_failed', {
      traceId: input.traceId,
      stage: 'renderer_configuration',
      category: 'disabled',
      durationMs: Date.now() - configurationStartedAt,
    });
    throw new RendererUnavailableError();
  }

  const retryBudget = input.retryBudget ?? createRendererRetryBudget(1);
  for (;;) {
    try {
      return await sendConversion(input, config);
    } catch (error) {
      if (!(error instanceof DocumentConversionError)) throw error;
      retryOrThrow(error, retryBudget, input.deadlineAt);
    }
  }
}

export async function probeDocumentRenderer(): Promise<{
  healthy: boolean;
  rendererVersion: string;
}> {
  const config = rendererConfig();
  if (!config.enabled) return { healthy: false, rendererVersion: '' };
  try {
    const [health, version] = await Promise.all([
      fetch(new URL('/health', config.baseUrl), rendererRequestInit(config, {
        signal: AbortSignal.timeout(config.timeoutMs),
      })),
      fetch(new URL('/version', config.baseUrl), rendererRequestInit(config, {
        signal: AbortSignal.timeout(config.timeoutMs),
      })),
    ]);
    if (!health.ok || !version.ok) {
      return { healthy: false, rendererVersion: '' };
    }
    const rendererVersion = (await version.text()).trim();
    return {
      healthy: rendererVersion.includes(config.rendererVersion),
      rendererVersion,
    };
  } catch {
    return { healthy: false, rendererVersion: '' };
  }
}
