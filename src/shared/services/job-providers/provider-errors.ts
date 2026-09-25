import type { JobProvider, ProviderSearchStatus } from '@/shared/types/job';
import { JobProviderError, type JobProviderFailureCode } from '@/shared/types/job-provider';

export interface ClassifiedProviderError {
  code: JobProviderFailureCode;
  status: Extract<ProviderSearchStatus, 'FAILED' | 'RATE_LIMITED' | 'TIMED_OUT'>;
  retryAfterSeconds?: number;
}

function retryAfterSeconds(value: string | null, now = Date.now()): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds);
  const date = Date.parse(value);
  if (!Number.isFinite(date)) return undefined;
  return Math.max(0, Math.ceil((date - now) / 1_000));
}

export function providerResponseError(provider: JobProvider, response: Response): JobProviderError {
  const code: JobProviderFailureCode =
    response.status === 401 || response.status === 403
      ? 'UNAUTHORISED'
      : response.status === 404
        ? 'NOT_FOUND'
        : response.status === 429
          ? 'RATE_LIMITED'
          : response.status >= 500
            ? 'UPSTREAM_ERROR'
            : 'UNAVAILABLE';
  return new JobProviderError(
    provider,
    code,
    `${provider} request failed with HTTP ${response.status}`,
    code === 'RATE_LIMITED' ? retryAfterSeconds(response.headers.get('Retry-After')) : undefined,
  );
}

export function classifyProviderError(provider: JobProvider, error: unknown): ClassifiedProviderError {
  if (error instanceof JobProviderError) {
    return {
      code: error.code,
      status: error.code === 'RATE_LIMITED' ? 'RATE_LIMITED' : error.code === 'TIMEOUT' ? 'TIMED_OUT' : 'FAILED',
      ...(error.retryAfterSeconds === undefined ? {} : { retryAfterSeconds: error.retryAfterSeconds }),
    };
  }
  if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
    return { code: 'TIMEOUT', status: 'TIMED_OUT' };
  }
  return { code: 'UNAVAILABLE', status: 'FAILED' };
}
