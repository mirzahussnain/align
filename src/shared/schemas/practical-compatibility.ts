import { z } from 'zod';

export const practicalCompatibilityViewModelSchema = z.object({
  items: z.array(z.object({
    category: z.enum([
      'RIGHT_TO_WORK', 'SPONSORSHIP', 'VISA_DURATION', 'LOCATION', 'RELOCATION', 'COMMUTE',
      'REMOTE_ONSITE', 'DRIVING_LICENCE', 'VEHICLE', 'DBS', 'SECURITY_CLEARANCE',
      'UK_RESIDENCY', 'PROFESSIONAL_REGISTRATION', 'SHIFT_AVAILABILITY', 'TRAVEL',
    ]),
    state: z.enum(['CONFIRMED', 'CONFLICT', 'UNKNOWN', 'NOT_APPLICABLE']),
    vacancyRequirement: z.string().optional(),
    confirmedProfileFact: z.string().optional(),
    explanation: z.string(),
    source: z.enum(['PROFILE', 'VACANCY', 'BOTH']),
  })),
  summary: z.object({
    confirmed: z.number().int().nonnegative(),
    conflicts: z.number().int().nonnegative(),
    unknown: z.number().int().nonnegative(),
    notApplicable: z.number().int().nonnegative(),
  }),
  updatableCategories: z.array(z.enum([
    'RIGHT_TO_WORK', 'SPONSORSHIP', 'VISA_DURATION', 'LOCATION', 'RELOCATION', 'COMMUTE',
    'REMOTE_ONSITE', 'DRIVING_LICENCE', 'VEHICLE', 'DBS', 'SECURITY_CLEARANCE',
    'UK_RESIDENCY', 'PROFESSIONAL_REGISTRATION', 'SHIFT_AVAILABILITY', 'TRAVEL',
  ])),
  disclaimer: z.string(),
});
