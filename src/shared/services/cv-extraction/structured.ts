import { findDateRange } from './dates';
import {
  firstHeadingLine,
  headingAt,
  linesForSection,
  sectionCv,
  type CvSectionId,
  type SectionedCv,
} from './sections';
import { sourceExcerpt } from './text';
import { normalisePhone, looksLikePhone } from '@/shared/utils/phone';
import {
  classifyLinkUrl,
  findUrlsInText,
  findWrittenHandles,
  labelClaimsPersonalSite,
  labelSuggestsLiveSite,
  labelSuggestsRepository,
  mergeLinks,
  type ExtractedLink,
} from './links';
import {
  emptyExtractionPayload,
  CV_EXTRACTION_SCHEMA_VERSION,
  CvExtractionPayloadSchema,
  type CvExtractionPayload,
  type ExtractedCredential,
  type ExtractedEducation,
  type ExtractedExperience,
  type ExtractedIdentity,
  type ExtractedLanguage,
  type ExtractedProject,
  type ExtractedSkill,
  type ExtractedTraining,
  type ExtractedVolunteering,
} from './types';

/**
 * Deterministic structured reading of a CV.
 *
 * The contract is narrow on purpose: this reads what the document says and
 * nothing else. It never infers an employer from a job title, never fills a
 * missing end date, never promotes a skill to a proficiency level, and never
 * decides that a role is current because no leaving date was written. Anything
 * it cannot read is simply absent, and the import review is where the user
 * supplies it.
 *
 * It is also entirely offline. No model is called here — extraction must be free
 * and unmetered, so a user out of AI quota can still import their CV.
 */

export const CV_PARSER_VERSION = `cv-extract@1.${CV_EXTRACTION_SCHEMA_VERSION}`;

const BULLET = /^[-*•▪◦●·‣–—]\s+/;
const EMAIL = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
const LINKEDIN = /(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/in\/[a-zA-Z0-9_%-]+/i;
const GITHUB = /(?:https?:\/\/)?(?:www\.)?github\.com\/[a-zA-Z0-9_-]+/i;
const URL = /https?:\/\/[^\s,;]+|www\.[^\s,;]+/i;
const PHONE = /(?:\+\d{1,3}[\s-]?)?\(?\d[\d\s()-]{7,16}\d/;

/** Separators a CV uses between a role and an employer on one line. */
const ROLE_COMPANY_SPLIT = /\s+(?:at|@|with|for)\s+|\s*[|·•]\s*|\s+[–—]\s+|\s+-\s+|,\s+/;

function stripBullet(text: string): string {
  return text.replace(BULLET, '').trim();
}

/** Trim the connective debris left after a date range is cut out of a line. */
function tidy(fragment: string): string {
  return fragment
    .replace(/[|·•]/g, ' ')
    .replace(/^[\s,;:–—-]+|[\s,;:–—-]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// ── Identity ─────────────────────────────────────────────────────────────────

/**
 * Does this line look like a person's name?
 *
 * Kept strict: two to five words, letters (plus the apostrophes and hyphens real
 * names contain), no digits, no punctuation that belongs to an address or a job
 * title. A false positive here puts a company name into the user's identity and
 * proposes overwriting their account name with it.
 */
function looksLikeName(text: string): boolean {
  if (text.length > 60) return false;
  if (/[0-9@|/\\]/.test(text)) return false;
  const words = text.split(/\s+/);
  if (words.length < 2 || words.length > 5) return false;
  return words.every((word) => /^[\p{L}][\p{L}'’.-]*$/u.test(word));
}

/**
 * A location line: place names separated by commas, with no contact tokens.
 * Free text throughout — the parser proposes what the CV wrote and never splits
 * it into city/state/country, which is the structured pickers' job.
 */
function looksLikeLocation(text: string): boolean {
  if (text.length > 80) return false;
  if (EMAIL.test(text) || URL.test(text) || /\d{4}/.test(text)) return false;
  return /,/.test(text) && /^[\p{L}\s,'’.-]+$/u.test(text);
}

/**
 * Country names and codes a CV's contact block writes, mapped to ISO2.
 *
 * Deliberately tiny and explicit. This exists for one purpose — giving
 * libphonenumber a country when a CV writes a national-format number like
 * "07737 853800" — and a wrong entry here silently attaches the wrong dialling
 * code to a real person's phone. Only unambiguous, self-declared wording counts;
 * a city name never does, because "Birmingham" is in England and in Alabama.
 */
const COUNTRY_SIGNALS: { pattern: RegExp; iso2: string }[] = [
  { pattern: /\b(united kingdom|u\.?k\.?|great britain|england|scotland|wales)\b/i, iso2: 'GB' },
  { pattern: /\b(northern ireland)\b/i, iso2: 'GB' },
  { pattern: /\b(republic of ireland|ireland)\b/i, iso2: 'IE' },
  { pattern: /\b(united states|u\.?s\.?a\.?|usa)\b/i, iso2: 'US' },
  { pattern: /\b(canada)\b/i, iso2: 'CA' },
  { pattern: /\b(australia)\b/i, iso2: 'AU' },
  { pattern: /\b(new zealand)\b/i, iso2: 'NZ' },
  { pattern: /\b(pakistan)\b/i, iso2: 'PK' },
  { pattern: /\b(india)\b/i, iso2: 'IN' },
  { pattern: /\b(nigeria)\b/i, iso2: 'NG' },
  { pattern: /\b(south africa)\b/i, iso2: 'ZA' },
  { pattern: /\b(germany|deutschland)\b/i, iso2: 'DE' },
  { pattern: /\b(france)\b/i, iso2: 'FR' },
  { pattern: /\b(spain)\b/i, iso2: 'ES' },
  { pattern: /\b(italy)\b/i, iso2: 'IT' },
  { pattern: /\b(netherlands)\b/i, iso2: 'NL' },
  { pattern: /\b(poland)\b/i, iso2: 'PL' },
  { pattern: /\b(united arab emirates|uae)\b/i, iso2: 'AE' },
];

/** The country the contact block states, if it states one at all. */
function countrySignal(head: SectionedCv['head']): string | undefined {
  const joined = head.map((entry) => entry.text).join(' | ');
  return COUNTRY_SIGNALS.find((signal) => signal.pattern.test(joined))?.iso2;
}

/**
 * Split a written phone into the stored contract, or leave it whole.
 *
 * A number that states its own dial code needs nothing from us. One that does
 * not is only split when the CV itself named a country — otherwise the raw text
 * is all that is recorded and the review step asks. Putting "+44" in front of
 * "07737 853800" because most of our users are British would be a guess written
 * into a field the user then sends to employers.
 */
function readPhone(raw: string, country: string | undefined): Partial<ExtractedIdentity> {
  const phone = raw.trim();
  if (!phone) return {};
  const normalised = normalisePhone(phone, country);
  if (!normalised) return { phone };
  return {
    phone,
    phoneDialCode: normalised.dialCode,
    phoneNumber: normalised.nationalNumber,
    ...(normalised.country ? { phoneCountry: normalised.country } : {}),
  };
}

/**
 * Identity read from the contact block, plus the links that point at the person.
 *
 * Links are the reason this takes more than the head TEXT. On the CV that
 * prompted this work the contact line reads
 * "… | github/mirzahussnain | linkedIn/hussnainali-dev | hussnainali.me" — not one
 * of those is a URL, and all three are hyperlinks whose real addresses live in
 * the PDF's annotations. Matching the visible text would have found nothing;
 * matching the resolved targets finds all three.
 */
function readIdentity(
  head: SectionedCv['head'],
  contactLinks: ExtractedLink[]
): {
  identity: ExtractedIdentity;
  headline?: string;
  derivedIdentity: { field: 'linkedin' | 'github' | 'website'; writtenAs: string }[];
} {
  const identity: ExtractedIdentity = {};
  const derivedIdentity: { field: 'linkedin' | 'github' | 'website'; writtenAs: string }[] = [];
  let headline: string | undefined;

  const joined = head.map((entry) => entry.text).join('\n');
  const email = EMAIL.exec(joined)?.[0];
  if (email) identity.email = email;

  for (const link of contactLinks) {
    const kind = classifyLinkUrl(link.url);
    if (kind === 'linkedin_profile' && !identity.linkedin) identity.linkedin = link.url;
    else if (kind === 'github_profile' && !identity.github) identity.github = link.url;
    else if (kind === 'email' && !identity.email) identity.email = link.url.replace(/^mailto:/, '');
    else if (kind === 'web' && !identity.website) identity.website = link.url;
  }

  // Fall back to a LinkedIn or GitHub address written out in the text. Only
  // reached when no hyperlink supplied one, so a document that both prints and
  // links its profile resolves to the linked address.
  if (!identity.linkedin) {
    const written = LINKEDIN.exec(joined)?.[0];
    if (written) identity.linkedin = written;
  }
  if (!identity.github) {
    const written = GITHUB.exec(joined)?.[0];
    if (written) identity.github = written;
  }

  // Last resort: a handle written as a label with no address anywhere. The URL
  // this implies is recorded as DERIVED, so the import layer can ask the user to
  // check it rather than presenting it as something the document said.
  for (const written of findWrittenHandles(joined)) {
    const field = written.platform === 'linkedin' ? 'linkedin' : 'github';
    if (identity[field]) continue;
    identity[field] = written.derivedUrl;
    derivedIdentity.push({ field, writtenAs: written.writtenAs });
  }

  const country = countrySignal(head);

  // Emails and URLs are CUT OUT of the line before a phone is looked for, rather
  // than the line being skipped. Skipping was the old rule and it was too blunt:
  // "priya@example.com | +44 (0)7700 900456" is the single most common contact
  // layout there is, and a CV that used it extracted with no phone at all. What
  // the old rule was protecting against — an address's postcode or a URL's digits
  // matching a phone shape — is handled by removing those spans, not the line.
  for (const entry of head) {
    const stripped = entry.text.replace(new RegExp(EMAIL, 'g'), ' ').replace(new RegExp(URL, 'gi'), ' ');
    const phone = PHONE.exec(stripped)?.[0];
    if (phone && phone.replace(/\D/g, '').length >= 9 && looksLikePhone(phone.trim())) {
      Object.assign(identity, readPhone(phone.trim(), country));
      break;
    }
  }

  for (const [position, entry] of head.entries()) {
    if (!identity.fullName && looksLikeName(entry.text)) {
      identity.fullName = entry.text;
      // The line under the name, when it is not contact details or a location,
      // is the candidate's own headline. It is NOT filtered by `looksLikeName`:
      // "Software Engineer" and "Registered Nurse" are shape-identical to a
      // person's name, and a CV does not carry a second name — whatever sits
      // there is a headline. A location IS excluded, because "Manchester, United
      // Kingdom" sits on that line on countless CVs and is a place, not a pitch.
      const next = head[position + 1]?.text;
      if (
        next &&
        !looksLikeLocation(next) &&
        !EMAIL.test(next) &&
        !URL.test(next) &&
        !PHONE.test(next) &&
        next.length <= 120
      ) {
        headline = next;
      }
      continue;
    }
    if (!identity.location && looksLikeLocation(entry.text)) identity.location = entry.text;
  }

  return { identity, ...(headline ? { headline } : {}), derivedIdentity };
}

// ── Dated entries (experience, projects, volunteering) ───────────────────────

interface DatedEntry {
  /** The heading text of the entry, with any date range removed. */
  title: string;
  company?: string;
  startDate: string | null;
  endDate: string | null;
  current: boolean;
  achievements: string[];
  line: number;
  excerpt: string;
}

/**
 * Walk a section that is a list of dated entries with detail lines under them.
 *
 * The date line anchors an entry, because it is the one element CVs are
 * consistent about. Everything else is layout: the role and employer may share
 * that line, sit on the line above, or straddle both.
 *
 * Undated lines are BUFFERED rather than classified immediately, because what
 * they are only becomes clear from what follows. A line before a dated line is
 * that entry's heading; the same line with nothing after it is the previous
 * entry's detail. Deciding on sight would need a bullet character to lean on,
 * and real CVs frequently have none — Word's own list formatting is a paragraph
 * property, so a bulleted CV extracts as plain lines and every achievement would
 * be lost.
 */
function readDatedEntries(lines: { index: number; text: string }[]): DatedEntry[] {
  const entries: DatedEntry[] = [];
  /** Undated lines seen since the last dated line, awaiting classification. */
  let buffer: { index: number; text: string }[] = [];

  /** Detail lines belong to the entry that is currently open. */
  const flushToAchievements = (pending: { index: number; text: string }[]) => {
    const open = entries[entries.length - 1];
    if (!open) return;
    for (const { text } of pending) {
      const detail = stripBullet(text);
      // An employer or institution sitting on its own line right under the
      // header is not a detail line — it completes the header.
      //
      // That line is frequently the rest of the entry all at once:
      //   "Ulster University, UK · Distinction — machine learning, data engineering"
      // so it is divided on its list separators FIRST and only the leading
      // segment becomes the institution. Taking it whole was the old behaviour
      // and it failed twice over: past 80 characters the line fell through as an
      // achievement and the entry was raised as MISSING_REQUIRED_FIELD on a CV
      // that plainly names an institution, and under 80 it was kept whole with
      // the separator flattened to a space — "Ulster University, UK Distinction".
      //
      // Splitting is safe because of what the separator means: CVs use "·" and
      // "|" to divide distinct facts, and they do not write achievements that
      // way — those are bullets or prose, and prose is caught by the full stop.
      if (!open.company && open.achievements.length === 0) {
        const [first, ...rest] = splitListSegments(detail);
        if (first && first.length <= 80 && !/[.!?]$/.test(first)) {
          open.company = tidy(first);
          for (const segment of rest) {
            const remainder = tidy(segment);
            if (remainder) open.achievements.push(remainder);
          }
          continue;
        }
      }

      if (detail) open.achievements.push(detail);
    }
  };

  for (const { index, text } of lines) {
    const dates = findDateRange(text);
    if (!dates) {
      buffer.push({ index, text });
      continue;
    }

    const remainder = tidy(text.replace(dates.matched, ' '));
    // With text of its own the dated line IS the header, so everything buffered
    // belongs to the entry above. Without it, the last buffered line is the
    // header and the rest are the previous entry's details.
    const heading = remainder ? null : buffer[buffer.length - 1] ?? null;
    flushToAchievements(heading ? buffer.slice(0, -1) : buffer);
    buffer = [];

    const source = remainder || heading?.text || '';
    const [title, company] = splitRoleAndCompany(source);

    if (!title) {
      // A date with nothing attached: give it to the open entry if that entry
      // has no dates yet, rather than inventing an entry with no name.
      const open = entries[entries.length - 1];
      if (open && !open.startDate) {
        open.startDate = dates.start;
        open.endDate = dates.end;
        open.current = dates.current;
      }
      continue;
    }

    entries.push({
      title,
      ...(company ? { company } : {}),
      startDate: dates.start,
      endDate: dates.end,
      current: dates.current,
      achievements: [],
      line: remainder ? index : heading?.index ?? index,
      excerpt: sourceExcerpt(remainder ? text : `${source} ${text}`),
    });
  }

  // Anything still buffered at the end of the section has nothing after it to
  // make it a heading, so it is the last entry's detail.
  flushToAchievements(buffer);
  return entries;
}

/**
 * Split a line on the separators a CV uses to divide distinct facts.
 *
 * Only the middle-dot family and the pipe count. A comma does NOT: "Ulster
 * University, UK" is one fact wearing a comma, and splitting on it would file
 * the country as a separate claim.
 */
function splitListSegments(text: string): string[] {
  return text
    .split(/\s+[|·•▪]\s+/)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

/** "Staff Nurse at Royal Free" → ["Staff Nurse", "Royal Free"]. */
function splitRoleAndCompany(source: string): [string, string | undefined] {
  const cleaned = tidy(source);
  if (!cleaned) return ['', undefined];
  const parts = cleaned.split(ROLE_COMPANY_SPLIT).map(tidy).filter(Boolean);
  if (parts.length <= 1) return [cleaned, undefined];
  return [parts[0], parts.slice(1).join(', ')];
}

// ── Section readers ──────────────────────────────────────────────────────────

function locate(sectioned: SectionedCv, line: number) {
  const section = headingAt(sectioned, line);
  return { line, ...(section ? { section } : {}) };
}

function readExperience(sectioned: SectionedCv): ExtractedExperience[] {
  return readDatedEntries(linesForSection(sectioned, 'experience')).map((entry) => ({
    jobTitle: entry.title,
    ...(entry.company ? { company: entry.company } : {}),
    startDate: entry.startDate,
    endDate: entry.endDate,
    current: entry.current,
    achievements: entry.achievements,
    excerpt: entry.excerpt,
    sourceLocation: locate(sectioned, entry.line),
  }));
}

/**
 * A classification, exactly as awarding bodies write them.
 *
 * `Education.grade` is a short label — the profile form's own examples are
 * "Distinction, First Class, 2:1, 3.8/4.0, 85%, Pass" — so this vocabulary is
 * closed and the match must cover a WHOLE fragment. Matching a prefix would read
 * "Passed all modules in the first year" as a grade of "Passed", and a grade is
 * a claim about an award that either was or was not made.
 */
const GRADE_FRAGMENT = new RegExp(
  '^(?:' +
    [
      'distinction', 'merit', 'credit', 'pass', 'fail',
      '(?:first|second|third|upper second|lower second)(?: class)?(?: (?:honours|honors|hons\\.?))?',
      '(?:1st|2nd|3rd)(?: class)?(?: (?:honours|honors|hons\\.?))?',
      '2[:.][12]', 'first', 'honou?rs',
      '(?:summa |magna )?cum laude',
      // "GPA 3.82/4.0", "3.82/4.0 GPA", "3.82/4.0", "3.82 GPA"
      'gpa[:\\s]*\\d(?:\\.\\d+)?(?:\\s*/\\s*\\d(?:\\.\\d+)?)?',
      '\\d(?:\\.\\d+)?\\s*/\\s*\\d(?:\\.\\d+)?(?:\\s*gpa)?',
      '\\d(?:\\.\\d+)?\\s*gpa',
      '\\d{1,3}(?:\\.\\d+)?\\s*%',
      'grade[:\\s]+[a-z0-9+*-]{1,4}',
    ].join('|') +
    ')$',
  'i'
);

/** Where one stated fact ends and the next begins inside a detail line. */
const FRAGMENT_BOUNDARY = /[,;]|\s[–—-]\s/;

/**
 * Peel any leading classification off a detail line.
 *
 * "First Class Honours, 3.82/4.0 GPA" is two grade fragments and no description;
 * "Distinction — machine learning, data engineering" is one of each. The
 * remainder is returned with its own punctuation intact, so what is not a grade
 * reads exactly as the CV wrote it.
 */
function splitGrade(text: string): { grade?: string; rest: string } {
  const grades: string[] = [];
  let rest = text.trim();
  while (rest) {
    const boundary = FRAGMENT_BOUNDARY.exec(rest);
    const fragment = (boundary ? rest.slice(0, boundary.index) : rest).trim();
    if (!fragment || !GRADE_FRAGMENT.test(fragment)) break;
    grades.push(fragment);
    rest = boundary ? rest.slice(boundary.index + boundary[0].length).trim() : '';
  }
  return { ...(grades.length ? { grade: grades.join(', ') } : {}), rest };
}

function readEducation(sectioned: SectionedCv): ExtractedEducation[] {
  return readDatedEntries(linesForSection(sectioned, 'education')).map((entry) => {
    // Only the FIRST detail is considered. That is the segment that came off the
    // institution line, where a classification is written; a grade appearing
    // three bullets down is part of a sentence, not the award.
    const [first, ...others] = entry.achievements;
    const { grade, rest } = first ? splitGrade(first) : { grade: undefined, rest: '' };
    const description = [rest, ...others].filter(Boolean).join(' ');

    return {
      degree: entry.title,
      ...(entry.company ? { university: entry.company } : {}),
      startDate: entry.startDate,
      endDate: entry.endDate,
      current: entry.current,
      ...(grade ? { grade } : {}),
      ...(description ? { description } : {}),
      excerpt: entry.excerpt,
      sourceLocation: locate(sectioned, entry.line),
    };
  });
}

/**
 * Projects, which are the section that breaks every assumption the dated-entry
 * walker makes.
 *
 * `readDatedEntries` anchors on a date line, and that is right for employment —
 * a job without dates is unusual. A project without dates is the NORM: side
 * projects, coursework and portfolio pieces routinely carry a name, a technology
 * list and a link, and nothing else. Running them through the dated walker
 * produced zero candidates from a CV whose "KEY PROJECTS" section was plainly
 * there, which is the defect this reader replaces.
 *
 * Here a project is anchored by a HEADING line instead: an unbulleted line that
 * is not obviously a continuation of the one above it. Dates are read out of that
 * line when present and left null when not — never inferred.
 */
function readProjects(sectioned: SectionedCv, links: ExtractedLink[]): ExtractedProject[] {
  const projects: ExtractedProject[] = [];
  const sectionLines = linesForSection(sectioned, 'projects');

  interface Block {
    name: string;
    technologies: string[];
    startDate: string | null;
    endDate: string | null;
    achievements: string[];
    line: number;
    lastLine: number;
    excerpt: string;
  }
  const blocks: Block[] = [];

  for (const { index, text } of sectionLines) {
    const open = blocks[blocks.length - 1];
    const bulleted = BULLET.test(text);
    const stripped = stripBullet(text);
    if (!stripped) continue;

    // A bulleted line is always detail, and so is anything that reads as prose.
    // The distinction that matters is the one between a project's NAME and its
    // achievements, and the reliable signal is sentence punctuation: an
    // achievement is a sentence and ends like one, a project name does not.
    // Bullet characters cannot carry this on their own — Word stores list
    // formatting as a paragraph property, so a bulleted DOCX extracts as plain
    // lines and every achievement in it would be read as a new project.
    if (open && (bulleted || !looksLikeProjectHeading(stripped))) {
      appendDetail(open.achievements, stripped, bulleted);
      open.lastLine = index;
      continue;
    }

    // A line that is nothing but a link label — "Repository", "Live demo" — is
    // the link, not content. It is skipped rather than kept as an achievement:
    // the URL behind it has already been captured with this line number, so the
    // block it belongs to still gets it, and "Repository" is not a thing the
    // project did.
    if (isLinkLine(stripped, index, links)) {
      if (open) open.lastLine = index;
      continue;
    }

    const dates = findDateRange(stripped);
    const withoutDates = dates ? tidy(stripped.replace(dates.matched, ' ')) : stripped;
    const { name, technologies } = parseProjectHeading(withoutDates, index, links);
    if (!name) {
      // A line that is only a date. It belongs to the entry above rather than
      // starting a nameless one.
      if (open) {
        appendDetail(open.achievements, stripped, bulleted);
        open.lastLine = index;
      }
      continue;
    }

    blocks.push({
      name,
      technologies,
      startDate: dates?.start ?? null,
      endDate: dates?.end ?? null,
      achievements: [],
      line: index,
      lastLine: index,
      excerpt: sourceExcerpt(text),
    });
  }

  for (const block of blocks) {
    const attached = linksBetween(links, block.line, block.lastLine);
    projects.push({
      name: block.name,
      startDate: block.startDate,
      endDate: block.endDate,
      achievements: block.achievements,
      ...(block.technologies.length ? { technologies: block.technologies } : {}),
      ...projectUrls(attached),
      excerpt: block.excerpt,
      sourceLocation: locate(sectioned, block.line),
    });
  }

  return projects;
}

/** A wrapped line: it starts mid-sentence, so it continues the line above. */
function isContinuation(text: string): boolean {
  return /^[a-z(]/.test(text) && !/^[a-z]+:/.test(text);
}

/**
 * Could this line be the name of a project?
 *
 * Three things rule it out, in increasing order of how often they fire: it
 * continues the line above; it ends like a sentence, which achievements do and
 * titles do not; or it is simply too long to be a title. Nothing here requires a
 * date, a bullet or a link, because the CV that exposed this had a project with
 * none of the three.
 */
function looksLikeProjectHeading(text: string): boolean {
  if (isContinuation(text)) return false;
  if (/[.!?]$/.test(text)) return false;
  return text.length <= 160;
}

/** Append a detail line, joining it to the previous one when it is a wrap. */
function appendDetail(achievements: string[], text: string, bulleted: boolean): void {
  const last = achievements[achievements.length - 1];
  if (!bulleted && last && isContinuation(text)) {
    achievements[achievements.length - 1] = `${last} ${text}`;
    return;
  }
  achievements.push(text);
}

/**
 * A single technology as a project heading lists one: "Node.js", "Azure",
 * "PostgreSQL". A phrase or a sentence is something else.
 */
function looksLikeTechnology(text: string): boolean {
  if (!text || text.length > 40) return false;
  if (/[.!?]$/.test(text)) return false;
  if (!/\p{L}/u.test(text)) return false;
  return text.split(/\s+/).length <= 4;
}

/**
 * Split a project's heading into its name and its technology stack.
 *
 * Real project headings look like
 * "Kinetx — Distributed Video Streaming Platform · Node.js · Docker · Azure Repo".
 * The list separators divide the name from the stack; the link labels ("Repo",
 * "Live demo") are the visible text of hyperlinks whose targets are captured
 * separately, and are removed so neither the name nor the stack inherits them.
 *
 * A heading with no separators has no stack — the double-space fallback splits a
 * column-formatted heading for the NAME only, because whitespace alignment does
 * not mean the same thing a bullet separator does, and reading a right-aligned
 * date column as a technology would invent skills.
 *
 * The full heading survives verbatim as the entry's excerpt either way, so
 * nothing that was read is hidden from the user reviewing it.
 */
function parseProjectHeading(
  heading: string,
  lineIndex: number,
  links: ExtractedLink[]
): { name: string; technologies: string[] } {
  let text = heading;
  for (const link of links) {
    if (link.line !== lineIndex || !link.visibleText) continue;
    text = text.split(link.visibleText).join(' ');
  }

  const segments = splitListSegments(text);
  const [head, ...tail] =
    segments.length > 1 ? segments : text.split(/\s{2,}/).map((part) => part.trim()).filter(Boolean);

  const name = tidy(head ?? '');
  // A heading needs a word in it. A bare separator or a stray date is not a name.
  if (!name || name.length > 160 || !/\p{L}/u.test(name)) return { name: '', technologies: [] };

  const technologies =
    segments.length > 1 ? tail.map(tidy).filter(looksLikeTechnology) : [];
  return { name, technologies };
}

/**
 * Connective wording a CV puts in front of a link and nothing else: "Repo:",
 * "Code at", "Live demo —". A line that is one of these plus a link is the link.
 */
const LINK_LEAD_IN =
  /^(?:code|source(?:\s+code)?|repo(?:sitory)?|live(?:\s+demo)?|demo|links?|url|website|site|portfolio|available|view|see|hosted|deployed|github|gitlab|project\s+link)\b[\s:–—-]*(?:at|on|here)?[\s:–—-]*$/i;

/**
 * Is this line just a link, with at most a connective in front of it?
 *
 * Both halves matter. "Repository" on its own line is a label whose address the
 * extractor already captured, and importing it as an achievement puts the word
 * "Repository" on the user's CV. "Code at github.com/sam/bus-tracker" is the same
 * thing written differently, and treating it as a heading — which the
 * punctuation rule alone would — invents a second project called "Code at…".
 *
 * The connective vocabulary is what keeps this narrow: "Invoice Matcher Live
 * demo" leaves "Invoice Matcher" behind, which is not a connective, so it stays
 * a project name with a link attached.
 */
function isLinkLine(text: string, lineIndex: number, links: ExtractedLink[]): boolean {
  const onLine = links.filter((link) => link.line === lineIndex);
  if (onLine.length === 0) return false;
  let remainder = text;
  for (const link of onLine) {
    if (link.visibleText) remainder = remainder.split(link.visibleText).join(' ');
  }
  for (const url of findUrlsInText(remainder)) {
    // Strip the written form too — `findUrlsInText` normalises, so the original
    // spelling is removed by matching the host, which is always present verbatim.
    const host = url.replace(/^https:\/\//, '');
    const written = new RegExp(`\\S*${host.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\S*`, 'gi');
    remainder = remainder.replace(written, ' ');
  }
  const rest = tidy(remainder);
  return rest === '' || LINK_LEAD_IN.test(rest);
}

/** Links whose recorded line falls inside a block, inclusive. */
function linksBetween(links: ExtractedLink[], from: number, to: number): ExtractedLink[] {
  return links.filter((link) => link.line !== undefined && link.line >= from && link.line <= to);
}

/**
 * Sort a project's links into the two URLs `ProjectEntry` holds.
 *
 * A GitHub repository URL is the repository whatever its label says; anything
 * else falls to the label, and an unlabelled remainder is left in `sourceLinks`
 * for the user to place rather than being forced into a field it might not
 * belong in. A GitHub PROFILE link inside a project block is never made the
 * project's repository — that is the account holder's profile that happens to
 * appear here, and putting it on a project claims the wrong thing.
 */
function projectUrls(links: ExtractedLink[]): Pick<ExtractedProject, 'repositoryUrl' | 'liveUrl' | 'sourceLinks'> {
  let repositoryUrl: string | undefined;
  let liveUrl: string | undefined;
  const sourceLinks: { url: string; label?: string }[] = [];

  for (const link of links) {
    const kind = classifyLinkUrl(link.url);
    sourceLinks.push({ url: link.url, ...(link.visibleText ? { label: link.visibleText } : {}) });
    if (kind === 'github_repository') {
      repositoryUrl ??= link.url;
      continue;
    }
    if (kind === 'github_profile' || kind === 'linkedin_profile' || kind === 'linkedin_other' || kind === 'email') {
      continue;
    }
    if (labelSuggestsRepository(link.visibleText)) {
      repositoryUrl ??= link.url;
      continue;
    }
    if (labelSuggestsLiveSite(link.visibleText) || !liveUrl) liveUrl ??= link.url;
  }

  return {
    ...(repositoryUrl ? { repositoryUrl } : {}),
    ...(liveUrl ? { liveUrl } : {}),
    ...(sourceLinks.length ? { sourceLinks } : {}),
  };
}

function readVolunteering(sectioned: SectionedCv): ExtractedVolunteering[] {
  return readDatedEntries(linesForSection(sectioned, 'volunteering')).map((entry) => ({
    role: entry.title,
    ...(entry.company ? { organisation: entry.company } : {}),
    startDate: entry.startDate,
    endDate: entry.endDate,
    ...(entry.achievements.length ? { contribution: entry.achievements.join(' ') } : {}),
    excerpt: entry.excerpt,
    sourceLocation: locate(sectioned, entry.line),
  }));
}

/**
 * Skills are a list, not prose. Lines split on the separators CVs use, with a
 * "Category:" prefix carried onto the items that follow it. Items longer than a
 * short phrase are dropped: a sentence in the skills section is a summary line,
 * and importing it as a skill produces an unusable profile row.
 */
function readSkills(sectioned: SectionedCv): ExtractedSkill[] {
  const skills: ExtractedSkill[] = [];
  const seen = new Set<string>();

  for (const { index, text } of linesForSection(sectioned, 'skills')) {
    const stripped = stripBullet(text);
    const [head, ...rest] = stripped.split(/:\s*/);
    const hasCategory = rest.length > 0 && head.length <= 40;
    const category = hasCategory ? tidy(head) : undefined;
    const body = hasCategory ? rest.join(': ') : stripped;

    for (const raw of body.split(/[,;|/•·]| {2,}/)) {
      const name = tidy(raw);
      if (!name || name.length > 60) continue;
      // Needs a letter, and must not be a sentence fragment.
      if (!/\p{L}/u.test(name) || name.split(/\s+/).length > 6) continue;
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      skills.push({
        name,
        ...(category ? { category } : {}),
        excerpt: sourceExcerpt(text),
        sourceLocation: locate(sectioned, index),
      });
    }
  }

  return skills;
}

/** Credential-style sections: one entry per line, "Name — Issuer, dates". */
function readCredentials(sectioned: SectionedCv, id: CvSectionId): ExtractedCredential[] {
  const credentials: ExtractedCredential[] = [];
  for (const { index, text } of linesForSection(sectioned, id)) {
    const stripped = stripBullet(text);
    const dates = findDateRange(stripped);
    const remainder = tidy(dates ? stripped.replace(dates.matched, ' ') : stripped);
    if (!remainder) continue;
    const [officialName, issuingBody] = splitRoleAndCompany(remainder);
    if (!officialName) continue;
    credentials.push({
      officialName,
      ...(issuingBody ? { issuingBody } : {}),
      issueDate: dates?.start ?? null,
      expiryDate: dates?.end ?? null,
      excerpt: sourceExcerpt(text),
      sourceLocation: locate(sectioned, index),
    });
  }
  return credentials;
}

function readTraining(sectioned: SectionedCv): ExtractedTraining[] {
  return readCredentials(sectioned, 'training').map((credential) => ({
    course: credential.officialName,
    ...(credential.issuingBody ? { provider: credential.issuingBody } : {}),
    startDate: credential.issueDate,
    endDate: credential.expiryDate,
    excerpt: credential.excerpt,
    sourceLocation: credential.sourceLocation,
  }));
}

/**
 * Languages, with the proficiency left exactly as written. Mapping "conversational"
 * onto the shared proficiency scale is a judgement the user makes at confirmation
 * — the parser recording it as B1 would be inventing an assessment.
 */
function readLanguages(sectioned: SectionedCv): ExtractedLanguage[] {
  const languages: ExtractedLanguage[] = [];
  for (const { index, text } of linesForSection(sectioned, 'languages')) {
    for (const raw of stripBullet(text).split(/[,;|]/)) {
      const entry = tidy(raw);
      if (!entry) continue;
      const match = /^([\p{L}\s'-]{2,30}?)\s*(?:[-–—:(]\s*|\s\()\s*([^)]{2,40})\)?$/u.exec(entry);
      const language = tidy(match ? match[1] : entry);
      if (!language || language.length > 30 || !/\p{L}/u.test(language)) continue;
      languages.push({
        language,
        ...(match ? { proficiency: tidy(match[2]) } : {}),
        excerpt: sourceExcerpt(text),
        sourceLocation: locate(sectioned, index),
      });
    }
  }
  return languages;
}

/**
 * Free-form achievements become OTHER evidence proposals — the only extracted
 * type that can consume the reusable-evidence allowance, and only once the user
 * confirms it. Career-history sections never route here.
 */
function readOtherEvidence(sectioned: SectionedCv) {
  return linesForSection(sectioned, 'achievements')
    .map(({ index, text }) => ({ index, text: stripBullet(text) }))
    .filter(({ text }) => text.length >= 12)
    .map(({ index, text }) => ({
      title: sourceExcerpt(text, 80),
      description: sourceExcerpt(text, 400),
      excerpt: sourceExcerpt(text),
      sourceLocation: locate(sectioned, index),
    }));
}

/**
 * The professional summary, and where it came from.
 *
 * The section itself was already detected — "PROFILE" is in the vocabulary — and
 * the summary was already being read; what was missing downstream was any way to
 * PROPOSE it, which needed provenance of its own. A summary spans several lines
 * under one heading, so its `sourceLocation` is that heading's first body line
 * and its excerpt is the opening of the text, quoted verbatim.
 *
 * Nothing is derived. A CV with no summary section produces no summary — a
 * paragraph assembled out of the user's job history would read like their own
 * words and be ours.
 */
function readSummary(
  sectioned: SectionedCv
): { text: string; excerpt: string; sourceLocation: { line: number; section?: string } } | undefined {
  const entries = linesForSection(sectioned, 'summary');
  if (entries.length === 0) return undefined;
  const summary = entries.map((entry) => stripBullet(entry.text)).join(' ').trim();
  if (summary.length < 20) return undefined;
  return {
    text: summary.slice(0, 2000),
    excerpt: sourceExcerpt(summary),
    sourceLocation: locate(sectioned, entries[0].index),
  };
}

// ── Links ────────────────────────────────────────────────────────────────────

/**
 * Every link in the document: the hyperlink targets the extractor recovered,
 * plus the addresses written out in the text, each tagged with the section it
 * sits in.
 *
 * Both channels are needed and neither is redundant. A CV that prints
 * `linkedin.com/in/amara-okafor` has no annotation to read; one that writes
 * "LinkedIn" has no address in its text. Merging them URL-first also means a CV
 * that does both contributes one link, with the line the text pass knew and the
 * label the annotation pass knew.
 */
function collectLinks(
  text: string,
  sectioned: SectionedCv,
  documentLinks: ExtractedLink[]
): ExtractedLink[] {
  const fromText: ExtractedLink[] = [];
  text.split('\n').forEach((line, index) => {
    for (const url of findUrlsInText(line)) {
      fromText.push({ url, line: index, surroundingText: line.trim() || undefined });
    }
  });

  return mergeLinks(documentLinks, fromText).map((link) => {
    if (link.line === undefined) return link;
    const section = headingAt(sectioned, link.line);
    return { ...link, ...(section ? { sectionHint: section } : {}) };
  });
}

/**
 * The links that may speak for the person rather than for a piece of their work.
 *
 * Two ways in. A link ON a line in the contact block is unambiguous. A link the
 * format could not place — a PDF annotation the positional pass missed, which is
 * exactly what happened to the LinkedIn link on the CV behind this work — is
 * admitted only when its KIND is inherently personal: a `/in/` LinkedIn URL or a
 * bare GitHub account is a person wherever it sits, whereas an unplaced website
 * could equally be a project's demo and is left for the project reader or for
 * review. That asymmetry is the whole point: `identity.website` must never
 * quietly become a deployment URL.
 */
function contactLinks(sectioned: SectionedCv, links: ExtractedLink[]): ExtractedLink[] {
  const boundary = firstHeadingLine(sectioned);
  const inContactBlock = (link: ExtractedLink) =>
    link.line !== undefined && (boundary === null || link.line < boundary);

  return links.filter((link) => {
    if (inContactBlock(link)) return true;
    if (link.line !== undefined) {
      // Placed outside the contact block: only a labelled personal site is
      // rescued, and only as a website.
      return labelClaimsPersonalSite(link.visibleText) && classifyLinkUrl(link.url) === 'web';
    }
    const kind = classifyLinkUrl(link.url);
    return kind === 'linkedin_profile' || kind === 'github_profile' || kind === 'email';
  });
}

/**
 * Parse normalised CV text into a validated extraction payload.
 *
 * Always returns a valid payload. If the document defeats the parser entirely
 * the result is empty — "we read nothing from this" is a truthful outcome that
 * the review step handles, whereas a thrown error would lose the stored CV the
 * user already uploaded.
 */
export function parseCvStructure(text: string, documentLinks: ExtractedLink[] = []): CvExtractionPayload {
  const sectioned = sectionCv(text);
  const links = collectLinks(text, sectioned, documentLinks);
  const { identity, headline, derivedIdentity } = readIdentity(
    sectioned.head,
    contactLinks(sectioned, links)
  );
  const summary = readSummary(sectioned);

  const payload: CvExtractionPayload = {
    ...emptyExtractionPayload(),
    identity,
    ...(headline ? { headline } : {}),
    ...(derivedIdentity.length ? { derivedIdentity } : {}),
    ...(summary
      ? { summary: summary.text, summarySource: { excerpt: summary.excerpt, sourceLocation: summary.sourceLocation } }
      : {}),
    ...(links.length ? { links } : {}),
    detectedSections: [...new Set(sectioned.sections.map((section) => section.heading))].slice(0, 40),
    experience: readExperience(sectioned),
    education: readEducation(sectioned),
    projects: readProjects(sectioned, links),
    skills: readSkills(sectioned),
    certifications: readCredentials(sectioned, 'certifications'),
    training: readTraining(sectioned),
    licences: readCredentials(sectioned, 'licences'),
    professionalRegistrations: readCredentials(sectioned, 'registrations'),
    languages: readLanguages(sectioned),
    volunteering: readVolunteering(sectioned),
    otherEvidence: readOtherEvidence(sectioned),
  };

  // Validating our own output is not paranoia: the schema is the contract the
  // import layer relies on, and a parser change that violates it must fail here
  // rather than write unusable candidates.
  const result = CvExtractionPayloadSchema.safeParse(payload);
  if (result.success) return result.data;

  // Falling back to empty is the safe outcome, but doing it silently would hide
  // a parser regression behind "that CV had nothing in it". Field PATHS are
  // logged; values never are, because they are the user's CV.
  console.warn(
    '[cv-extraction] Parser output failed its own schema; falling back to empty. Paths:',
    result.error.issues.slice(0, 10).map((issue) => `${issue.path.join('.')}:${issue.code}`).join(', ')
  );
  return emptyExtractionPayload();
}
