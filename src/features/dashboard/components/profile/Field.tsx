import { ChevronDown } from 'lucide-react';
import { cn } from '@/shared/utils/cn';

const baseField =
  'w-full rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-sm text-neutral-900 placeholder:text-neutral-400 transition-colors focus:border-accent-cyan focus:outline-none focus:ring-2 focus:ring-accent-cyan/15';

/** Field label with a single, shared convention for required vs optional. */
export function Label({
  children,
  htmlFor,
  required,
  optional,
}: {
  children: React.ReactNode;
  htmlFor?: string;
  required?: boolean;
  optional?: boolean;
}) {
  return <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-semibold text-neutral-600">{children}{required ? <RequiredMark /> : optional ? <span className="ml-1 font-normal text-neutral-400">(optional)</span> : null}</label>;
}

export function TextField({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(baseField, className)} {...props} />;
}

export function TextArea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(baseField, 'min-h-[96px] resize-y', className)} {...props} />;
}

/** Marks a required field. Paired with the input's required attribute. */
export function RequiredMark() {
  return <span className="text-rose-500" aria-hidden="true">{' '}*</span>;
}

/** Small muted helper line under a field, associated to its input via aria-describedby. */
export function FieldHint({ id, children }: { id?: string; children: React.ReactNode }) {
  return <p id={id} className="mt-1 text-[10px] text-neutral-400">{children}</p>;
}

/**
 * Precision-preserving profile-date picker. The year is always explicit and
 * the month is optional, so the control can store either `YYYY` or `YYYY-MM`
 * without inventing a month. Native selects keep this dependency-free,
 * keyboard-friendly, and consistent across browsers.
 */
const MONTH_OPTIONS = [
  ['01', 'January'], ['02', 'February'], ['03', 'March'], ['04', 'April'],
  ['05', 'May'], ['06', 'June'], ['07', 'July'], ['08', 'August'],
  ['09', 'September'], ['10', 'October'], ['11', 'November'], ['12', 'December'],
] as const;

function dateParts(value: string | readonly string[] | number | undefined) {
  const match = /^(\d{4})(?:-(0[1-9]|1[0-2]))?$/.exec(String(value ?? '').trim());
  return { year: match?.[1] ?? '', month: match?.[2] ?? '' };
}

export function MonthField({
  className,
  value,
  onChange,
  id,
  disabled,
  required,
  'aria-describedby': describedBy,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  const { year, month } = dateParts(value);
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: currentYear - 1900 + 21 }, (_, index) => String(currentYear + 20 - index));
  if (year && !years.includes(year)) years.push(year);
  years.sort((left, right) => Number(right) - Number(left));
  const emit = (nextValue: string) => onChange?.({ target: { value: nextValue }, currentTarget: { value: nextValue } } as React.ChangeEvent<HTMLInputElement>);
  const selectClass = cn(baseField, 'appearance-none pr-9 disabled:cursor-not-allowed disabled:border-neutral-200 disabled:bg-neutral-50 disabled:text-neutral-300 disabled:shadow-none');

  return (
    <div className={cn('grid grid-cols-1 gap-2 min-[360px]:grid-cols-2', className)}>
      {props.name && <input type="hidden" name={props.name} value={year ? `${year}${month ? `-${month}` : ''}` : ''} />}
      <div className="relative">
        <select
          id={id}
          value={year}
          disabled={disabled}
          required={required}
          aria-describedby={describedBy}
          aria-label={id ? undefined : "Year"}
          aria-required={required || undefined}
          onChange={(event) => emit(event.target.value ? `${event.target.value}${month ? `-${month}` : ''}` : '')}
          className={cn(selectClass, !year && 'text-neutral-400')}
        >
          <option value="">Year</option>
          {years.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
      </div>
      <div className="relative">
        <select
          id={id ? `${id}-month` : undefined}
          value={month}
          disabled={disabled || !year}
          aria-label="Month (optional)"
          onChange={(event) => emit(year ? `${year}${event.target.value ? `-${event.target.value}` : ''}` : '')}
          className={cn(selectClass, !month && 'text-neutral-400')}
        >
          <option value="">{year ? 'Month' : 'Select year first'}</option>
          {MONTH_OPTIONS.map(([option, label]) => <option key={option} value={option}>{label}</option>)}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
      </div>
    </div>
  );
}

/**
 * Classify a status-line message so a validation or server error never renders
 * in success green. Shared by every profile form so the tone is identical.
 */
export function isErrorFeedback(message: string): boolean {
  return /not found|Use the matching|Invalid|required|already exists|at least one|^Add /i.test(message);
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
        className="h-3.5 w-3.5 rounded border-neutral-300 text-accent-cyan focus:ring-accent-cyan/30"
      />
      {label}
    </label>
  );
}
