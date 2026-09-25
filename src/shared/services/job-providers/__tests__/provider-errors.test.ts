import { describe, expect, it } from 'vitest';

import { classifyProviderError, providerResponseError } from '../provider-errors';

describe('provider error classification', () => {
  it.each([
    [401, 'UNAUTHORISED', 'FAILED'],
    [403, 'UNAUTHORISED', 'FAILED'],
    [404, 'NOT_FOUND', 'FAILED'],
    [429, 'RATE_LIMITED', 'RATE_LIMITED'],
    [500, 'UPSTREAM_ERROR', 'FAILED'],
    [503, 'UPSTREAM_ERROR', 'FAILED'],
  ] as const)('classifies HTTP %s without retaining the upstream body', (status, code, searchStatus) => {
    const response = new Response('secret upstream detail', {
      status,
      headers: status === 429 ? { 'Retry-After': '120' } : undefined,
    });
    const error = providerResponseError('REED', response);
    const classified = classifyProviderError('REED', error);
    expect(classified).toMatchObject({ code, status: searchStatus });
    expect(error.message).not.toContain('secret upstream detail');
    expect(classified.retryAfterSeconds).toBe(status === 429 ? 120 : undefined);
  });

  it.each(['AbortError', 'TimeoutError'] as const)('classifies %s as a timeout', (name) => {
    const error = new Error('request contained sensitive provider URL');
    error.name = name;
    expect(classifyProviderError('ADZUNA', error)).toEqual({ code: 'TIMEOUT', status: 'TIMED_OUT' });
  });

  it('classifies an unknown exception as an unavailable upstream', () => {
    expect(classifyProviderError('JOOBLE', new Error('opaque failure'))).toEqual({
      code: 'UNAVAILABLE', status: 'FAILED',
    });
  });
});
