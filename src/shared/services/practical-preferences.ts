import { prisma } from '@/shared/lib/prisma';
import type { Prisma } from '@/generated/prisma/client';
import {
  practicalPreferencesSchema,
  type PracticalPreferencesInput,
} from '@/shared/schemas/practical-preferences';

export async function savePracticalPreferences(
  userId: string,
  input: PracticalPreferencesInput,
  client: Pick<Prisma.TransactionClient, 'profilePracticalFacts'> = prisma,
) {
  const preferences = practicalPreferencesSchema.parse(input);
  const data = {
    relocationPreference: preferences.relocationPreference,
    maxCommuteMinutes: preferences.maxCommuteMinutes,
    preferredWorkStyles: preferences.preferredWorkStyles,
  };

  return client.profilePracticalFacts.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  });
}
