"use client";

import React, { useEffect } from "react";
import { ChevronLeft, X } from "lucide-react";

interface JobDetailModalProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
}

export function JobDetailModal({
  open,
  onClose,
  children,
  title = "Vacancy Details",
}: JobDetailModalProps) {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end sm:justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm transition-opacity animate-in fade-in duration-200 lg:hidden"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="fixed inset-0"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative z-10 flex flex-col h-[94vh] sm:h-[90vh] w-full max-w-4xl mx-auto rounded-t-3xl sm:rounded-3xl bg-neutral-50 dark:bg-bg-primary shadow-2xl border border-neutral-200 dark:border-border-subtle overflow-hidden">
        {/* Sticky Header */}
        <div className="sticky top-0 z-20 flex items-center justify-between gap-2 border-b border-neutral-200 bg-white px-3 py-2.5 dark:border-border-subtle dark:bg-bg-secondary shrink-0 shadow-xs">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1 shrink-0 rounded-xl border border-neutral-200 bg-neutral-100 dark:bg-bg-tertiary px-2.5 py-1.5 text-xs font-bold text-neutral-800 dark:border-border-subtle dark:text-text-primary transition hover:bg-neutral-200"
          >
            <ChevronLeft className="h-4 w-4 text-accent-purple shrink-0" />
            <span>Back</span>
          </button>

          <span className="min-w-0 flex-1 text-center text-xs font-extrabold uppercase tracking-wider text-neutral-700 dark:text-text-primary truncate px-1">
            {title}
          </span>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="flex h-8 w-8 items-center justify-center shrink-0 rounded-full bg-neutral-100 hover:bg-neutral-200 text-neutral-600 dark:bg-bg-tertiary dark:text-text-primary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-6">
          {children}
        </div>
      </div>
    </div>
  );
}
