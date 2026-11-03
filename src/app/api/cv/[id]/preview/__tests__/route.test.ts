import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ session: vi.fn(), find: vi.fn(), retry: vi.fn() }));
vi.mock('@/shared/lib/auth', () => ({ auth: { api: { getSession: mocks.session } } }));
vi.mock('@/shared/lib/prisma', () => ({ prisma: { generatedCvPreview: { findFirst: mocks.find } } }));
vi.mock('@/shared/document-preview/preview-service', () => ({ retryOwnedThumbnail: mocks.retry }));
import { GET, POST, maxDuration, runtime } from '../route';

const request = (method = 'GET') => new Request('https://align.test/api/cv/cv-1/preview', { method });
const context = { params: Promise.resolve({ id: 'cv-1' }) };
const preview = {
  status: 'READY', failureCode: null, pageCount: 2,
  pdfKey: 'users/u1/private/document.pdf', pageImageKeys: ['secret-1', 'secret-2'],
};

describe('CV preview metadata route', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.session.mockResolvedValue({ user: { id: 'u1' } }); mocks.find.mockResolvedValue(preview); });
  it('is Node-bound and requires authentication', async () => {
    expect(runtime).toBe('nodejs'); expect(maxDuration).toBe(60);
    mocks.session.mockResolvedValue(null);
    expect((await GET(request(), context)).status).toBe(401);
  });
  it('returns owner-scoped application URLs without storage keys or starting work', async () => {
    const response = await GET(request(), context);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      status: 'READY', failureCode: null, pageCount: 2,
      pages: ['/api/cv/cv-1/preview/pages/1', '/api/cv/cv-1/preview/pages/2'],
      pdfUrl: '/api/cv/cv-1/pdf', retryable: false,
    });
    expect(JSON.stringify(body)).not.toContain('secret');
    expect(mocks.retry).not.toHaveBeenCalled();
  });
  it('returns 404 for missing or cross-owner metadata', async () => {
    mocks.find.mockResolvedValue(null);
    expect((await GET(request(), context)).status).toBe(404);
  });
  it('returns 202 for rendering metadata without starting work', async () => {
    mocks.find.mockResolvedValue({ ...preview, status: 'RENDERING', pageImageKeys: [] });
    const response = await GET(request(), context);
    expect(response.status).toBe(202);
    expect(mocks.retry).not.toHaveBeenCalled();
  });
  it('POST explicitly retries and returns 202 while work is active', async () => {
    mocks.retry.mockResolvedValue({ status: 'in_progress' });
    const response = await POST(request('POST'), context);
    expect(response.status).toBe(202);
    expect(mocks.retry).toHaveBeenCalledWith({ userId: 'u1', generatedCvId: 'cv-1' });
  });
});
