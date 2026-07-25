import { prisma } from '@/shared/lib/prisma';
import { normaliseSkillName } from '@/shared/utils/skill-normalization';

export type SkillTaxonomySearchResult = {
  id: string;
  externalUri: string;
  preferredLabel: string;
  matchedLabel?: string;
  description?: string;
  conceptType?: string;
  source: 'ESCO';
  sourceVersion: string;
};

const MIN_QUERY_LENGTH = 2;
const MAX_QUERY_LENGTH = 100;
const MAX_RESULTS = 20;

function rank(term: { preferredLabel: string; alternativeLabels: string[] }, query: string) {
  const preferred = normaliseSkillName(term.preferredLabel);
  const alternatives = term.alternativeLabels.map(normaliseSkillName);
  if (preferred === query) return 0;
  if (alternatives.includes(query)) return 1;
  if (preferred.startsWith(query)) return 2;
  if (alternatives.some((label) => label.startsWith(query))) return 3;
  if (preferred.split(' ').includes(query)) return 4;
  if (alternatives.some((label) => label.split(' ').includes(query))) return 5;
  return 6;
}

/** Local database search only; no browser or runtime request ever reaches ESCO. */
export async function searchLocalSkillTaxonomy(query: string, limit = 12): Promise<SkillTaxonomySearchResult[]> {
  const cleaned = normaliseSkillName(query);
  if (cleaned.length < MIN_QUERY_LENGTH) return [];
  const boundedLimit = Math.min(Math.max(limit, 1), MAX_RESULTS);
  const terms = await prisma.skillTaxonomyTerm.findMany({
    where: {
      OR: [
        { normalizedLabel: { contains: cleaned } },
        { searchText: { contains: cleaned } },
      ],
    },
    select: {
      id: true,
      externalUri: true,
      preferredLabel: true,
      alternativeLabels: true,
      description: true,
      conceptType: true,
      sourceVersion: true,
    },
    // Candidate cap keeps the expensive deterministic ranking bounded.
    take: 100,
  });

  return terms
    .map((term) => {
      const matchedAlternative = term.alternativeLabels.find(
        (label) => normaliseSkillName(label).includes(cleaned) && normaliseSkillName(label) !== normaliseSkillName(term.preferredLabel)
      );
      return {
        id: term.id,
        externalUri: term.externalUri,
        preferredLabel: term.preferredLabel,
        ...(matchedAlternative ? { matchedLabel: matchedAlternative } : {}),
        ...(term.description ? { description: term.description } : {}),
        ...(term.conceptType ? { conceptType: term.conceptType } : {}),
        source: 'ESCO' as const,
        sourceVersion: term.sourceVersion,
        _rank: rank(term, cleaned),
      };
    })
    .sort((a, b) => a._rank - b._rank || a.preferredLabel.localeCompare(b.preferredLabel, 'en-GB'))
    .slice(0, boundedLimit)
    .map((entry) => ({ id: entry.id, externalUri: entry.externalUri, preferredLabel: entry.preferredLabel, ...(entry.matchedLabel ? { matchedLabel: entry.matchedLabel } : {}), ...(entry.description ? { description: entry.description } : {}), ...(entry.conceptType ? { conceptType: entry.conceptType } : {}), source: entry.source, sourceVersion: entry.sourceVersion }));
}

export const skillTaxonomySearchLimits = { MIN_QUERY_LENGTH, MAX_QUERY_LENGTH, MAX_RESULTS };
