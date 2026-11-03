import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ session: vi.fn(), find: vi.fn(), download: vi.fn() }));
vi.mock('@/shared/lib/auth', () => ({ auth: { api: { getSession: mocks.session } } }));
vi.mock('@/shared/lib/prisma', () => ({ prisma: { generatedCvPreview: { findFirst: mocks.find } } }));
vi.mock('@/shared/lib/storage', () => ({ storage: { download: mocks.download } }));
import { GET } from '../route';

const request = () => new Request('https://align.test/api/cv/cv-1/preview/pages/1');
const context = (page: string) => ({ params: Promise.resolve({ id: 'cv-1', page }) });
describe('private preview page route', () => {
  beforeEach(() => {
    vi.clearAllMocks(); mocks.session.mockResolvedValue({ user: { id: 'u1' } });
    mocks.find.mockResolvedValue({ status: 'READY', pageCount: 1, pageImageKeys: ['private-key'] });
    mocks.download.mockResolvedValue(Buffer.from('png'));
  });
  it('streams a bounded private PNG without revealing its key', async () => {
    const response = await GET(request(), context('1'));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(response.headers.get('content-disposition')).toContain('cv-preview-page-1.png');
    expect(response.headers.get('content-disposition')).not.toContain('private-key');
  });
  it.each(['0', '2', 'x'])('rejects invalid or unavailable page %s', async (page) => {
    expect((await GET(request(), context(page))).status).toBe(404);
  });
  it('returns 401 before storage access', async () => {
    mocks.session.mockResolvedValue(null);
    expect((await GET(request(), context('1'))).status).toBe(401);
    expect(mocks.download).not.toHaveBeenCalled();
  });
});
