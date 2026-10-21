import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ session: vi.fn(), find: vi.fn(), download: vi.fn(), capability: vi.fn() }));
vi.mock('@/shared/lib/auth', () => ({ auth: { api: { getSession: mocks.session } } }));
vi.mock('@/shared/lib/prisma', () => ({ prisma: { generatedCvPreview: { findFirst: mocks.find } } }));
vi.mock('@/shared/lib/storage', () => ({ storage: { download: mocks.download } }));
vi.mock('@/shared/entitlements/server', () => ({ assertCapability: mocks.capability }));
import { GET } from '../route';
const request = () => new Request('https://align.test/api/cv/cv-1/pdf');
const context = { params: Promise.resolve({ id: 'cv-1' }) };
describe('verified PDF route', () => {
  beforeEach(() => {
    vi.clearAllMocks(); mocks.session.mockResolvedValue({ user: { id: 'u1' } });
    mocks.find.mockResolvedValue({ pageCount: 2, pdfKey: 'private-pdf', pdfSize: 10 });
    mocks.download.mockResolvedValue(Buffer.from('%PDF-valid'));
  });
  it('requires authentication and owner-scoped metadata', async () => {
    mocks.session.mockResolvedValue(null);
    expect((await GET(request(), context)).status).toBe(401);
    mocks.session.mockResolvedValue({ user: { id: 'u1' } }); mocks.find.mockResolvedValue(null);
    expect((await GET(request(), context)).status).toBe(404);
  });
  it('checks download capability and streams a private fixed-name PDF', async () => {
    const response = await GET(request(), context);
    expect(mocks.capability).toHaveBeenCalledWith('u1', 'download_generated_cv');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/pdf');
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(response.headers.get('content-disposition')).toBe('attachment; filename="CV.pdf"');
    expect(response.headers.get('content-disposition')).not.toContain('private-pdf');
  });
});
