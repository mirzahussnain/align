/**
 * Centralized API Error handling utility to ensure sensitive error details
 * are not leaked to the client in production.
 */
import { NextResponse } from 'next/server';

export class APIError extends Error {
  statusCode: number;
  
  constructor(message: string, statusCode: number = 500) {
    super(message);
    this.statusCode = statusCode;
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
  } catch (error: any) {
    console.error('[API Error]:', error.message || error);
    
    // If it's a known APIError, we can return its specific status code and message
    if (error instanceof APIError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    
    // For unknown errors, return a generic 500 to prevent leaking internal stack traces
    return NextResponse.json(
      { error: 'An unexpected internal server error occurred.' },
      { status: 500 }
    );
  }
}
