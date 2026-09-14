import { APIError } from 'better-auth/api';

export class AccountDeletionNotAuthorizedError extends APIError {
  readonly code = 'ACCOUNT_DELETION_NOT_AUTHORIZED';

  constructor() {
    super('FORBIDDEN', {
      code: 'ACCOUNT_DELETION_NOT_AUTHORIZED',
      message: 'Account deletion was not authorized.',
    });
    this.name = 'AccountDeletionNotAuthorizedError';
  }
}

export class ActiveSubscriptionBlocksDeletionError extends APIError {
  readonly code = 'ACTIVE_SUBSCRIPTION_BLOCKS_DELETION';

  constructor(
    readonly paidThrough: Date | null,
    readonly billingStatus: string
  ) {
    super('CONFLICT', {
      code: 'ACTIVE_SUBSCRIPTION_BLOCKS_DELETION',
      message: 'Cancel active paid access before deleting your account.',
      paidThrough: paidThrough?.toISOString() ?? null,
      status: billingStatus,
    });
    this.name = 'ActiveSubscriptionBlocksDeletionError';
  }
}

export class AccountDeletionStorageFailedError extends APIError {
  readonly code = 'ACCOUNT_DELETION_STORAGE_FAILED';

  constructor() {
    super('SERVICE_UNAVAILABLE', {
      code: 'ACCOUNT_DELETION_STORAGE_FAILED',
      message: 'Stored account files could not be deleted. Try again later.',
    });
    this.name = 'AccountDeletionStorageFailedError';
  }
}
