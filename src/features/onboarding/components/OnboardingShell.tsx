'use client';

import { useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/shared/utils/cn';

/**
 * The frame every onboarding stage renders inside.
 *
 * It owns the two things that must be consistent across the journey and are
 * easy to get wrong per-screen: where focus goes after a stage change, and how
 * progress is described.
 *
 * Progress here is ONBOARDING progress — how far through the journey the user
 * is. It is deliberately never mixed with Career Profile completeness, which
 * measures something else entirely and is shown separately where it is relevant.
 */
export function OnboardingShell({
  stageIndex,
  totalStages,
  title,
  subtitle,
  children,
  footer,
  busy,
  busyLabel,
  error,
}: {
  stageIndex: number;
  totalStages: number;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  busy?: boolean;
  /** Announced to screen readers while a long operation runs. */
  busyLabel?: string;
  error?: string | null;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Focus the new heading on every stage change. Without this a keyboard or
  // screen-reader user is left at the bottom of the previous screen with no
  // indication that anything moved.
  useEffect(() => {
    headingRef.current?.focus();
  }, [title]);

  const percentage = totalStages > 0 ? Math.round((stageIndex / totalStages) * 100) : 0;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
      <div className="mb-6">
        <div
          role="progressbar"
          aria-valuenow={stageIndex}
          aria-valuemin={0}
          aria-valuemax={totalStages}
          aria-label={`Setup progress: step ${stageIndex + 1} of ${totalStages}`}
          className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-200"
        >
          <div
            className="h-full rounded-full bg-accent-purple transition-all duration-300"
            style={{ width: `${percentage}%` }}
          />
        </div>
        <p className="mt-2 text-xs font-medium text-neutral-500">
          Step {Math.min(stageIndex + 1, totalStages)} of {totalStages}
        </p>
      </div>

      <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-8">
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="text-xl font-bold text-neutral-900 outline-none sm:text-2xl"
        >
          {title}
        </h1>
        {subtitle && <p className="mt-2 text-sm leading-relaxed text-neutral-500">{subtitle}</p>}

        <div className="mt-6">{children}</div>

        {/*
          One live region for the whole stage. Long operations announce
          themselves here rather than each component inventing its own, so a
          screen reader hears one status at a time instead of three.
        */}
        <p aria-live="polite" className="sr-only">
          {busy ? busyLabel ?? 'Working…' : ''}
        </p>

        {busy && busyLabel && (
          <p className="mt-4 flex items-center gap-2 text-xs font-medium text-neutral-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            {busyLabel}
          </p>
        )}

        {error && (
          <p
            role="alert"
            className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700"
          >
            {error}
          </p>
        )}

        {footer && (
          <div className="mt-8 flex flex-col gap-3 border-t border-neutral-100 pt-6 sm:flex-row sm:items-center sm:justify-between">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/** The single primary action on a stage. */
export function PrimaryButton({
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex w-full items-center justify-center gap-2 rounded-full bg-accent-purple px-5 py-2.5 text-xs font-bold text-white transition-colors hover:bg-accent-purple/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-purple/40 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto',
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

/** A secondary or tertiary action, never competing with the primary one. */
export function SecondaryButton({
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex w-full items-center justify-center gap-2 rounded-full border border-neutral-300 bg-white px-4 py-2.5 text-xs font-semibold text-neutral-700 transition-colors hover:border-neutral-400 hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-purple/30 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto',
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

/**
 * A large, keyboard-operable choice card.
 *
 * A real radio input underneath rather than a styled div: arrow-key navigation,
 * group semantics and the selected state all come free and correct, which a
 * div with role="radio" only approximates.
 */
export function ChoiceCard({
  name,
  value,
  checked,
  onSelect,
  title,
  description,
  icon,
  disabled,
}: {
  name: string;
  value: string;
  checked: boolean;
  onSelect: (value: string) => void;
  title: string;
  description: string;
  icon?: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors',
        checked
          ? 'border-accent-purple bg-accent-purple/5 ring-1 ring-accent-purple/30'
          : 'border-neutral-200 bg-white hover:border-neutral-300',
        disabled && 'cursor-not-allowed opacity-50'
      )}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={() => onSelect(value)}
        className="mt-1 h-4 w-4 shrink-0 accent-accent-purple focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-purple/40"
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 text-sm font-semibold text-neutral-900">
          {icon}
          {title}
        </span>
        <span className="mt-1 block text-xs leading-relaxed text-neutral-500">{description}</span>
      </span>
    </label>
  );
}
