import { isProfileDate, isProfileDateBefore } from './date';

export type ProfileDateBoundary = 'past-or-current' | 'future-allowed';

/** The latest month valid for facts that have already started or been issued. */
export function currentProfileMonth(now = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** A year-only value is future only when its whole year is still future. */
export function isFutureProfileDate(value: string, now = new Date()): boolean {
  if (!isProfileDate(value)) return false;
  const trimmed = value.trim();
  const current = currentProfileMonth(now);
  return trimmed.length === 4 ? trimmed > current.slice(0, 4) : trimmed > current;
}

export function validateProfileDateBoundary(value: string, boundary: ProfileDateBoundary, label: string, now = new Date()): string | null {
  if (!value || boundary === 'future-allowed' || !isFutureProfileDate(value, now)) return null;
  return `${label} cannot be in the future.`;
}

export function validateProfileDateRange(input: {
  start?: string;
  end?: string;
  startLabel: string;
  endLabel: string;
  endBoundary?: ProfileDateBoundary;
  now?: Date;
}): string | null {
  const now = input.now ?? new Date();
  const startError = validateProfileDateBoundary(input.start ?? '', 'past-or-current', input.startLabel, now);
  if (startError) return startError;
  const endError = validateProfileDateBoundary(input.end ?? '', input.endBoundary ?? 'past-or-current', input.endLabel, now);
  if (endError) return endError;
  if (input.start && input.end && isProfileDateBefore(input.end, input.start)) {
    return 'End or expiry date cannot be before its start or issue date.';
  }
  return null;
}