'use client';

import { ChevronDown } from 'lucide-react';
import { FieldHint, Label } from './Field';
import {
  COMMUTE_MINUTES,
  type PracticalPreferencesInput,
} from '@/shared/schemas/practical-preferences';

const relocationOptions = [
  { value: 'YES', label: 'Yes' },
  { value: 'NO', label: 'No' },
  { value: 'CONSIDER', label: 'Maybe' },
] as const;

const workStyleOptions = [
  { value: 'REMOTE', label: 'Remote' },
  { value: 'HYBRID', label: 'Hybrid' },
  { value: 'ONSITE', label: 'On-site' },
] as const;

export default function PracticalPreferencesFields({
  value,
  onChange,
  idPrefix,
}: {
  value: PracticalPreferencesInput;
  onChange: (value: PracticalPreferencesInput) => void;
  idPrefix: string;
}) {
  function toggleWorkStyle(workStyle: PracticalPreferencesInput['preferredWorkStyles'][number]) {
    const selected = value.preferredWorkStyles.includes(workStyle);
    onChange({
      ...value,
      preferredWorkStyles: selected
        ? value.preferredWorkStyles.filter((item) => item !== workStyle)
        : [...value.preferredWorkStyles, workStyle],
    });
  }

  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
      <fieldset>
        <legend className="text-sm font-semibold text-neutral-800">Willing to relocate?</legend>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {relocationOptions.map((option) => {
            const selected = value.relocationPreference === option.value;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={selected}
                onClick={() => onChange({
                  ...value,
                  relocationPreference: selected ? null : option.value,
                })}
                className={`min-h-11 rounded-xl border px-3 text-sm font-semibold transition-colors ${
                  selected
                    ? 'border-accent-cyan bg-accent-cyan/10 text-neutral-900'
                    : 'border-neutral-300 bg-white text-neutral-700 hover:border-neutral-400'
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div>
        <Label htmlFor={`${idPrefix}-max-commute`} optional>
          Maximum acceptable one-way commute
        </Label>
        <div className="relative">
          <select
            id={`${idPrefix}-max-commute`}
            value={value.maxCommuteMinutes ?? ''}
            onChange={(event) => onChange({
              ...value,
              maxCommuteMinutes: event.target.value
                ? Number(event.target.value) as PracticalPreferencesInput['maxCommuteMinutes']
                : null,
            })}
            aria-describedby={`${idPrefix}-max-commute-hint`}
            className="w-full appearance-none rounded-xl border border-neutral-300 bg-white px-4 py-2.5 pr-9 text-sm text-neutral-900 transition-colors focus:border-accent-cyan focus:outline-none focus:ring-2 focus:ring-accent-cyan/15"
          >
            <option value="">No preference</option>
            {COMMUTE_MINUTES.map((minutes) => (
              <option key={minutes} value={minutes}>{minutes} min</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" aria-hidden="true" />
        </div>
        <FieldHint id={`${idPrefix}-max-commute-hint`}>
          This is the longest one-way journey you would usually accept.
        </FieldHint>
      </div>

      <fieldset className="sm:col-span-2">
        <legend className="text-sm font-semibold text-neutral-800">Preferred work arrangements</legend>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {workStyleOptions.map((option) => (
            <label
              key={option.value}
              className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-sm font-medium text-neutral-700 transition-colors hover:border-neutral-400"
            >
              <input
                type="checkbox"
                checked={value.preferredWorkStyles.includes(option.value)}
                onChange={() => toggleWorkStyle(option.value)}
                className="h-4 w-4 rounded border-neutral-300 text-accent-cyan focus:ring-accent-cyan/30"
              />
              {option.label}
            </label>
          ))}
        </div>
        <FieldHint>Select any that suit you, or leave all unselected for no preference.</FieldHint>
      </fieldset>
    </div>
  );
}
