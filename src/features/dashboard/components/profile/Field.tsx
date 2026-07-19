import { ChevronDown } from 'lucide-react';
import { cn } from '@/shared/utils/cn';

const baseField =
  'w-full rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-sm text-neutral-900 placeholder:text-neutral-400 transition-colors focus:border-accent-purple focus:outline-none focus:ring-2 focus:ring-accent-purple/15';

export function Label({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-semibold text-neutral-600">
      {children}
    </label>
  );
}

export function TextField({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(baseField, className)} {...props} />;
}

export function TextArea({
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(baseField, 'min-h-[96px] resize-y', className)} {...props} />;
}

/** Marks a required field. Paired with the `required` attribute, not a substitute for it. */
export function RequiredMark() {
  return <span className="text-rose-500">*</span>;
}

/**
 * Month/year picker for CV dates.
 *
 * `type="month"` rather than a full date input: a CV never shows a day, so
 * asking for one invites an invented value the user then has to think about.
 * The browser's own picker keeps the value in `YYYY-MM`, which is exactly the
 * storage format — no parsing of typed text, and no locale ambiguity between
 * 01/02 and 02/01.
 *
 * `max` defaults to the current month because no CV date is in the future; the
 * browser enforces it, so an unreachable "start date 2032" can't be saved.
 */
export function MonthField({
  className,
  max,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type="month"
      max={max ?? currentMonth()}
      className={cn(
        baseField,
        // Without this the empty state renders as a near-invisible "mm/yyyy" in
        // full-strength text, which reads as though a value is already set.
        'disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:text-neutral-400',
        className
      )}
      {...props}
    />
  );
}

/** `YYYY-MM` for today, used as the ceiling on every profile date input. */
export function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Enum-backed select. Matches VisaStatusPicker's styling so every dropdown in
 * the profile looks the same; the placeholder greys out while nothing is chosen.
 */
export function SelectField({
  value,
  onChange,
  options,
  placeholder = 'Select…',
  className,
  ...props
}: Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'children'> & {
  options: readonly { value: string; label: string }[];
  placeholder?: string;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={onChange}
        className={cn(
          baseField,
          'appearance-none pr-9',
          !value && 'text-neutral-400',
          className
        )}
        {...props}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value} className="text-neutral-900">
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
    </div>
  );
}

/**
 * "I currently work/study here" toggle.
 *
 * Ticking it disables and clears the end date rather than writing today's date
 * into it. A stored date would silently go stale — a CV generated six months
 * later would claim the role ended six months ago — whereas a flag re-renders
 * as "Present" forever.
 */
export function PresentCheckbox({
  checked,
  onChange,
  label = 'I currently work here',
  id,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  id?: string;
}) {
  return (
    <label htmlFor={id} className="mt-2 inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-neutral-600">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-3.5 w-3.5 rounded border-neutral-300 text-accent-purple focus:ring-accent-purple/30"
      />
      {label}
    </label>
  );
}
