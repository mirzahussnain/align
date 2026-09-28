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

type ExitRefreshCommandOptions = {
  disconnect: () => Promise<void>;
  exitCode: number;
  flush?: () => Promise<void>;
  exit?: (code: number) => never;
};

const flushStdout = () => new Promise<void>((resolve) => {
  process.stdout.write('', () => resolve());
});

/**
 * One-shot administrative commands must not inherit long-lived application
 * handles (for example a memoised cache connection). All command work is
 * already awaited before this boundary; flush its report, close Prisma, then
 * terminate with the code selected by the command.
 */
export async function exitRefreshCommand({
  disconnect,
  exitCode,
  flush = flushStdout,
  exit = process.exit,
}: ExitRefreshCommandOptions): Promise<never> {
  await disconnect();
  await flush();
  return exit(exitCode);
}
