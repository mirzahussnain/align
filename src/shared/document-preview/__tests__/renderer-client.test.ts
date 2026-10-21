import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  createRendererRetryBudget,
  convertDocxToPdf,
  DocumentConversionError,
  MAX_DOCX_BYTES,
} from '../renderer-client';
import {
  RendererConfigurationError,
  rendererConfig,
} from '../renderer-config';

const originalEnvironment = { ...process.env };

function setEnabledRenderer(environment: 'development' | 'production' = 'development') {
  process.env = { ...process.env, NODE_ENV: environment };
  process.env.DOCUMENT_RENDERER_ENABLED = 'true';
  process.env.GOTENBERG_URL =
    environment === 'production' ? 'https://renderer.example.test' : 'http://127.0.0.1:3001';
  process.env.GOTENBERG_USERNAME = 'align-renderer';
  process.env.GOTENBERG_PASSWORD = 'a-high-entropy-test-secret';
  process.env.GOTENBERG_EXPECTED_VERSION = '8.38.1';
  process.env.GOTENBERG_IMAGE_DIGEST = 'sha256:' + 'a'.repeat(64);
}

function pdfResponse(body = '%PDF-1.7\nfixture') {
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'application/pdf' },
  });
}

beforeEach(() => {
  process.env = { ...originalEnvironment };
  setEnabledRenderer();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  process.env = { ...originalEnvironment };
});

describe('renderer configuration', () => {
  it('keeps rendering disabled unless the flag is explicitly true', () => {
    delete process.env.DOCUMENT_RENDERER_ENABLED;
    delete process.env.GOTENBERG_URL;
    const config = rendererConfig();
    expect(config.enabled).toBe(false);
  });

  it('requires complete authenticated configuration when production enables rendering', () => {
    setEnabledRenderer('production');
    delete process.env.GOTENBERG_PASSWORD;
    expect(() => rendererConfig()).toThrowError(
      expect.objectContaining({ code: 'RENDERER_UNAVAILABLE' }),
    );
  });

  it('rejects a non-HTTPS enabled production endpoint', () => {
    setEnabledRenderer('production');
    process.env.GOTENBERG_URL = 'http://renderer.example.test';
    expect(() => rendererConfig()).toThrow(RendererConfigurationError);
  });

  it('accepts authenticated loopback and private service URLs outside production', () => {
    expect(rendererConfig().baseUrl.toString()).toBe('http://127.0.0.1:3001/');
    process.env.GOTENBERG_URL = 'http://gotenberg:3000';
    expect(rendererConfig().baseUrl.hostname).toBe('gotenberg');
  });

  it('rejects renderer credentials in NEXT_PUBLIC variables', () => {
    process.env.NEXT_PUBLIC_GOTENBERG_PASSWORD = 'public-secret';
    expect(() => rendererConfig()).toThrowError(
      expect.objectContaining({ code: 'RENDERER_UNAVAILABLE' }),
    );
  });
});

describe('private Gotenberg client', () => {
  it('sends a bounded authenticated multipart request with a constant filename', async () => {
    const request = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      const body = init?.body as FormData;
      const file = body.get('files') as File;
      expect(file.name).toBe('document.docx');
      expect(body.get('skipEmptyPages')).toBe('false');
      expect(init?.redirect).toBe('error');
      expect(new Headers(init?.headers).get('authorization')).toBe(
        'Basic ' + Buffer.from('align-renderer:a-high-entropy-test-secret').toString('base64'),
      );
      expect(new Headers(init?.headers).get('gotenberg-trace')).toBe('generation_123');
      return pdfResponse();
    });
    vi.stubGlobal('fetch', request);

    const result = await convertDocxToPdf({
      docx: Buffer.from('docx'),
      traceId: 'generation_123',
    });

    expect(result.subarray(0, 5).toString()).toBe('%PDF-');
    expect(request).toHaveBeenCalledTimes(1);
    expect(String(request.mock.calls[0]?.[0])).toBe(
      'http://127.0.0.1:3001/forms/libreoffice/convert',
    );
  });

  it('rejects PII-shaped trace IDs before sending bytes', async () => {
    const request = vi.fn();
    vi.stubGlobal('fetch', request);
    await expect(
      convertDocxToPdf({
        docx: Buffer.from('docx'),
        traceId: 'alex@example.com',
      }),
    ).rejects.toMatchObject({ code: 'DOCUMENT_CONVERSION_FAILED', retryable: false });
    expect(request).not.toHaveBeenCalled();
  });

  it('rejects a DOCX over 10 MiB without making an API call', async () => {
    const request = vi.fn();
    vi.stubGlobal('fetch', request);
    await expect(
      convertDocxToPdf({
        docx: Buffer.alloc(MAX_DOCX_BYTES + 1),
        traceId: 'generation_oversize',
      }),
    ).rejects.toMatchObject({ status: 413, retryable: false });
    expect(request).not.toHaveBeenCalled();
  });

  it('aborts one conversion at 50 seconds and does not retry the timeout', async () => {
    vi.useFakeTimers();
    const request = vi.fn(
      async (_url: string | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
        }),
    );
    vi.stubGlobal('fetch', request);

    const conversion = convertDocxToPdf({
      docx: Buffer.from('docx'),
      traceId: 'generation_timeout',
    });
    const rejection = expect(conversion).rejects.toMatchObject({
      code: 'DOCUMENT_CONVERSION_FAILED',
      retryable: true,
    });
    await vi.advanceTimersByTimeAsync(50_000);

    await rejection;
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('shares one retry across calls and retries only network, 502, or 503 failures', async () => {
    const request = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('socket closed'))
      .mockResolvedValueOnce(pdfResponse())
      .mockResolvedValueOnce(new Response('busy', { status: 503 }))
      .mockResolvedValueOnce(pdfResponse());
    vi.stubGlobal('fetch', request);
    const retryBudget = createRendererRetryBudget(1);

    await expect(
      convertDocxToPdf({
        docx: Buffer.from('first'),
        traceId: 'generation_first',
        retryBudget,
      }),
    ).resolves.toBeInstanceOf(Buffer);
    await expect(
      convertDocxToPdf({
        docx: Buffer.from('second'),
        traceId: 'generation_second',
        retryBudget,
      }),
    ).rejects.toMatchObject({ status: 503, retryable: true });
    expect(request).toHaveBeenCalledTimes(3);
  });

  it.each([400, 413, 500])('does not retry deterministic HTTP %s', async (status) => {
    const request = vi.fn().mockResolvedValue(new Response('private renderer detail', { status }));
    const logger = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', request);

    await expect(
      convertDocxToPdf({
        docx: Buffer.from('docx'),
        traceId: `generation_http_${status}`,
        retryBudget: createRendererRetryBudget(1),
      }),
    ).rejects.toBeInstanceOf(DocumentConversionError);
    expect(request).toHaveBeenCalledTimes(1);
    expect(logger).not.toHaveBeenCalled();
  });

  it('rejects invalid PDF responses without retrying or exposing the body', async () => {
    const request = vi.fn().mockResolvedValue(
      new Response('secret document text', {
        status: 200,
        headers: { 'content-type': 'text/plain' },
      }),
    );
    vi.stubGlobal('fetch', request);

    await expect(
      convertDocxToPdf({
        docx: Buffer.from('docx'),
        traceId: 'generation_invalid_pdf',
        retryBudget: createRendererRetryBudget(1),
      }),
    ).rejects.toMatchObject({
      code: 'DOCUMENT_CONVERSION_FAILED',
      retryable: false,
      message: expect.not.stringContaining('secret document text'),
    });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('honours an exhausted workflow deadline before making a request', async () => {
    const request = vi.fn();
    vi.stubGlobal('fetch', request);
    await expect(
      convertDocxToPdf({
        docx: Buffer.from('docx'),
        traceId: 'generation_deadline',
        deadlineAt: Date.now() - 1,
      }),
    ).rejects.toMatchObject({ retryable: true });
    expect(request).not.toHaveBeenCalled();
  });
});
