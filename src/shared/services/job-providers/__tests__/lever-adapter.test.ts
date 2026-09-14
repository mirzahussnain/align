import { describe, expect, it } from 'vitest';
import { createLeverAdapter } from '@/shared/services/job-providers/lever-adapter';

const source = { id: 'source-1', companyRecordId: 'company-1', provider: 'LEVER' as const, providerIdentifier: 'acme', leverRegion: 'GLOBAL' as const, enabled: true, verificationStatus: 'VERIFIED' as const, companyRecord: { id: 'company-1', displayName: 'Acme Holdings', websiteUrl: 'https://acme.example', careersUrl: 'https://careers.acme.example' } };
const response = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;
const posting = { id: 'one', text: 'Platform Engineer', hostedUrl: 'https://jobs.lever.co/acme/one', applyUrl: 'https://jobs.lever.co/acme/one/apply', workplaceType: 'hybrid', categories: { location: 'London, United Kingdom', team: 'Engineering', department: 'Platform', commitment: 'Full-time' }, description: '<p>Build systems.</p><ul><li>Own reliability</li></ul><script>alert(1)</script>', updatedAt: 1785520800000 };

describe('Lever employer adapter', () => {
  it('normalises a global board, sanitises HTML, keeps hosted/application URLs and workplace type', async () => {
    const adapter = createLeverAdapter({ fetch: async () => response(200, [posting]) });
    const result = await adapter.fetchBoard(source);
    expect(result).toMatchObject({ rawReceived: 1, invalidUrls: 0, jobs: [{ source: 'LEVER', sourceJobId: 'one', remoteType: 'HYBRID', departments: ['Platform', 'Engineering'], employerSourceId: 'source-1', companyRecordId: 'company-1' }] });
    expect(result.jobs[0].providerReferences[0]).toMatchObject({ sourceUrl: posting.hostedUrl, applicationUrl: posting.applyUrl });
    expect(result.jobs[0].description).toContain('• Own reliability');
    expect(result.jobs[0].description).not.toContain('alert');
  });

  it('uses the EU endpoint and accepts a valid empty board', async () => {
    let requestUrl = '';
    const adapter = createLeverAdapter({ fetch: async (url) => { requestUrl = url; return response(200, []); } });
    await expect(adapter.fetchBoard({ ...source, leverRegion: 'EU' })).resolves.toMatchObject({ jobs: [], rawReceived: 0 });
    expect(requestUrl).toContain('https://api.eu.lever.co/');
  });

  it('reports hosted and optional application URL failures separately without degrading a valid job', async () => {
    const adapter = createLeverAdapter({ fetch: async () => response(200, [{ ...posting, applyUrl: 'https://tracker.invalid/redirect' }, { ...posting, id: 'two', hostedUrl: 'http://jobs.lever.co/acme/two' }]) });
    const result = await adapter.fetchBoard(source);
    expect(result.jobs).toHaveLength(1);
    expect(result).toMatchObject({ invalidHostedUrls: 1, invalidApplicationUrls: 1, urlRejections: { NON_HTTPS_URL: 1, EMPLOYER_HOST_MISMATCH: 1 } });
    expect(result.jobs[0].providerReferences[0].applicationUrl).toBeUndefined();
  });

  it('refuses disabled, malformed, identity-unready and timed-out sources', async () => {
    const adapter = createLeverAdapter({ fetch: async () => response(200, {}) });
    await expect(adapter.fetchBoard({ ...source, enabled: false })).rejects.toThrow('verified and enabled');
    await expect(adapter.fetchBoard(source)).rejects.toThrow('LEVER_MALFORMED_RESPONSE');
    const timeout = createLeverAdapter({ timeoutMs: 1, fetch: async (_url, init) => new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))) });
    await expect(timeout.fetchBoard(source)).rejects.toThrow('LEVER_TIMEOUT');
  });
});