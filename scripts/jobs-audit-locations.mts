/**
 * Audit persisted JobSnapshot geography against the deterministic UK classifier.
 *
 * WHY. Discover had no geographic gate before this change, so the snapshot table
 * contains whatever the verified employer boards happened to publish — US,
 * Spanish, German and Indian requisitions included. The gate now excludes them
 * from UK Discover at read time, but nobody can say HOW MANY there are, or which
 * provider contributed them, without measuring.
 *
 * WHAT IT DOES NOT DO. Nothing is deleted. Saved Jobs, historical analyses and
 * match requests reference these snapshots and must stay resolvable; a vacancy
 * being out of UK scope is a reason not to LIST it, never a reason to destroy a
 * user's record of having looked at it. `--apply` writes normalised country
 * codes onto rows the classifier is confident about, and nothing else.
 *
 * Usage:
 *   npm run jobs:audit-locations
 *   npm run jobs:audit-locations -- --apply
 */

import { prisma } from '../src/shared/lib/prisma.ts';
import { assessUkLocation, isUkDiscoverable, type UkEligibility } from '../src/shared/services/uk-location.ts';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const BATCH = 1000;

type Row = {
  id: string;
  locationText: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  workStyle: string | null;
  providerReferences: Array<{ provider: string }>;
};

const totals: Record<UkEligibility, number> = { CONFIRMED_UK: 0, LIKELY_UK: 0, NOT_UK: 0, UNKNOWN: 0 };
const byProvider = new Map<string, Record<UkEligibility | 'discoverable', number>>();
const excludedCountries = new Map<string, number>();
const unknownLocations = new Map<string, number>();
let scanned = 0;
let updated = 0;

const bump = <K,>(map: Map<K, number>, key: K) => map.set(key, (map.get(key) ?? 0) + 1);
const top = <K,>(map: Map<K, number>, count = 15) =>
  [...map].sort((a, b) => b[1] - a[1]).slice(0, count);

try {
  let cursor: string | undefined;
  for (;;) {
    const rows = (await prisma.jobSnapshot.findMany({
      take: BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: 'asc' },
      select: {
        id: true, locationText: true, city: true, region: true, country: true, workStyle: true,
        providerReferences: { select: { provider: true } },
      },
    })) as unknown as Row[];
    if (!rows.length) break;
    cursor = rows[rows.length - 1].id;

    for (const row of rows) {
      scanned += 1;
      const assessment = assessUkLocation({
        locationText: row.locationText,
        city: row.city,
        region: row.region,
        country: row.country,
        remote: row.workStyle === 'REMOTE',
      });
      totals[assessment.eligibility] += 1;

      for (const provider of new Set(row.providerReferences.map((reference) => reference.provider))) {
        const entry = byProvider.get(provider) ?? { CONFIRMED_UK: 0, LIKELY_UK: 0, NOT_UK: 0, UNKNOWN: 0, discoverable: 0 };
        entry[assessment.eligibility] += 1;
        if (isUkDiscoverable(assessment.eligibility)) entry.discoverable += 1;
        byProvider.set(provider, entry);
      }

      if (assessment.eligibility === 'NOT_UK') bump(excludedCountries, assessment.countryCode ?? 'UNSPECIFIED');
      if (assessment.eligibility === 'UNKNOWN') bump(unknownLocations, (row.locationText ?? '(no location)').slice(0, 60));

      // Only a HIGH-confidence verdict is written, and only when it differs from
      // what is stored. A MEDIUM/LIKELY verdict stays a read-time judgement — it
      // is not certain enough to become a persisted fact.
      if (apply && assessment.countryConfidence === 'HIGH' && assessment.countryCode && row.country !== assessment.countryCode) {
        await prisma.jobSnapshot.update({ where: { id: row.id }, data: { country: assessment.countryCode } });
        updated += 1;
      }
    }
  }

  const discoverable = totals.CONFIRMED_UK + totals.LIKELY_UK;
  console.log(`\nMode: ${apply ? 'APPLY (normalised country codes written)' : 'REPORT ONLY'}`);
  console.log(
    JSON.stringify(
      {
        totalSnapshots: scanned,
        confirmedUk: totals.CONFIRMED_UK,
        likelyUk: totals.LIKELY_UK,
        notUk: totals.NOT_UK,
        unknown: totals.UNKNOWN,
        admittedToUkDiscover: discoverable,
        excludedFromUkDiscover: scanned - discoverable,
        countryCodesWritten: updated,
      },
      null,
      2,
    ),
  );

  if (byProvider.size) {
    console.log('\nPer provider:');
    console.table(
      [...byProvider].map(([provider, value]) => ({
        Provider: provider,
        'Confirmed UK': value.CONFIRMED_UK,
        'Likely UK': value.LIKELY_UK,
        'Not UK': value.NOT_UK,
        Unknown: value.UNKNOWN,
        'UK jobs shown': value.discoverable,
        'Excluded': value.NOT_UK + value.UNKNOWN,
      })),
    );
  }

  if (excludedCountries.size) {
    console.log('\nTop excluded countries:');
    console.table(top(excludedCountries).map(([country, count]) => ({ Country: country, Snapshots: count })));
  }
  if (unknownLocations.size) {
    console.log('\nTop unclassifiable locations (candidates for the place list):');
    console.table(top(unknownLocations).map(([location, count]) => ({ Location: location, Snapshots: count })));
  }

  console.log('\nNo snapshots were deleted. Saved Jobs and historical analyses are unaffected.');
  if (!apply && scanned) console.log('Re-run with --apply to persist normalised country codes.');
} finally {
  await prisma.$disconnect();
}
