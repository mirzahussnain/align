/**
 * Links a CV carries, and what they mean.
 *
 * A CV's links are frequently NOT in its visible text. Real documents write
 * "LinkedIn", "GitHub", "Repo" or "View project" as the label and hang the
 * actual URL off a PDF link annotation or a DOCX hyperlink relationship, so an
 * extractor that reads only the text layer sees a word and loses the address.
 * Every extractor therefore reports links as their own typed channel, separate
 * from the text, and this module decides what each one is.
 *
 * Two rules run through the whole file:
 *
 *   - a URL is never invented. "linkedIn/hussnainali-dev" written as plain text
 *     with no hyperlink behind it is a label, not an address, and guessing
 *     `linkedin.com/in/hussnainali-dev` would put a profile on the user's record
 *     that may belong to someone else;
 *   - a link is never promoted past what its position supports. A repository URL
 *     inside a project block is that project's repository, not the account
 *     holder's GitHub profile, and a demo URL is not their personal website.
 */

/** A link recovered from a document, with as much provenance as the format gave. */
export interface ExtractedLink {
  /** Resolved target, normalised. `mailto:` targets keep their scheme. */
  url: string;
  /** The text the reader actually sees, where the format exposes it. */
  visibleText?: string;
  /** 1-based page, for formats that paginate. */
  page?: number;
  /**
   * 0-indexed line in the normalised extracted text. Present only when the
   * extractor could place the link on a line — the whole basis for attaching a
   * repository URL to the right project rather than to the first one.
   */
  line?: number;
  /** The section heading the link fell under, filled in by the parser. */
  sectionHint?: string;
  /** The text of the line the link sat on, for review and for association. */
  surroundingText?: string;
}

/**
 * TLDs a bare, unlinked domain is recognised under.
 *
 * A curated list rather than a general "letters after a dot" rule, because CVs
 * are full of tokens that are shaped exactly like a bare domain and are not one:
 * "Node.js", "Vue.js", "asp.net" and "socket.io" all match a permissive pattern,
 * and "Node.js" arriving as the candidate's personal website is worse than
 * missing a portfolio link. Anything with a scheme or a `www.` prefix bypasses
 * this list entirely — those are unambiguous.
 */
const BARE_DOMAIN_TLDS = new Set([
  'com', 'org', 'net', 'edu', 'gov', 'co', 'uk', 'ie', 'eu', 'us', 'ca', 'au', 'nz',
  'de', 'fr', 'es', 'it', 'nl', 'se', 'no', 'dk', 'fi', 'pl', 'pt', 'ch', 'at', 'be',
  'in', 'pk', 'bd', 'ng', 'za', 'ke', 'gh', 'ae', 'sg', 'my', 'ph',
  'io', 'dev', 'me', 'ai', 'app', 'site', 'tech', 'page', 'online', 'space', 'website',
  'info', 'biz', 'xyz', 'cloud', 'digital', 'studio', 'design', 'portfolio', 'blog',
]);

/**
 * Tokens that are shaped like a bare domain under a real TLD and are not one.
 *
 * `.net` has to stay in the list above — people do host portfolios on it — so
 * "asp.net" and its relatives are excluded by name. A short, exact list beats
 * loosening the TLD rule and losing genuine `.net` and `.io` sites with it.
 */
const NOT_A_DOMAIN = new Set(['asp.net', 'vb.net', 'ado.net', 'dot.net', 'socket.io']);

/** A URL with an explicit scheme, or a `www.`-prefixed host. Unambiguous. */
const EXPLICIT_URL = /\b(?:https?:\/\/|www\.)[^\s,;<>()\][]+/gi;
/** `host.tld[/path]` with no scheme — only accepted for a known TLD, see above. */
const BARE_DOMAIN = /\b((?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+([a-z]{2,24}))(\/[^\s,;<>()\][]*)?/gi;
/** A `[label](url)` pair, the shape pdf-parse emits for an annotated link. */
const MARKDOWN_LINK = /\[([^\]\n]*)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/g;

/** Trailing characters that belong to the sentence, not to the address. */
function trimUrlPunctuation(url: string): string {
  return url.replace(/[.,;:!?'"»)\]]+$/, '');
}

/**
 * Put a URL into one comparable form.
 *
 * Scheme and host are lower-cased and a missing scheme becomes `https`, because
 * `LinkedIn.COM/in/X` and `linkedin.com/in/X` are one address and storing both
 * would show the user a conflict with themselves. The PATH keeps its case: a
 * GitHub username is displayed as its owner typed it, and lower-casing it makes
 * the profile link look wrong even though it still resolves.
 */
export function normaliseUrl(raw: string): string | null {
  const trimmed = trimUrlPunctuation(raw.trim());
  if (!trimmed) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    return null;
  }
  if (parsed.protocol === 'mailto:') return `mailto:${parsed.pathname.toLowerCase()}`;
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
  if (!parsed.hostname.includes('.')) return null;
  // Everything a CV links to is a public page; forcing https avoids storing two
  // spellings of the same address when a document writes one of each.
  parsed.protocol = 'https:';
  parsed.hostname = parsed.hostname.toLowerCase();
  const path = parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/+$/, '');
  return `https://${parsed.hostname}${path}${parsed.search}${parsed.hash}`;
}

/** Host without a leading `www.`, for matching. */
function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** Non-empty path segments. */
function segmentsOf(url: string): string[] {
  try {
    return new URL(url).pathname.split('/').filter(Boolean);
  } catch {
    return [];
  }
}

export type LinkKind =
  | 'linkedin_profile'
  /** A LinkedIn URL that is not a personal profile — a company page, a post. */
  | 'linkedin_other'
  | 'github_profile'
  | 'github_repository'
  | 'email'
  /** Any other http(s) address. Whether it is the user's site is positional. */
  | 'web'
  | 'unknown';

/**
 * What kind of thing a URL points at, from the URL alone.
 *
 * Position is deliberately not consulted here. "Is this GitHub link a profile or
 * a repository" is answerable from the path and always has the same answer;
 * "is this website the candidate's own" is not, and is decided by the caller
 * from where the link appeared.
 */
export function classifyLinkUrl(url: string): LinkKind {
  if (url.startsWith('mailto:')) return 'email';
  const host = hostOf(url);
  if (!host) return 'unknown';
  const segments = segmentsOf(url);

  if (host === 'linkedin.com' || host.endsWith('.linkedin.com')) {
    // Only `/in/<slug>` is a person. `/company/...`, `/school/...`, `/posts/...`
    // and `/pub/dir/...` are organisations and content — putting an employer's
    // company page in the user's `linkedin` field misrepresents whose profile it is.
    return segments[0]?.toLowerCase() === 'in' && segments.length >= 2
      ? 'linkedin_profile'
      : 'linkedin_other';
  }

  if (host === 'github.com') {
    if (segments.length === 0) return 'web';
    // One segment is an account; two or more names a repository inside it.
    // `github.com/hussnain` is identity, `github.com/hussnain/align` is a project.
    if (segments.length === 1) {
      return GITHUB_RESERVED_PATHS.has(segments[0].toLowerCase()) ? 'web' : 'github_profile';
    }
    return 'github_repository';
  }
  // Pages, not code: `user.github.io` is a hosted site, and its owner links it as
  // a portfolio far more often than as a code profile.
  if (host.endsWith('.github.io')) return 'web';

  return 'web';
}

/** Single-segment github.com paths that are site pages, not user accounts. */
const GITHUB_RESERVED_PATHS = new Set([
  'about', 'pricing', 'features', 'enterprise', 'security', 'login', 'signup',
  'explore', 'topics', 'trending', 'marketplace', 'sponsors', 'settings', 'orgs',
  'search', 'notifications', 'issues', 'pulls', 'apps', 'contact', 'site',
]);

/** Labels that say, in the document's own words, "this is my personal site". */
const PERSONAL_SITE_LABEL = /\b(portfolio|personal (?:site|website|page)|my (?:site|website)|website|homepage)\b/i;

/**
 * Does this link's own label claim it is the author's site?
 *
 * Used only to RESCUE a website link found outside the contact block. It never
 * overrides position in the other direction: a link labelled "Live demo" inside
 * a project stays with the project whatever else is true of it.
 */
export function labelClaimsPersonalSite(visibleText: string | undefined): boolean {
  return Boolean(visibleText && PERSONAL_SITE_LABEL.test(visibleText));
}

/** Labels a CV puts on a repository link. */
const REPOSITORY_LABEL = /\b(repo|repository|source|source code|code|github)\b/i;
/** Labels a CV puts on a running deployment. */
const LIVE_LABEL = /\b(live|demo|live demo|view (?:project|site|app)|try it|preview|deployed|website|site|app)\b/i;

export function labelSuggestsRepository(visibleText: string | undefined): boolean {
  return Boolean(visibleText && REPOSITORY_LABEL.test(visibleText));
}

export function labelSuggestsLiveSite(visibleText: string | undefined): boolean {
  return Boolean(visibleText && LIVE_LABEL.test(visibleText));
}

/**
 * Read the URLs written out in a line of visible text.
 *
 * This is the complement to hyperlink targets, not a replacement for them: a CV
 * that prints `linkedin.com/in/amara-okafor` in full needs no annotation, and a
 * CV that writes "LinkedIn" needs one. Both paths feed the same link list.
 */
export function findUrlsInText(text: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();

  const add = (candidate: string) => {
    const url = normaliseUrl(candidate);
    if (!url || seen.has(url)) return;
    seen.add(url);
    found.push(url);
  };

  const explicit: { start: number; end: number }[] = [];
  for (const match of text.matchAll(EXPLICIT_URL)) {
    if (match.index === undefined) continue;
    explicit.push({ start: match.index, end: match.index + match[0].length });
    add(match[0]);
  }

  for (const match of text.matchAll(BARE_DOMAIN)) {
    if (match.index === undefined) continue;
    // Skip anything already covered by an explicit match — otherwise the host of
    // `https://example.com/x` is read a second time as a bare domain.
    if (explicit.some((range) => match.index! >= range.start && match.index! < range.end)) continue;
    if (!BARE_DOMAIN_TLDS.has(match[2].toLowerCase())) continue;
    if (NOT_A_DOMAIN.has(match[1].toLowerCase())) continue;
    // A bare domain glued to an email's local part is the email's host.
    if (match.index > 0 && text[match.index - 1] === '@') continue;
    add(match[0]);
  }

  return found;
}

/**
 * A profile written as a bare handle rather than an address:
 * "linkedIn/amara-okafor", "GitHub: amaraokafor", "gitlab / amara".
 *
 * The separator must be `/`, `:` or `@` — never a plain space. "GitHub Actions"
 * and "GitHub, Git, Docker" are things people list under Skills, and a rule
 * loose enough to read a handle after a space turns both into a profile URL.
 * The platform name must also not be followed by a dot, so a real
 * `linkedin.com/in/…` is left to the URL reader.
 */
const WRITTEN_HANDLE =
  /\b(linked\s?in|github|gitlab)\s*[:/@|]\s*(?:in\/)?@?([a-z0-9](?:[a-z0-9._-]{1,38})?)\b/gi;

export type HandlePlatform = 'linkedin' | 'github' | 'gitlab';

export interface WrittenHandle {
  platform: HandlePlatform;
  handle: string;
  /** Verbatim, as the CV wrote it — the provenance shown to the user. */
  writtenAs: string;
  /** The address the handle IMPLIES. Never treated as read from the document. */
  derivedUrl: string;
}

const HANDLE_URL: Record<HandlePlatform, (handle: string) => string> = {
  linkedin: (handle) => `https://linkedin.com/in/${handle}`,
  github: (handle) => `https://github.com/${handle}`,
  gitlab: (handle) => `https://gitlab.com/${handle}`,
};

/**
 * Read profile handles written as labels, and say what address each implies.
 *
 * The derived URL is a SUGGESTION and the caller must carry it as one. On the CV
 * that prompted this work the label read "linkedIn/hussnainali-dev" while the
 * hyperlink behind it pointed at `/in/hussnain-ali-dev` — the two disagreed, so
 * a handle is evidence of intent and not of an address. A resolved hyperlink
 * always wins; this only fills a field that would otherwise be empty, and only
 * as something the user is asked to check.
 */
export function findWrittenHandles(text: string): WrittenHandle[] {
  const found: WrittenHandle[] = [];
  for (const match of text.matchAll(WRITTEN_HANDLE)) {
    const platform = match[1].toLowerCase().replace(/\s/g, '') as HandlePlatform;
    const handle = match[2];
    // A handle needs a letter in it, and "com"/"www" mean this is a mangled URL.
    if (!/[a-z]/i.test(handle) || /^(com|www|org|net|in)$/i.test(handle)) continue;
    found.push({
      platform,
      handle,
      writtenAs: match[0].trim(),
      derivedUrl: HANDLE_URL[platform](handle),
    });
  }
  return found;
}

/**
 * Pull `[label](url)` pairs out of a line, returning the line as the reader sees
 * it plus the links that were embedded in it.
 *
 * pdf-parse emits annotated links in this shape when asked to resolve them. The
 * markdown is stripped back out before the text is stored, because the extracted
 * text is a record of what the document SAYS and a reader of that text should
 * see the label the CV printed, not our encoding of it.
 */
export function splitMarkdownLinks(line: string): { text: string; links: { url: string; visibleText: string }[] } {
  const links: { url: string; visibleText: string }[] = [];
  const text = line.replace(MARKDOWN_LINK, (_match, label: string, target: string) => {
    const url = normaliseUrl(target);
    if (url) links.push({ url, visibleText: label });
    return label;
  });
  return { text, links };
}

/**
 * Merge link lists, keeping the richest record of each address.
 *
 * The same link routinely arrives twice — once positioned, from the text pass,
 * and once unpositioned, from the annotation pass — and the positioned copy is
 * the one worth keeping, because a link with no line cannot be attached to a
 * project. Deduplication is by URL, and a later entry only fills in fields the
 * earlier one lacked.
 */
export function mergeLinks(...groups: ExtractedLink[][]): ExtractedLink[] {
  const byUrl = new Map<string, ExtractedLink>();
  for (const group of groups) {
    for (const link of group) {
      const existing = byUrl.get(link.url);
      if (!existing) {
        byUrl.set(link.url, { ...link });
        continue;
      }
      byUrl.set(link.url, {
        ...existing,
        visibleText: existing.visibleText ?? link.visibleText,
        page: existing.page ?? link.page,
        line: existing.line ?? link.line,
        sectionHint: existing.sectionHint ?? link.sectionHint,
        surroundingText: existing.surroundingText ?? link.surroundingText,
      });
    }
  }
  return [...byUrl.values()];
}
