import { describe, expect, it } from 'vitest';
import {
  employerIdentityMatches,
  parseEmployerBoardPayload,
  verifyEmployerSourceRequest,
} from '@/shared/services/employer-source-verification';

const response = (status: number, payload: unknown) => ({
  status,
  ok: status >= 200 && status < 300,
  json: async () => payload,
}) as Response;

const input = { companyRecordId: 'company-1', provider: 'GREENHOUSE' as const, providerIdentifier: 'acme' };

describe('employer-source verification fixtures', () => {
  it('recognises the minimal documented list shape for every provider', () => {
    expect(parseEmployerBoardPayload('GREENHOUSE', { company: { name: 'Acme Holdings' }, jobs: [{ absolute_url: 'https://boards.greenhouse.io/acme/jobs/1' }] })).toMatchObject({ employerName: 'Acme Holdings', jobs: expect.any(Array) });
    expect(parseEmployerBoardPayload('LEVER', [{ hostedUrl: 'https://jobs.lever.co/acme/1' }])).toMatchObject({ jobs: expect.any(Array) });
    expect(parseEmployerBoardPayload('SMARTRECRUITERS', { company: { name: 'Acme Holdings' }, content: [{ applyUrl: 'https://jobs.smartrecruiters.com/acme/1' }] })).toMatchObject({ employerName: 'Acme Holdings' });
    expect(parseEmployerBoardPayload('ASHBY', { name: 'Acme Holdings', jobs: [{ jobUrl: 'https://jobs.ashbyhq.com/acme/1' }] })).toMatchObject({ employerName: 'Acme Holdings' });
  });

  it('accepts a valid empty board without inventing a vacancy', async () => {
    const result = await verifyEmployerSourceRequest(input, { fetch: async () => response(200, { company: { name: 'Acme Holdings' }, jobs: [] }) });
    expect(result).toMatchObject({ status: 'VERIFIED', jobsFound: 0 });
  });

  it('rejects malformed payloads, auth, HTTP failures and unsafe job URLs', async () => {
    await expect(verifyEmployerSourceRequest(input, { fetch: async () => response(200, { nope: [] }) })).resolves.toMatchObject({ failureCode: 'MALFORMED_RESPONSE' });
    await expect(verifyEmployerSourceRequest(input, { fetch: async () => response(401, {}) })).resolves.toMatchObject({ failureCode: 'AUTHENTICATION_REQUIRED' });
    await expect(verifyEmployerSourceRequest(input, { fetch: async () => response(404, {}) })).resolves.toMatchObject({ failureCode: 'BOARD_NOT_FOUND' });
    await expect(verifyEmployerSourceRequest(input, { fetch: async () => response(200, { jobs: [{ absolute_url: 'https://169.254.169.254/apply' }] }) })).resolves.toMatchObject({ failureCode: 'INVALID_JOB_URL' });
  });

  it('treats a provider timeout as a bounded failure', async () => {
    const result = await verifyEmployerSourceRequest(input, {
      timeoutMs: 1,
      fetch: async (_url, init) => new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))),
    });
    expect(result).toMatchObject({ status: 'FAILED', failureCode: 'TIMEOUT' });
  });

  it('requires exact or strong, meaningful employer identity evidence', () => {
    expect(employerIdentityMatches('Acme Holdings Ltd', 'Acme Holdings')).toBe(true);
    expect(employerIdentityMatches('Acme Holdings Ltd', 'Acme Services Holdings')).toBe(true);
    expect(employerIdentityMatches('Acme Holdings Ltd', 'Acme Consulting')).toBe(false);
    expect(employerIdentityMatches('Acme Holdings Ltd', undefined)).toBe(false);
  });
});