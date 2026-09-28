export async function withCommandTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  timeoutCode: string,
): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(
      () => reject(new Error(timeoutCode)),
      Math.max(1_000, timeoutMs),
    );
  });

  try {
    return await Promise.race([operation, timeout]);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}
