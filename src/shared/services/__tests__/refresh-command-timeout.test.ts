import { afterEach, describe, expect, it, vi } from 'vitest';

import { withCommandTimeout } from '@/shared/services/refresh-command-timeout';

afterEach(() => {
  vi.useRealTimers();
});

describe('withCommandTimeout', () => {
  it('clears its timeout after a successful operation', async () => {
    vi.useFakeTimers();
    await expect(withCommandTimeout(Promise.resolve('done'), 60_000, 'COMMAND_TIMEOUT')).resolves.toBe('done');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears its timeout after an operation failure', async () => {
    vi.useFakeTimers();
    await expect(withCommandTimeout(Promise.reject(new Error('operation failed')), 60_000, 'COMMAND_TIMEOUT')).rejects.toThrow('operation failed');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('still rejects when the command really times out', async () => {
    vi.useFakeTimers();
    const pending = new Promise<never>(() => undefined);
    const result = withCommandTimeout(pending, 1_000, 'COMMAND_TIMEOUT');
    const assertion = expect(result).rejects.toThrow('COMMAND_TIMEOUT');
    await vi.advanceTimersByTimeAsync(1_000);
    await assertion;
    expect(vi.getTimerCount()).toBe(0);
  });
});
