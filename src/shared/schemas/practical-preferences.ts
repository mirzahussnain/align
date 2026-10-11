import { z } from 'zod';

export const RELOCATION_PREFERENCES = ['YES', 'NO', 'CONSIDER'] as const;
export const WORK_STYLE_PREFERENCES = ['REMOTE', 'HYBRID', 'ONSITE'] as const;
export const COMMUTE_MINUTES = [15, 30, 45, 60, 90] as const;

const commuteSchema = z.union([
  z.literal(15),
  z.literal(30),
  z.literal(45),
  z.literal(60),
  z.literal(90),
]);

export const practicalPreferencesSchema = z.object({
  relocationPreference: z.enum(RELOCATION_PREFERENCES).nullable().default(null),
  maxCommuteMinutes: commuteSchema.nullable().default(null),
  preferredWorkStyles: z.array(z.enum(WORK_STYLE_PREFERENCES)).default([]).superRefine((values, context) => {
    if (new Set(values).size !== values.length) {
      context.addIssue({ code: 'custom', message: 'Choose each work arrangement only once.' });
    }
  }),
});

export type PracticalPreferencesInput = z.infer<typeof practicalPreferencesSchema>;

export const EMPTY_PRACTICAL_PREFERENCES: PracticalPreferencesInput = {
  relocationPreference: null,
  maxCommuteMinutes: null,
  preferredWorkStyles: [],
};
