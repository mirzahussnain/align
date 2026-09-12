"use client";

import { Check } from "lucide-react";
import { INTAKE_STEPS } from "@/shared/constants/vacancy-intake-stepper";

interface VacancyStepIndicatorProps {
  currentStep: number;
  completedSteps: number[];
  onSelectStep: (step: number) => void;
}

export function VacancyStepIndicator({
  currentStep,
  completedSteps,
  onSelectStep,
}: VacancyStepIndicatorProps) {
  return (
    <nav aria-label="Vacancy intake progress" className="w-full">
      <ol className="grid grid-cols-3 gap-2 sm:gap-4">
        {INTAKE_STEPS.map((stepDef) => {
          const isCompleted = completedSteps.includes(stepDef.step);
          const isActive = currentStep === stepDef.step;
          const isClickable = isCompleted || stepDef.step <= Math.max(1, ...completedSteps, currentStep);

          return (
            <li key={stepDef.step} className="relative">
              <button
                type="button"
                disabled={!isClickable}
                onClick={() => isClickable && onSelectStep(stepDef.step)}
                className={`group flex w-full flex-col items-center justify-center rounded-xl p-2 text-center transition-all sm:items-start sm:justify-start sm:rounded-2xl sm:p-4 sm:text-left border ${
                  isActive
                    ? "border-accent-cyan bg-accent-cyan/5 shadow-sm ring-2 ring-accent-cyan/20 dark:bg-accent-cyan/10"
                    : isCompleted
                      ? "border-emerald-200 bg-emerald-50/60 hover:bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-950/20"
                      : "border-neutral-200 bg-neutral-50/50 opacity-60 dark:border-border-subtle dark:bg-bg-tertiary/20"
                } ${isClickable ? "cursor-pointer" : "cursor-not-allowed"}`}
              >
                {/* Number Circle & Step Label (on desktop) */}
                <div className="flex flex-col items-center justify-center gap-1 sm:w-full sm:flex-row sm:justify-between sm:gap-2">
                  <span
                    className={`flex h-6 w-6 sm:h-7 sm:w-7 shrink-0 items-center justify-center rounded-lg sm:rounded-xl text-[11px] sm:text-xs font-black transition-colors ${
                      isActive
                        ? "bg-accent-cyan text-white"
                        : isCompleted
                          ? "bg-emerald-600 text-white"
                          : "bg-neutral-200 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300"
                    }`}
                  >
                    {isCompleted ? <Check className="h-3.5 w-3.5 sm:h-4 sm:w-4 stroke-[3]" /> : stepDef.step}
                  </span>
                  <span
                    className={`hidden text-[10px] font-bold uppercase tracking-wider sm:inline ${
                      isActive
                        ? "text-accent-cyan"
                        : isCompleted
                          ? "text-emerald-700 dark:text-emerald-400"
                          : "text-neutral-400"
                    }`}
                  >
                    Step 0{stepDef.step}
                  </span>
                </div>

                {/* Mobile Step Name below number */}
                <span
                  className={`mt-1 text-[10px] font-bold leading-tight sm:hidden line-clamp-1 ${
                    isActive
                      ? "text-accent-cyan"
                      : isCompleted
                        ? "text-emerald-700 dark:text-emerald-400"
                        : "text-neutral-500 dark:text-text-secondary"
                  }`}
                >
                  {stepDef.shortTitle}
                </span>

                {/* Desktop Titles & Description */}
                <div className="mt-2.5 hidden min-w-0 sm:block">
                  <p
                    className={`truncate text-xs font-bold sm:text-sm ${
                      isActive
                        ? "text-neutral-900 dark:text-text-primary"
                        : isCompleted
                          ? "text-neutral-900 dark:text-text-primary"
                          : "text-neutral-500 dark:text-text-secondary"
                    }`}
                  >
                    {stepDef.title}
                  </p>
                  <p className="mt-0.5 text-[11px] leading-4 text-neutral-500 line-clamp-1 dark:text-text-tertiary">
                    {stepDef.description}
                  </p>
                </div>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
