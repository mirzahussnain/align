import type { SponsorRegisterMatchStatus } from '@/shared/types/job';

export const MAX_EMPLOYER_NAME_LENGTH = 256;
export const MAX_FUZZY_CANDIDATES = 100;

const LEGAL_SUFFIXES = new Set(['ltd', 'limited', 'plc', 'llp', 'llc', 'inc', 'incorporated']);
// These words do not identify an organisation by themselves. They are omitted
// only from the inverted index/scoring; they remain in the original evidence.
const LOW_INFORMATION_TOKENS = new Set([
  'company', 'companies', 'group', 'holding', 'holdings', 'service', 'services',
  'solution', 'solutions', 'international', 'uk', 'the', 'and',
]);

export interface SponsorIndexSourceRow {
  organisationName: string;
}

export interface SponsorEmployerMatch {
  status: SponsorRegisterMatchStatus;
  inputEmployerName: string;
  normalisedEmployerName: string;
  matchedOrganisationName?: string;
  candidateOrganisationNames?: string[];
  confidenceReasons: string[];
  registerVersion: string;
}

export interface SponsorIndexMetrics {
  sourceRowCount: number;
  organisationCount: number;
  exactKeyCount: number;
  tokenCount: number;
  tokenReferenceCount: number;
  buildDurationMs: number;
  heapIncreaseBytes?: number;
}

export interface SponsorIndex {
  readonly registerVersion: string;
  readonly organisationCount: number;
  readonly metrics: SponsorIndexMetrics;
  matchEmployer(employerName: string): SponsorEmployerMatch;
}

interface OrganisationMetadata {
  name: string;
  normalisedName: string;
  meaningfulTokens: readonly string[];
}

/**
 * Comparison normalisation, deliberately narrower than a generic “fuzzy”
 * cleaner. Legal suffixes at the end are safe to ignore; words such as Group
 * and Services are retained here because they can be meaningful evidence.
 */
export function standardizeSponsorOrganisationName(value: string): string {
  if (typeof value !== 'string' || !value) return '';

  let normalised: string;
  try {
    normalised = value
      .normalize('NFKD')
      .replace(/\p{M}/gu, '')
      .toLocaleLowerCase('en-GB')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim();
  } catch {
    return '';
  }

  const tokens = normalised.split(/\s+/).filter(Boolean);
  while (tokens.length && LEGAL_SUFFIXES.has(tokens[tokens.length - 1])) tokens.pop();
  return tokens.join(' ');
}

function meaningfulTokens(normalisedName: string): string[] {
  return [...new Set(normalisedName.split(' ').filter((token) =>
    token.length >= 3 && !LOW_INFORMATION_TOKENS.has(token)
  ))];
}

function isSafeEmployerName(value: string): boolean {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= MAX_EMPLOYER_NAME_LENGTH
    && !/[\u0000-\u001F\u007F-\u009F]/.test(value)
    && !/^(?:https?:\/\/|www\.)/i.test(value.trim());
}

function editSimilarity(left: string, right: string): number {
  if (left === right) return 1;
  if (!left || !right) return 0;
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let diagonal = previous[0];
    previous[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const above = previous[rightIndex];
      previous[rightIndex] = Math.min(
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + 1,
        diagonal + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
      diagonal = above;
    }
  }
  return 1 - previous[right.length] / Math.max(left.length, right.length);
}

function hasAbbreviationEvidence(inputTokens: readonly string[], organisationTokens: readonly string[]): boolean {
  return inputTokens.some((input) => organisationTokens.some((organisation) =>
    input !== organisation
    && input.length >= 3
    && (organisation.startsWith(input) || input.startsWith(organisation))
  ));
}

function none(inputEmployerName: string, normalisedEmployerName: string, registerVersion: string, reason: string): SponsorEmployerMatch {
  return { status: 'NONE', inputEmployerName, normalisedEmployerName, confidenceReasons: [reason], registerVersion };
}

class BuiltSponsorIndex implements SponsorIndex {
  readonly organisationCount: number;

  constructor(
    readonly registerVersion: string,
    private readonly exactNames: ReadonlyMap<string, readonly number[]>,
    private readonly tokenIndex: ReadonlyMap<string, readonly number[]>,
    private readonly organisations: readonly OrganisationMetadata[],
    readonly metrics: SponsorIndexMetrics,
  ) {
    this.organisationCount = organisations.length;
  }

  matchEmployer(inputEmployerName: string): SponsorEmployerMatch {
    if (!isSafeEmployerName(inputEmployerName)) {
      return none(inputEmployerName, '', this.registerVersion, 'Employer name is malformed or exceeds the allowed length.');
    }
    const normalisedEmployerName = standardizeSponsorOrganisationName(inputEmployerName);
    if (!normalisedEmployerName) {
      return none(inputEmployerName, normalisedEmployerName, this.registerVersion, 'Employer name has no usable organisation identity.');
    }

    const exact = this.exactNames.get(normalisedEmployerName);
    if (exact && exact.length >= 1) {
      return {
        status: 'EXACT', inputEmployerName, normalisedEmployerName,
        matchedOrganisationName: this.organisations[exact[0]].name,
        candidateOrganisationNames: exact.map((id) => this.organisations[id].name),
        confidenceReasons: [
          exact.length === 1
            ? 'Unique exact normalised organisation-name match.'
            : `Matched ${exact.length} entries on the sponsor register sharing normalised identity.`,
        ],
        registerVersion: this.registerVersion,
      };
    }

    const inputTokens = meaningfulTokens(normalisedEmployerName);
    if (inputTokens.length < 2) {
      return none(inputEmployerName, normalisedEmployerName, this.registerVersion, 'Employer name has fewer than two meaningful identity tokens.');
    }

    const overlap = new Map<number, number>();
    for (const token of inputTokens) {
      for (const id of this.tokenIndex.get(token) ?? []) overlap.set(id, (overlap.get(id) ?? 0) + 1);
    }
    if (!overlap.size) {
      return none(inputEmployerName, normalisedEmployerName, this.registerVersion, 'No meaningful token overlap with the sponsor register.');
    }

    const candidateIds = [...overlap.entries()]
      .sort((left, right) => right[1] - left[1] || left[0] - right[0])
      .slice(0, MAX_FUZZY_CANDIDATES)
      .map(([id]) => id);
    const candidates = candidateIds.map((id) => {
      const organisation = this.organisations[id];
      const exactOverlap = overlap.get(id) ?? 0;
      const abbreviation = hasAbbreviationEvidence(inputTokens, organisation.meaningfulTokens);
      const inputCoverage = (exactOverlap + (abbreviation ? 0.5 : 0)) / inputTokens.length;
      const organisationCoverage = (exactOverlap + (abbreviation ? 0.5 : 0)) / organisation.meaningfulTokens.length;
      const similarity = editSimilarity(normalisedEmployerName, organisation.normalisedName);
      const score = inputCoverage * 0.55 + Math.min(organisationCoverage, 1) * 0.25 + similarity * 0.2;
      return { id, organisation, exactOverlap, abbreviation, score };
    }).sort((left, right) => right.score - left.score || left.id - right.id);

    const [best, runnerUp] = candidates;
    const hasIdentityOverlap = best.exactOverlap >= 2 || (best.exactOverlap >= 1 && best.abbreviation);
    const isLikely = hasIdentityOverlap && best.score >= 0.7 && (!runnerUp || best.score - runnerUp.score >= 0.12);
    if (isLikely) {
      return {
        status: 'LIKELY', inputEmployerName, normalisedEmployerName,
        matchedOrganisationName: best.organisation.name,
        confidenceReasons: [
          `Narrowed to ${candidates.length} indexed candidates.`,
          `Meaningful-token overlap and name similarity produced a dominant score (${best.score.toFixed(2)}).`,
        ],
        registerVersion: this.registerVersion,
      };
    }

    const plausible = candidates.filter((candidate) => candidate.score >= 0.65 && candidate.exactOverlap >= 2);
    if (plausible.length > 1) {
      return {
        status: 'AMBIGUOUS', inputEmployerName, normalisedEmployerName,
        candidateOrganisationNames: candidates.slice(0, 5).map((candidate) => candidate.organisation.name),
        confidenceReasons: [
          `Narrowed to ${candidates.length} indexed candidates.`,
          'Multiple candidates share high identity overlap, but no single candidate is dominant.',
        ],
        registerVersion: this.registerVersion,
      };
    }
    return none(inputEmployerName, normalisedEmployerName, this.registerVersion, 'Narrowed candidates lack sufficient meaningful identity overlap.');
  }
}

/** Builds immutable maps once. Token postings contain organisation IDs, not repeated names. */
export function buildSponsorIndex(registerVersion: string, rows: readonly SponsorIndexSourceRow[]): SponsorIndex {
  const startedAt = performance.now();
  const heapBefore = typeof process !== 'undefined' ? process.memoryUsage().heapUsed : undefined;
  const exactNames = new Map<string, number[]>();
  const tokenIndex = new Map<string, number[]>();
  const organisations: OrganisationMetadata[] = [];
  let tokenReferenceCount = 0;

  for (const row of rows) {
    if (!row.organisationName) continue;
    const normalisedName = standardizeSponsorOrganisationName(row.organisationName);
    if (!normalisedName) continue;
    const id = organisations.length;
    const tokens = meaningfulTokens(normalisedName);
    organisations.push({ name: row.organisationName, normalisedName, meaningfulTokens: tokens });
    const exactBucket = exactNames.get(normalisedName) ?? [];
    exactBucket.push(id);
    exactNames.set(normalisedName, exactBucket);
    for (const token of tokens) {
      const posting = tokenIndex.get(token) ?? [];
      posting.push(id);
      tokenIndex.set(token, posting);
      tokenReferenceCount += 1;
    }
  }

  const heapAfter = typeof process !== 'undefined' ? process.memoryUsage().heapUsed : undefined;
  return new BuiltSponsorIndex(registerVersion, exactNames, tokenIndex, organisations, {
    sourceRowCount: rows.length,
    organisationCount: organisations.length,
    exactKeyCount: exactNames.size,
    tokenCount: tokenIndex.size,
    tokenReferenceCount,
    buildDurationMs: performance.now() - startedAt,
    ...(heapBefore !== undefined && heapAfter !== undefined ? { heapIncreaseBytes: heapAfter - heapBefore } : {}),
  });
}

/** Per-instance lifecycle: failed builds are removed so a later request can retry. */
export class SponsorIndexStore {
  private readonly ready = new Map<string, SponsorIndex>();
  private readonly building = new Map<string, Promise<SponsorIndex>>();

  getOrBuild(registerVersion: string, rows: readonly SponsorIndexSourceRow[]): Promise<SponsorIndex> {
    const existing = this.ready.get(registerVersion);
    if (existing) return Promise.resolve(existing);
    const inFlight = this.building.get(registerVersion);
    if (inFlight) return inFlight;
    const build = Promise.resolve().then(() => buildSponsorIndex(registerVersion, rows));
    this.building.set(registerVersion, build);
    return build.then((index) => {
      this.ready.set(registerVersion, index);
      return index;
    }).finally(() => this.building.delete(registerVersion));
  }
}
