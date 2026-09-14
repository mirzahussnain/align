import { AsyncLocalStorage } from 'node:async_hooks';
import { AccountDeletionNotAuthorizedError } from './errors';

const INTERNAL_TOKEN = Symbol('account-deletion-authorization');
const deletionContext = new AsyncLocalStorage<{
  token: typeof INTERNAL_TOKEN;
  userId: string;
}>();

export function withAccountDeletionAuthorization<T>(
  userId: string,
  fn: () => Promise<T>
): Promise<T> {
  return deletionContext.run({ token: INTERNAL_TOKEN, userId }, fn);
}

export function assertAccountDeletionAuthorization(userId: string): void {
  const authorization = deletionContext.getStore();
  if (authorization?.token !== INTERNAL_TOKEN || authorization.userId !== userId) {
    throw new AccountDeletionNotAuthorizedError();
  }
}
