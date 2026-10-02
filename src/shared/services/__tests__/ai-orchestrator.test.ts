import { describe, it, expect } from 'vitest';
import { __testing } from '@/shared/services/ai-orchestrator';

const { stripCodeFence, extractFirstJsonValue, parseJSONContent, classifyProviderFailure } = __testing;

describe('classifyProviderFailure', () => {
  it.each([
    [503, 'SERVICE_UNAVAILABLE'],
    [404, 'MODEL_NOT_FOUND'],
    [429, 'RATE_LIMITED'],
    [401, 'AUTH'],
    [403, 'AUTH'],
  ] as const)('preserves HTTP %s as %s', (status, normalizedReason) => {
    expect(classifyProviderFailure(Object.assign(new Error('omitted'), { status }), false)).toEqual({
      errorCode: normalizedReason,
      normalizedReason,
      upstreamStatusCode: status,
      retryAfterMs: null,
    });
  });

  it('classifies transport failures without persisting the raw error', () => {
    const error = Object.assign(new TypeError('fetch failed'), {
      cause: Object.assign(new Error('private network detail'), { code: 'ECONNRESET' }),
    });
    expect(classifyProviderFailure(error, false)).toEqual({
      errorCode: 'NETWORK',
      normalizedReason: 'NETWORK',
      upstreamStatusCode: null,
      retryAfterMs: null,
    });
  });

  it('gives the local timeout precedence over the SDK error shape', () => {
    expect(classifyProviderFailure(Object.assign(new Error('aborted'), { status: 503 }), true)).toEqual({
      errorCode: 'TIMEOUT',
      normalizedReason: 'TIMEOUT',
      upstreamStatusCode: 503,
      retryAfterMs: null,
    });
  });

  it('extracts Retry-After seconds without exposing provider content', () => {
    expect(classifyProviderFailure(Object.assign(new Error('omitted'), {
      status: 429,
      headers: { 'retry-after': '2' },
    }), false)).toMatchObject({
      normalizedReason: 'RATE_LIMITED',
      retryAfterMs: 2_000,
    });
  });
});

describe('stripCodeFence', () => {
  it('passes unfenced text through untouched', () => {
    expect(stripCodeFence('{"a":1}')).toBe('{"a":1}');
  });

  it('strips a ```json fence', () => {
    expect(stripCodeFence('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it('drops prose after the closing fence', () => {
    expect(stripCodeFence('```json\n{"a":1}\n```\nHope this helps!')).toBe('{"a":1}');
  });

  it('handles a missing closing fence', () => {
    expect(stripCodeFence('```json\n{"a":1}')).toBe('{"a":1}');
  });
});

describe('extractFirstJsonValue', () => {
  it('extracts an object wrapped in prose', () => {
    expect(extractFirstJsonValue('Here is the JSON: {"a":{"b":2}} done')).toBe('{"a":{"b":2}}');
  });

  it('extracts an array', () => {
    expect(extractFirstJsonValue('result: [1,[2,3]] trailing')).toBe('[1,[2,3]]');
  });

  it('ignores braces inside strings', () => {
    expect(extractFirstJsonValue('{"a":"has } brace","b":1}')).toBe('{"a":"has } brace","b":1}');
  });

  it('ignores escaped quotes inside strings', () => {
    expect(extractFirstJsonValue('{"a":"quote \\" and } brace"}')).toBe('{"a":"quote \\" and } brace"}');
  });

  it('returns null when no JSON opener exists', () => {
    expect(extractFirstJsonValue('no json here')).toBeNull();
  });

  it('returns null for an unterminated object', () => {
    expect(extractFirstJsonValue('{"a":1')).toBeNull();
  });
});

describe('parseJSONContent', () => {
  it('parses clean JSON', () => {
    expect(parseJSONContent<{ a: number }>('{"a":1}')).toEqual({ a: 1 });
  });

  it('parses fenced JSON with trailing prose', () => {
    expect(parseJSONContent<{ a: number }>('```json\n{"a":1}\n```\nnote')).toEqual({ a: 1 });
  });

  it('parses prose-wrapped JSON', () => {
    expect(parseJSONContent<{ a: number }>('Sure! {"a":1} Let me know.')).toEqual({ a: 1 });
  });

  it('returns null on garbage', () => {
    expect(parseJSONContent('total garbage')).toBeNull();
  });
});
