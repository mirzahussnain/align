import { describe, expect, it } from 'vitest';
import {
  assertAccountDeletionAuthorization,
  withAccountDeletionAuthorization,
} from '../context';

describe('account deletion authorization context', () => {
  it('cannot be asserted outside the trusted in-process scope', () => {
    expect(() => assertAccountDeletionAuthorization('u1')).toThrowError(
      expect.objectContaining({ code: 'ACCOUNT_DELETION_NOT_AUTHORIZED' })
    );
  });

  it('authorizes only the exact scoped user across awaits', async () => {
    await withAccountDeletionAuthorization('u1', async () => {
      await Promise.resolve();
      expect(() => assertAccountDeletionAuthorization('u1')).not.toThrow();
      expect(() => assertAccountDeletionAuthorization('u2')).toThrowError(
        expect.objectContaining({ code: 'ACCOUNT_DELETION_NOT_AUTHORIZED' })
      );
    });
  });
});
