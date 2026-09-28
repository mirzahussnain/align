export const EMPLOYER_JOB_PERSISTENCE_CONCURRENCY = 4;

/**
 * Maps values with a fixed worker pool. Once one operation fails, no new work
 * is assigned, but already-started operations are awaited before the error is
 * rethrown so their committed outcomes can be reported accurately.
 */
export async function mapWithConcurrency<T, R>(
  values: readonly T[],
  limit: number,
  operation: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (values.length === 0) return [];

  const results = new Array<R>(values.length);
  const workerCount = Math.min(values.length, Math.max(1, Math.floor(limit)));
  let cursor = 0;
  let firstError: unknown;
  let failed = false;

  async function worker() {
    while (!failed) {
      const index = cursor;
      cursor += 1;
      if (index >= values.length) return;

      try {
        results[index] = await operation(values[index], index);
      } catch (error) {
        if (!failed) firstError = error;
        failed = true;
      }
    }
  }

  await Promise.all(Array.from({ length: workerCount }, worker));
  if (failed) throw firstError;
  return results;
}
