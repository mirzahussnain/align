/**
 * The ONLY sanctioned way to run work after a response has been sent.
 *
 * THE RULE THIS ENFORCES. On a serverless platform a promise that is not awaited
 * and not registered with the runtime is not "background work" — the invocation
 * is frozen or torn down as soon as the response is flushed, and the promise may
 * simply never run. `void refreshProviders()` after `return response` is not a
 * background refresh; it is a coin flip that also loses the error. This module
 * exists so that pattern has no reason to appear anywhere in the codebase.
 *
 * WHAT MAKES `after` DIFFERENT. Next.js's `after` (stable since 15.1, supported
 * in Route Handlers) is backed on Vercel by `waitUntil`, which EXTENDS the
 * invocation's lifetime until the registered promise settles. The work is
 * genuinely awaited by the platform, inside the route's `maxDuration`, rather
 * than racing a freeze. That is a guarantee; unawaited work has none.
 *
 * WHEN THERE IS NO WINDOW. `after` throws when called outside a request scope —
 * a route handler invoked directly from a test, or any non-Next caller. This
 * returns `'unavailable'` in that case instead of falling back to a detached
 * promise, so the caller can do the honest thing (abandon the work, tell the
 * client to refresh) rather than report a refresh that will not happen.
 */

import { after } from 'next/server';

export type AfterResponseOutcome =
  /** Registered with the runtime; the platform will keep the invocation alive. */
  | 'scheduled'
  /** No request scope. NOTHING was started — the caller must handle it. */
  | 'unavailable';

/**
 * Register `task` to run after the response is sent.
 *
 * The task's own failure is contained here: `after` runs the callback even when
 * the response errored, and an unhandled rejection inside it would surface as a
 * platform-level error on a request the user has already been served
 * successfully. Callers pass an `onError` to log through their own PII-safe
 * channel — the reason is never logged from this module, which has no idea what
 * the task's errors may contain.
 */
export function scheduleAfterResponse(
  task: () => Promise<unknown>,
  onError?: (error: unknown) => void
): AfterResponseOutcome {
  try {
    after(async () => {
      try {
        await task();
      } catch (error) {
        onError?.(error);
      }
    });
    return 'scheduled';
  } catch {
    // `after` itself threw, which means there is no request scope to attach to.
    // Deliberately do NOT start the task: an unawaited promise here is exactly
    // the pattern this module exists to prevent.
    return 'unavailable';
  }
}
