import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), generate: vi.fn() }));
vi.mock('@/shared/lib/auth', () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock('@/shared/cv-generation/generate', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/cv-generation/generate')>()),
  generateApprovedCv: mocks.generate,
}));

import { GenerationPageValidationError } from '@/shared/cv-generation/generate';
import { maxDuration, POST, runtime } from '../route';

function request() {
  return new Request('https://align.test/api/cv-generations/generation-1/generate', { method: 'POST' });
}

describe('POST /api/cv-generations/[id]/generate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: 'user-1' } });
  });

  it('uses the bounded Node function configuration and returns only validated DOCX bytes', async () => {
    expect(runtime).toBe('nodejs');
    expect(maxDuration).toBe(300);
    mocks.generate.mockResolvedValue({ generatedCvId: 'cv-1', bytes: Buffer.from('docx'), recovered: false });
    const response = await POST(request(), { params: Promise.resolve({ id: 'generation-1' }) });
    expect(response.status).toBe(200);
    expect(response.headers.get('X-Generated-CV-Id')).toBe('cv-1');
    expect(Buffer.from(await response.arrayBuffer()).toString()).toBe('docx');
  });

  it.each([
    ['RENDERER_UNAVAILABLE', 503, true],
    ['DOCUMENT_CONVERSION_FAILED', 502, true],
    ['PAGE_VALIDATION_UNAVAILABLE', 502, true],
    ['PAGE_LIMIT_EXCEEDED', 422, false],
  ] as const)('maps %s to a distinct safe response', async (code, status, retryable) => {
    mocks.generate.mockRejectedValue(new GenerationPageValidationError(code));
    const response = await POST(request(), { params: Promise.resolve({ id: 'generation-1' }) });
    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toMatchObject({
      error: { code, retryable },
    });
  });
});
