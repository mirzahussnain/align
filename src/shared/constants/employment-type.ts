/**
 * Employment types offered on a work-experience row.
 *
 * MUST stay in sync with the `EmploymentType` enum in prisma/schema.prisma —
 * the database rejects any value not listed there, so adding an option here
 * without a migration fails at save time rather than at compile time.
 *
 * Values are the enum members; labels are what the user and the CV both see.
 * Keeping the label out of the database means the wording can change without a
 * migration, and every CV re-renders with the new one.
 */
export const EMPLOYMENT_TYPES = [
  { value: 'FULL_TIME', label: 'Full-time' },
  { value: 'PART_TIME', label: 'Part-time' },
  { value: 'INTERNSHIP', label: 'Internship' },
] as const;

export type EmploymentTypeValue = (typeof EMPLOYMENT_TYPES)[number]['value'];

const LABELS: Record<string, string> = Object.fromEntries(
  EMPLOYMENT_TYPES.map((t) => [t.value, t.label])
);

/**
 * Enum member to display label. Unknown values pass through unchanged so a row
 * written before this enum existed still renders something readable instead of
 * disappearing from the CV.
 */
export function employmentTypeLabel(value: string | null | undefined): string {
  if (!value) return '';
  return LABELS[value] ?? value;
}
