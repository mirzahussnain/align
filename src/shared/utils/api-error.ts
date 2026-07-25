/**
 * Centralized API Error handling utility to ensure sensitive error details
 * are not leaked to the client in production.
 */
import { NextResponse } from 'next/server';

export class APIError extends Error {
  statusCode: number;
  responseBody?: Record<string, unknown>;
  
  constructor(message: string, statusCode: number = 500, responseBody?: Record<string, unknown>) {
    super(message);
    this.statusCode = statusCode;
    this.responseBody = responseBody;
    this.name = 'APIError';
  }
}

/**
 * Wraps API route execution to handle errors gracefully and sanitize output.
 */
export async function withErrorHandler(
  handler: () => Promise<NextResponse>
): Promise<NextResponse> {
  try {
    return await handler();
  } catch (error: unknown) {
    console.error('[API Error]:', error instanceof Error ? error.message : error);
    
    // If it's a known APIError, we can return its specific status code and message
    if (error instanceof APIError) {
      return NextResponse.json(error.responseBody ?? { error: error.message }, { status: error.statusCode });
    }
    
    // For unknown errors, return a generic 500 to prevent leaking internal stack traces
    return NextResponse.json(
      { error: 'An unexpected internal server error occurred.' },
      { status: 500 }
    );
  }
}
