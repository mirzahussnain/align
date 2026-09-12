import React from "react";
import { Briefcase, Loader2, Sparkles } from "lucide-react";

interface JobLoaderProps {
  message?: string;
  subMessage?: string;
  className?: string;
  count?: number;
}

export function JobLoader({
  message = "Your Jobs are on the way",
  subMessage = "Finding the best matches for your search criteria...",
  className = "",
}: JobLoaderProps) {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className={`my-6 flex flex-col items-center justify-center rounded-3xl border border-purple-100 bg-gradient-to-b from-purple-50/60 via-white to-neutral-50/50 p-8 sm:p-12 text-center shadow-sm dark:border-accent-purple/20 dark:from-accent-purple/10 dark:via-bg-secondary dark:to-bg-tertiary/40 ${className}`}
    >
      <div className="relative mb-5 flex h-16 w-16 items-center justify-center">
        {/* Animated outer ring */}
        <div className="absolute inset-0 rounded-full bg-accent-purple/20 animate-ping opacity-75" />

        {/* Glowing background circle */}
        <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-purple text-white shadow-lg shadow-accent-purple/30">
          <Briefcase className="h-7 w-7 animate-bounce" />
        </div>

        {/* Sparkle badge */}
        <span className="absolute -top-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-amber-400 text-amber-950 shadow-sm">
          <Sparkles className="h-3.5 w-3.5" />
        </span>
      </div>

      <div className="flex items-center justify-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin text-accent-purple" />
        <h3 className="text-base sm:text-lg font-bold tracking-tight text-neutral-900 dark:text-text-primary">
          {message}
        </h3>
      </div>

      {subMessage && (
        <p className="mt-1.5 max-w-sm text-xs sm:text-sm text-neutral-500 dark:text-text-secondary">
          {subMessage}
        </p>
      )}

      {/* Animated progress bar indicator */}
      <div className="mt-5 h-1.5 w-48 overflow-hidden rounded-full bg-purple-100 dark:bg-bg-tertiary">
        <div className="h-full w-full bg-accent-purple animate-pulse rounded-full" />
      </div>
    </div>
  );
}
