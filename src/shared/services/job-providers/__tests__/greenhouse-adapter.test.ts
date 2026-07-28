import { describe, expect, it } from 'vitest';
import { createGreenhouseAdapter } from '@/shared/services/job-providers/greenhouse-adapter';

const source = { id: 'source-1', companyRecordId: 'company-1', provider: 'GREENHOUSE' as const, providerIdentifier: 'acme', enabled: true, verificationStatus: 'VERIFIED' as const, companyRecord: { id: 'company-1', displayName: 'Acme Holdings' } };
const response = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

describe('Greenhouse employer adapter', () => {
  it('normalises a complete board, sanitises HTML, and retains direct provenance', async () => {
    const adapter = createGreenhouseAdapter({ fetch: async () => response(200, { jobs: [{ id: 12, title: 'Platform Engineer', updated_at: '2026-07-28T10:00:00Z', absolute_url: 'https://boards.greenhouse.io/acme/jobs/12', location: { name: 'Hybrid - London, UK' }, content: '<p>Build systems.</p><ul><li>Own reliability</li></ul><script>alert(1)</script>', departments: [{ name: 'Engineering' }], offices: [{ name: 'London' }] }] }) });
    const result = await adapter.fetchBoard(source);
    expect(result).toMatchObject({ rawReceived: 1, invalidUrls: 0, jobs: [{ source: 'GREENHOUSE', sourceJobId: '12', employerSourceId: 'source-1', companyRecordId: 'company-1', departments: ['Engineering'], offices: ['London'] }] });
    expect(result.jobs[0].description).toContain('• Own reliability');
    expect(result.jobs[0].description).not.toContain('alert');
  });
  it('accepts a valid empty board and rejects unsafe URLs', async () => {
    const empty = createGreenhouseAdapter({ fetch: async () => response(200, { jobs: [] }) });
    await expect(empty.fetchBoard(source)).resolves.toMatchObject({ jobs: [], rawReceived: 0 });
    const unsafe = createGreenhouseAdapter({ fetch: async () => response(200, { jobs: [{ id: 1, title: 'Nope', absolute_url: 'https://169.254.169.254/job' }] }) });
    await expect(unsafe.fetchBoard(source)).resolves.toMatchObject({ jobs: [], invalidUrls: 1 });
  });
  it('refuses disabled and unverified sources, malformed responses, and timeouts', async () => {
    const adapter = createGreenhouseAdapter({ fetch: async () => response(200, { nope: [] }) });
    await expect(adapter.fetchBoard({ ...source, enabled: false })).rejects.toThrow('verified and enabled');
    await expect(adapter.fetchBoard({ ...source, verificationStatus: 'PENDING' })).rejects.toThrow('verified and enabled');
    await expect(adapter.fetchBoard(source)).rejects.toThrow('GREENHOUSE_MALFORMED_RESPONSE');
    const timeout = createGreenhouseAdapter({ timeoutMs: 1, fetch: async (_url, init) => new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))) });
    await expect(timeout.fetchBoard(source)).rejects.toThrow('GREENHOUSE_TIMEOUT');
  });
});