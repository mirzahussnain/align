/**
 * Deterministic United Kingdom location classification.
 *
 * WHY THIS EXISTS. Discover had no geographic gate at all. Aggregator scope came
 * from whatever the user typed and from Adzuna's `/gb/` base path; the
 * employer-ATS path had neither — `getAtsSnapshotProviderResults` selected every
 * ACTIVE snapshot belonging to a verified source, so a Greenhouse board's San
 * Francisco, Madrid and Bangalore requisitions entered UK Discover results
 * unchallenged. Launch scope is UK, so the gate has to be central, evidence-based
 * and applied to BOTH paths.
 *
 * NO MODEL IS INVOLVED. Classification is a pure function of stored strings. A
 * language model would be non-deterministic, unauditable and impossible to test
 * against fixtures, and geography here decides whether a user sees a job they can
 * legally take.
 *
 * THE FOUR VERDICTS ARE NOT A CONFIDENCE SCORE.
 *
 *   CONFIRMED_UK  Explicit country evidence, a UK postcode, a nation, or a city
 *                 whose name is unambiguous.
 *   LIKELY_UK     Real UK evidence weakened by something — a UK city name that
 *                 also exists abroad with no corroboration, or a remote role
 *                 whose only UK signal is the phrase "UK" in a wider string.
 *   NOT_UK        Positive evidence of somewhere else. This BEATS UK evidence:
 *                 "London, Ontario" and "Remote (US only)" are not UK jobs, and
 *                 an employer having a UK office never makes a foreign vacancy
 *                 a UK one.
 *   UNKNOWN       No usable geographic evidence either way.
 *
 * Launch Discover admits CONFIRMED_UK and LIKELY_UK; see {@link UK_DISCOVER_POLICY}.
 */

/** Policy version. Part of every search cache key so old results cannot survive it. */
export const UK_SCOPE_VERSION = 'v1';

export type UkEligibility = 'CONFIRMED_UK' | 'LIKELY_UK' | 'NOT_UK' | 'UNKNOWN';

export interface UkLocationAssessment {
  eligibility: UkEligibility;
  /** ISO-3166 alpha-2 where it could be established. `GB` for the UK. */
  countryCode?: string;
  countryConfidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
  /** Tidied single-line location, or undefined when there was nothing to tidy. */
  normalisedLocation?: string;
  /** Short machine-readable evidence codes. Safe to log — no free text. */
  evidence: string[];
}

const collapse = (value: string) => value.replace(/\s+/g, ' ').trim();

/**
 * UK postcode outward+inward, or a bare outward code.
 *
 * Deliberately anchored on word boundaries rather than the whole string, because
 * locations arrive as "Birmingham, B3 2TA" and "Leeds LS1". The outward-only form
 * requires a digit, so it cannot match an ordinary two-letter word.
 */
const UK_POSTCODE =
  /\b(?:GIR ?0AA|[A-PR-UWYZ][A-HK-Y]?\d[A-HJKPS-UW\d]?(?: ?\d[ABD-HJLNP-UW-Z]{2})?)\b/i;

/**
 * Names of the United Kingdom and its nations.
 *
 * The lookbehinds are not decoration. A UK nation's name can sit inside a
 * foreign place name, and a bare word match then reads it as an explicit
 * statement that the vacancy is British — which is exactly how every "Sydney,
 * New South Wales, Australia" requisition was admitted to UK Discover. The same
 * failure caught "New York" via York and "Northern Ireland" via Ireland.
 * Whenever a term is added here, ask what larger place name contains it.
 */
const UK_COUNTRY_PATTERN =
  /\b(?:united kingdom|great britain|england|scotland|(?<!new\s+south\s+)wales|northern ireland)\b/i;

/**
 * UK cities and regions whose names are unambiguous in a job-location field.
 *
 * Names that exist prominently elsewhere are NOT here — they go in
 * {@link AMBIGUOUS_UK_PLACES}, so "Birmingham, AL" cannot be admitted as
 * Birmingham, West Midlands on the strength of the city name alone.
 */
const UNAMBIGUOUS_UK_PLACES = [
  'aberdeen', 'basingstoke', 'bath', 'belfast', 'blackpool', 'bolton', 'bournemouth',
  'bradford', 'brighton', 'bristol', 'caernarfon', 'cambridge', 'canterbury', 'cardiff',
  'carlisle', 'chelmsford', 'cheltenham', 'chester', 'colchester', 'coventry', 'crawley',
  'derby', 'doncaster', 'dundee', 'dunfermline', 'durham', 'eastbourne', 'edinburgh',
  'exeter', 'gateshead', 'glasgow', 'gloucester', 'guildford', 'harrogate', 'huddersfield',
  'hull', 'inverness', 'ipswich', 'leeds', 'leicester', 'lincoln', 'liverpool', 'luton',
  'maidstone', 'middlesbrough', 'milton keynes', 'newcastle upon tyne', 'newport',
  'northampton', 'norwich', 'nottingham', 'oldham', 'oxford', 'peterborough', 'plymouth',
  'portsmouth', 'preston', 'reading', 'rotherham', 'salford', 'scunthorpe', 'sheffield',
  'shrewsbury', 'slough', 'solihull', 'southampton', 'southend-on-sea', 'st albans',
  'stevenage', 'stockport', 'stoke-on-trent', 'sunderland', 'swansea', 'swindon',
  'telford', 'wakefield', 'walsall', 'warrington', 'watford', 'wigan', 'winchester',
  'wolverhampton', 'worcester', 'wrexham', 'york',
  // Regions and counties.
  'west midlands', 'greater manchester', 'merseyside', 'west yorkshire', 'south yorkshire',
  'tyne and wear', 'east midlands', 'east anglia', 'home counties', 'south east england',
  'south west england', 'north east england', 'north west england', 'yorkshire',
  'berkshire', 'buckinghamshire', 'cambridgeshire', 'cheshire', 'cornwall', 'cumbria',
  'derbyshire', 'devon', 'dorset', 'essex', 'gloucestershire', 'hampshire',
  'hertfordshire', 'kent', 'lancashire', 'leicestershire', 'lincolnshire', 'norfolk',
  'northamptonshire', 'nottinghamshire', 'oxfordshire', 'shropshire', 'somerset',
  'staffordshire', 'suffolk', 'surrey', 'sussex', 'warwickshire', 'wiltshire',
  'worcestershire',
];

/**
 * UK place names that also name a prominent place abroad.
 *
 * These give LIKELY_UK on their own and CONFIRMED_UK only with corroboration
 * (an explicit country term, a postcode, or a UK county alongside).
 */
const AMBIGUOUS_UK_PLACES = [
  'london',      // London, Ontario
  'birmingham',  // Birmingham, Alabama
  'manchester',  // Manchester, New Hampshire
  'newcastle',   // Newcastle, NSW
  'cambridge',   // Cambridge, Massachusetts — also listed above; ambiguity wins
  'richmond',
  'windsor',
  'perth',
  'hamilton',
  'boston',
  'lincoln',
  'bangor',
  'halifax',
];

/**
 * Positive evidence of a country that is NOT the UK.
 *
 * The US state list is the two-letter postal abbreviations in the trailing
 * "City, ST" position only, because bare two-letter tokens are far too easy to
 * match by accident inside ordinary words.
 */
const NON_UK_COUNTRY_TERMS: ReadonlyArray<[string, RegExp]> = [
  // US state names and prominent US cities, not just the country name.
  //
  // These are here because of a measured false positive, not for completeness:
  // "New York" contains "York", and York is a UK city, so a bare word match
  // classified every New York requisition as CONFIRMED_UK. Naming the US places
  // explicitly — and checking them BEFORE any UK place name — is what stops a
  // UK city name embedded in a foreign one from carrying the decision.
  [
    'US',
    /\b(?:usa|u\.s\.a\.|united states|u\.s\.|new york|san francisco|los angeles|silicon valley|bay area|mountain view|palo alto|bellevue|seattle|chicago|boston|austin|denver|atlanta|dallas|houston|philadelphia|phoenix|san diego|san jose|st\.? louis|washington,? d\.?c\.?)\b/i,
  ],
  [
    'US',
    /\b(?:alabama|alaska|arizona|arkansas|california|colorado|connecticut|delaware|florida|georgia|hawaii|idaho|illinois|indiana|iowa|kansas|kentucky|louisiana|maryland|massachusetts|michigan|minnesota|mississippi|missouri|montana|nebraska|nevada|new hampshire|new jersey|new mexico|north carolina|north dakota|ohio|oklahoma|oregon|pennsylvania|rhode island|south carolina|south dakota|tennessee|texas|utah|vermont|virginia|wisconsin|wyoming)\b/i,
  ],
  ['CA', /\b(?:canada|ontario|quebec|british columbia|alberta|toronto|vancouver|montreal|ottawa|calgary)\b/i],
  // "Northern Ireland" is part of the United Kingdom and must not be caught by
  // the Republic of Ireland exclusion. The lookbehind is what separates them;
  // without it every Belfast vacancy was rejected as Irish.
  ['IE', /\b(?<!northern\s)ireland\b|\beire\b/i],
  ['ES', /\b(?:spain|españa|madrid|barcelona|valencia|seville)\b/i],
  ['DE', /\b(?:germany|deutschland|berlin|munich|münchen|hamburg|frankfurt)\b/i],
  ['FR', /\b(?:france|paris|lyon|marseille|toulouse)\b/i],
  ['NL', /\b(?:netherlands|holland|amsterdam|rotterdam|utrecht)\b/i],
  ['IN', /\b(?:india|bangalore|bengaluru|mumbai|delhi|hyderabad|pune|chennai)\b/i],
  ['AU', /\b(?:australia|sydney|melbourne|brisbane)\b/i],
  ['NZ', /\bnew zealand\b/i],
  ['SG', /\bsingapore\b/i],
  ['AE', /\b(?:united arab emirates|dubai|abu dhabi)\b/i],
  ['PL', /\b(?:poland|warsaw|krakow|kraków|wroclaw)\b/i],
  ['PT', /\b(?:portugal|lisbon|lisboa|porto)\b/i],
  ['IT', /\b(?:italy|italia|rome|roma|milan|milano)\b/i],
  ['SE', /\b(?:sweden|stockholm)\b/i],
  ['CH', /\b(?:switzerland|zurich|zürich|geneva)\b/i],
  ['JP', /\b(?:japan|tokyo)\b/i],
  ['BR', /\b(?:brazil|brasil|são paulo|sao paulo)\b/i],
  ['ZA', /\b(?:south africa|johannesburg|cape town)\b/i],
  ['MX', /\bmexico\b/i],
  ['PH', /\b(?:philippines|manila)\b/i],
  ['NG', /\b(?:nigeria|lagos)\b/i],
];

const US_STATE_SUFFIX =
  /,\s*(?:AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|MA|MD|ME|MI|MN|MO|MS|MT|NC|ND|NE|NH|NJ|NM|NV|NY|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VA|VT|WA|WI|WV|WY|DC)\b(?:\s*,\s*(?:USA?|United States))?\s*$/;

/** A remote role explicitly fenced to somewhere that is not the UK. */
const REMOTE_RESTRICTED_ELSEWHERE =
  /\bremote\b[^.]{0,40}\b(?:us|usa|united states|canada|emea only|eu only|europe only|india|australia)\s*(?:only|based|-\s*based)?\b/i;

/** A remote role that explicitly admits UK candidates. */
const REMOTE_UK =
  /\b(?:remote|home[- ]based|work from home|anywhere)\b[^.]{0,30}\b(?:uk|u\.k\.|united kingdom|gb|great britain|england|scotland|wales)\b|\b(?:uk|united kingdom)[^.]{0,20}\bremote\b/i;

const wordRegex = (term: string) =>
  new RegExp(`(?:^|[^\\p{L}])${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:[^\\p{L}]|$)`, 'iu');

/**
 * Classify a vacancy's geography from whatever location evidence exists.
 *
 * Every input is optional. More evidence can only make the verdict stronger or
 * turn it NOT_UK; nothing here invents a country from an employer's head office,
 * because "the employer has a UK office" is not evidence about THIS vacancy.
 */
export function assessUkLocation(input: {
  locationText?: string | null;
  city?: string | null;
  region?: string | null;
  /** Persisted country field. Free-form in this schema, so it is parsed not trusted. */
  country?: string | null;
  /** Provider-declared country metadata, where the adapter has one. */
  providerCountryCode?: string | null;
  /** Whether the vacancy is remote, from structured metadata rather than text. */
  remote?: boolean;
  /** Curated source scope, e.g. an employer board known to be UK-specific. */
  curatedUkSource?: boolean;
}): UkLocationAssessment {
  const parts = [input.locationText, input.city, input.region, input.country]
    .map((value) => collapse(value ?? ''))
    .filter(Boolean);
  const haystack = parts.join(', ');
  const normalisedLocation = collapse(input.locationText ?? parts[0] ?? '') || undefined;
  const evidence: string[] = [];

  // ── Negative evidence first. It overrides UK signals by design. ───────────
  const providerCountry = collapse(input.providerCountryCode ?? '').toUpperCase();
  if (providerCountry && !['GB', 'UK', 'GBR'].includes(providerCountry)) {
    return {
      eligibility: 'NOT_UK',
      countryCode: providerCountry.slice(0, 2),
      countryConfidence: 'HIGH',
      ...(normalisedLocation ? { normalisedLocation } : {}),
      evidence: ['provider_country_not_gb'],
    };
  }

  // ── Strong, explicit UK evidence outranks a foreign place name ───────────
  // A location that NAMES the United Kingdom, one of its nations, or carries a
  // UK postcode is stating where the vacancy is. That has to be checked before
  // the foreign-place list, or a legitimate UK entry that happens to share a
  // name with somewhere abroad — Washington in Tyne and Wear, Boston in
  // Lincolnshire — is rejected on the strength of the foreign namesake. It
  // deliberately does NOT outrank explicit provider country metadata, which is
  // structured data about this vacancy rather than a string that mentions a place.
  const explicitCountry =
    ['GB', 'UK', 'GBR'].includes(providerCountry) ||
    ['GB', 'UK', 'GBR', 'UNITED KINGDOM'].includes(collapse(input.country ?? '').toUpperCase()) ||
    UK_COUNTRY_PATTERN.test(haystack) ||
    /\b(?:uk|u\.k\.|gb)\b/i.test(haystack);
  const postcode = UK_POSTCODE.test(haystack) && /\d/.test(haystack);

  if (explicitCountry || postcode) {
    if (explicitCountry) evidence.push('explicit_uk_country');
    if (postcode) evidence.push('uk_postcode');
    return {
      eligibility: 'CONFIRMED_UK',
      countryCode: 'GB',
      countryConfidence: 'HIGH',
      ...(normalisedLocation ? { normalisedLocation } : {}),
      evidence,
    };
  }

  if (haystack) {
    if (US_STATE_SUFFIX.test(haystack)) {
      return {
        eligibility: 'NOT_UK',
        countryCode: 'US',
        countryConfidence: 'HIGH',
        ...(normalisedLocation ? { normalisedLocation } : {}),
        evidence: ['us_state_suffix'],
      };
    }
    for (const [code, pattern] of NON_UK_COUNTRY_TERMS) {
      if (pattern.test(haystack)) {
        return {
          eligibility: 'NOT_UK',
          countryCode: code,
          countryConfidence: 'HIGH',
          ...(normalisedLocation ? { normalisedLocation } : {}),
          evidence: [`non_uk_country:${code}`],
        };
      }
    }
    if (REMOTE_RESTRICTED_ELSEWHERE.test(haystack)) {
      return {
        eligibility: 'NOT_UK',
        countryConfidence: 'MEDIUM',
        ...(normalisedLocation ? { normalisedLocation } : {}),
        evidence: ['remote_restricted_elsewhere'],
      };
    }
  }

  // ── Weaker UK evidence: place names, with nothing foreign to contradict it ──
  const unambiguousPlace = UNAMBIGUOUS_UK_PLACES.find(
    (place) => !AMBIGUOUS_UK_PLACES.includes(place) && wordRegex(place).test(haystack),
  );
  if (unambiguousPlace) evidence.push('unambiguous_uk_place');

  const ambiguousPlace = AMBIGUOUS_UK_PLACES.find((place) => wordRegex(place).test(haystack));
  if (ambiguousPlace) evidence.push('ambiguous_uk_place');

  const remoteUk = REMOTE_UK.test(haystack);
  if (remoteUk) evidence.push('remote_uk');

  if (input.curatedUkSource) evidence.push('curated_uk_source');

  if (unambiguousPlace || remoteUk) {
    return {
      eligibility: 'CONFIRMED_UK',
      countryCode: 'GB',
      countryConfidence: 'HIGH',
      ...(normalisedLocation ? { normalisedLocation } : {}),
      evidence,
    };
  }

  // An ambiguous city with no corroboration, or a curated-UK source whose
  // vacancy says nothing about location. Real evidence, not conclusive.
  if (ambiguousPlace || (input.curatedUkSource && !haystack)) {
    return {
      eligibility: 'LIKELY_UK',
      countryCode: 'GB',
      countryConfidence: 'MEDIUM',
      ...(normalisedLocation ? { normalisedLocation } : {}),
      evidence,
    };
  }

  // A remote role with no country evidence at all is UNKNOWN, not UK. "Remote"
  // by itself says where the desk is, not which labour market it serves.
  return {
    eligibility: 'UNKNOWN',
    countryConfidence: 'NONE',
    ...(normalisedLocation ? { normalisedLocation } : {}),
    evidence: input.remote ? ['remote_without_country'] : [],
  };
}

/**
 * Launch policy for Discover and the Companies directory.
 *
 * UNKNOWN is excluded. It is the largest bucket in an unfiltered global ATS
 * catalogue and admitting it would defeat the whole gate.
 */
export const UK_DISCOVER_POLICY = {
  admitted: ['CONFIRMED_UK', 'LIKELY_UK'] as const,
} as const;

export function isUkDiscoverable(eligibility: UkEligibility): boolean {
  return (UK_DISCOVER_POLICY.admitted as readonly UkEligibility[]).includes(eligibility);
}
