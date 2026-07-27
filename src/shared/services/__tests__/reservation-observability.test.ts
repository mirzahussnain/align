import { afterEach, describe, expect, it } from 'vitest';
import {
  __setLogSink,
  hashUserId,
  logReservationEvent,
  sanitizeMeta,
} from '../reservation-observability';

// Capture emitted records so we can assert on the exact shape and, crucially,
// that no sensitive field ever survives the sanitiser.
function captureRecords() {
  const records: Record<string, unknown>[] = [];
  const restore = __setLogSink((record) => records.push(record));
  return { records, restore };
}

let restore: (() => void) | null = null;
afterEach(() => {
  restore?.();
  restore = null;
});

describe('reservation observability — event emission', () => {
  it('emits each lifecycle event with its discriminator and safe metadata', () => {
    const cap = captureRecords();
    restore = cap.restore;

    logReservationEvent('operation_started', { userId: 'user-1', capability: 'job_match_analysis', operationId: 'op-1' });
    logReservationEvent('provider_succeeded', { capability: 'cv_regeneration', operationId: 'op-2', provider: 'gemini', model: 'gemini-3.5-flash', attempt: 2, fallbackUsed: true, durationMs: 1200 });
    logReservationEvent('reservation_committed', { operationId: 'op-3', charged: true });

    expect(cap.records.map((r) => r.evt)).toEqual([
      'operation_started',
      'provider_succeeded',
      'reservation_committed',
    ]);
    expect(cap.records[1]).toMatchObject({
      evt: 'provider_succeeded',
      provider: 'gemini',
      model: 'gemini-3.5-flash',
      attempt: 2,
      fallbackUsed: true,
      durationMs: 1200,
    });
  });

  it('marks failure/degradation events at warn severity and normal events at info', () => {
    const cap = captureRecords();
    restore = cap.restore;

    logReservationEvent('operation_running', { operationId: 'op-1' });
    logReservationEvent('reservation_released', { operationId: 'op-1', reason: 'provider_unavailable' });
    logReservationEvent('fingerprint_conflict', { operationId: 'op-1' });

    expect(cap.records[0].severity).toBe('info');
    expect(cap.records[1].severity).toBe('warn');
    expect(cap.records[2].severity).toBe('warn');
  });

  it('hashes the user id and never emits it in the clear', () => {
    const cap = captureRecords();
    restore = cap.restore;

    logReservationEvent('operation_started', { userId: 'sensitive-user-id', operationId: 'op-1' });

    const record = cap.records[0];
    expect(record.userId).toBeUndefined();
    expect(record.userHash).toBe(hashUserId('sensitive-user-id'));
    expect(String(record.userHash)).not.toContain('sensitive-user-id');
  });
});

describe('reservation observability — privacy backstop', () => {
  it('drops every field not on the safe allow-list', () => {
    const dirty = {
      capability: 'cv_regeneration',
      operationId: 'op-1',
      // None of these may ever appear on a log record:
      cvText: 'John Doe, 10 Downing St, senior nurse…',
      jobDescription: 'We are hiring…',
      prompt: 'You are a helpful assistant…',
      evidenceBody: 'NMC PIN 12A3456B',
      registrationNumber: '12A3456B',
      email: 'someone@example.com',
      rawOutput: { secret: true },
    } as Record<string, unknown>;

    const safe = sanitizeMeta(dirty) as Record<string, unknown>;

    expect(safe).toEqual({ capability: 'cv_regeneration', operationId: 'op-1' });
    for (const forbidden of ['cvText', 'jobDescription', 'prompt', 'evidenceBody', 'registrationNumber', 'email', 'rawOutput']) {
      expect(safe[forbidden]).toBeUndefined();
    }
  });

  it('discards non-primitive values even in allowed slots', () => {
    const safe = sanitizeMeta({ capability: { nested: 'object' }, operationId: 'op-1' }) as Record<string, unknown>;
    expect(safe.capability).toBeUndefined();
    expect(safe.operationId).toBe('op-1');
  });

  it('never leaks sensitive content through the emitter, even if passed', () => {
    const cap = captureRecords();
    restore = cap.restore;

    logReservationEvent('provider_attempted', {
      operationId: 'op-1',
      provider: 'groq',
      // @ts-expect-error — deliberately passing a forbidden field to prove it is dropped
      cvText: 'sensitive CV body',
    });

    const serialised = JSON.stringify(cap.records[0]);
    expect(serialised).not.toContain('sensitive CV body');
    expect(cap.records[0].provider).toBe('groq');
  });
});
