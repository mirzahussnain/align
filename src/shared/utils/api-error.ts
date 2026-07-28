/**
 * Centralized API error handling. New contract-bound routes opt into a stable,
 * provider-safe shape; legacy routes retain their established response while
 * they are migrated independently.
 */
import { NextResponse } from 'next/server';

export type ApiErrorCode = 'UNAUTHENTICATED' | 'FORBIDDEN' | 'NOT_FOUND' | 'INVALID_REQUEST' | 'PROVIDER_UNAVAILABLE' | 'STALE_DESCRIPTION' | 'DESCRIPTION_INCOMPLETE' | 'RATE_LIMITED' | 'INTERNAL_ERROR';
export interface ApiErrorResponse { error: { code: ApiErrorCode | string; message: string; retryable: boolean; field?: string }; }
export function apiErrorCodeForStatus(status: number): ApiErrorCode { if (status === 401) return 'UNAUTHENTICATED'; if (status === 403) return 'FORBIDDEN'; if (status === 404) return 'NOT_FOUND'; if (status === 429) return 'RATE_LIMITED'; if (status >= 400 && status < 500) return 'INVALID_REQUEST'; return 'INTERNAL_ERROR'; }

export class APIError extends Error {
  statusCode: number;
  code: string;
  retryable: boolean;
  useContract: boolean;
  responseBody?: Record<string, unknown>;
  constructor(message: string, statusCode = 500, responseBody?: Record<string, unknown>, code?: string, retryable = false) {
    super(message); this.statusCode = statusCode; this.responseBody = responseBody; this.code = code ?? apiErrorCodeForStatus(statusCode); this.retryable = retryable; this.useContract = code !== undefined; this.name = 'APIError';
  }
}

export async function withErrorHandler(handler: () => Promise<NextResponse>): Promise<NextResponse> {
  try { return await handler(); } catch (error: unknown) {
    console.error('[API Error]:', error instanceof Error ? error.message : error);
    if (error instanceof APIError) {
      if (!error.useContract) return NextResponse.json(error.responseBody ?? { error: error.message }, { status: error.statusCode });
      const legacy = error.responseBody ?? {}; const field = typeof legacy.field === 'string' ? legacy.field : undefined;
      return NextResponse.json({ ...legacy, error: { code: error.code, message: error.message, retryable: error.retryable, ...(field ? { field } : {}) } } satisfies ApiErrorResponse, { status: error.statusCode });
    }
    return NextResponse.json({ error: 'An unexpected internal server error occurred.' }, { status: 500 });
  }
}