/**
 * Section detection for CV text.
 *
 * A CV is a set of labelled blocks, and almost every useful thing the parser
 * does depends on knowing which block a line is in — "Manchester" under CONTACT
 * is a location, under EDUCATION it is part of an institution. Detection is
 * vocabulary-driven rather than heuristic: a line becomes a heading only when it
 * matches a known section name. Guessing from formatting alone (all-caps, short,
 * bold) misreads a candidate's name, a company name, or a course title as a
 * heading, and every downstream entity then lands in the wrong section.
 */

export type CvSectionId =
  | 'summary'
  | 'experience'
  | 'education'
  | 'skills'
  | 'projects'
  | 'certifications'
  | 'training'
  | 'licences'
  | 'registrations'
  | 'languages'
  | 'volunteering'
  | 'achievements'
  | 'interests'
  | 'references';

/**
 * Heading phrases per section, longest-match-wins at lookup time.
 *
 * UK-first wording, with the common US variants included because plenty of CVs
 * uploaded here were written elsewhere. Ordering inside a list does not matter;
 * `matchSectionHeading` sorts by length so "work experience" cannot be claimed
 * by "experience" when both would match.
 */
const SECTION_VOCABULARY: Record<CvSectionId, readonly string[]> = {
  summary: [
    'summary', 'professional summary', 'personal summary', 'profile',
    'personal profile', 'professional profile', 'career profile', 'about me',
    'about', 'career objective', 'objective', 'personal statement',
    'career summary', 'executive summary', 'overview', 'professional overview',
    'career overview', 'summary of qualifications', 'profile summary',
  ],
  experience: [
    'experience', 'work experience', 'professional experience', 'employment',
    'employment history', 'work history', 'career history', 'relevant experience',
    'clinical experience', 'professional background',
  ],
  education: [
    'education', 'education and qualifications', 'qualifications',
    'academic background', 'academic qualifications', 'educational background',
    'education & qualifications', 'academic history',
  ],
  skills: [
    'skills', 'core skills', 'key skills', 'technical skills', 'skills and abilities',
    'competencies', 'core competencies', 'areas of expertise', 'expertise',
    'skills & tools', 'technical competencies', 'it skills', 'skills summary',
  ],
  projects: [
    'projects', 'project', 'key projects', 'selected projects', 'personal projects',
    'personal project', 'project experience', 'portfolio', 'academic projects',
    'academic project', 'projects & portfolio', 'projects and portfolio',
    'side projects', 'technical projects', 'notable projects', 'featured projects',
    'projects and achievements',
  ],
  certifications: [
    'certifications', 'certificates', 'certifications and licences',
    'professional certifications', 'accreditations',
  ],
  training: [
    'training', 'training and development', 'courses', 'professional development',
    'cpd', 'continuing professional development', 'short courses',
  ],
  licences: ['licences', 'licenses', 'licences and permits', 'permits'],
  registrations: [
    'professional registration', 'professional registrations', 'registration',
    'registrations', 'memberships', 'professional memberships', 'affiliations',
    'professional bodies',
  ],
  languages: ['languages', 'language skills', 'spoken languages'],
  volunteering: [
    'volunteering', 'volunteer experience', 'voluntary work', 'community work',
    'community involvement', 'voluntary experience',
  ],
  achievements: [
    'achievements', 'key achievements', 'accomplishments', 'awards',
    'awards and honours', 'honours', 'awards & achievements',
  ],
  interests: ['interests', 'hobbies', 'hobbies and interests', 'personal interests'],
  references: ['references', 'referees'],
};

const HEADINGS: { phrase: string; id: CvSectionId }[] = Object.entries(SECTION_VOCABULARY)
  .flatMap(([id, phrases]) => phrases.map((phrase) => ({ phrase, id: id as CvSectionId })))
  .sort((a, b) => b.phrase.length - a.phrase.length);

/**
 * Trailing punctuation and leading decoration CVs put around headings.
 *
 * Unicode-normalised to NFKC first, because a heading typed in a word processor
 * is routinely not the ASCII it looks like: full-width letters from a
 * copy-pasted template, a ligature, a non-breaking space between the words. All
 * of those render as "Professional Summary" and none of them match it as a
 * string, so the section is silently missed and everything under it is filed
 * against the section above.
 */
function headingKey(raw: string): string {
  return raw
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[_*#|•▪◦●·]/g, ' ')
    // Typographic apostrophes and quotes, so "Employer's" keys the same either way.
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[:：\-–—]+\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The section a line declares, or null if it declares none.
 *
 * A heading must be the WHOLE line (once decoration is stripped) and short. A
 * sentence that merely contains "experience" is prose, not a heading, and
 * treating it as one truncates the section above it.
 */
export function matchSectionHeading(rawLine: string): CvSectionId | null {
  const key = headingKey(rawLine);
  if (!key || key.length > 45) return null;
  // A heading is a label, not a clause. Anything with sentence punctuation in
  // the middle is prose that happens to be short.
  if (/[.;,]/.test(key)) return null;
  return HEADINGS.find((heading) => heading.phrase === key)?.id ?? null;
}

export interface CvSection {
  id: CvSectionId;
  /** The heading exactly as the CV wrote it. */
  heading: string;
  /** Index of the heading line in the normalised text. */
  headingLine: number;
  /** Body lines, paired with their absolute line index for provenance. */
  lines: { index: number; text: string }[];
}

export interface SectionedCv {
  /** Everything before the first recognised heading — the contact block. */
  head: { index: number; text: string }[];
  sections: CvSection[];
}

/**
 * Split normalised CV text into a head block and labelled sections.
 *
 * Repeated headings are kept as separate sections rather than merged: a CV with
 * "Experience" twice (e.g. clinical then non-clinical) is describing two blocks,
 * and merging them would attribute the second block's dates to the first's
 * layout. Callers that want all experience concatenate by `id`.
 */
export function sectionCv(text: string): SectionedCv {
  const lines = text.split('\n');
  const head: SectionedCv['head'] = [];
  const sections: CvSection[] = [];
  let current: CvSection | null = null;

  lines.forEach((raw, index) => {
    const trimmed = raw.trim();
    const id = trimmed ? matchSectionHeading(trimmed) : null;
    if (id) {
      current = { id, heading: trimmed, headingLine: index, lines: [] };
      sections.push(current);
      return;
    }
    if (!trimmed) return;
    if (current) current.lines.push({ index, text: trimmed });
    else head.push({ index, text: trimmed });
  });

  return { head, sections };
}

/** Every body line belonging to a section id, in document order. */
export function linesForSection(sectioned: SectionedCv, id: CvSectionId) {
  return sectioned.sections.filter((section) => section.id === id).flatMap((section) => section.lines);
}

/**
 * Which section a line index sits in — `'head'` for the contact block above the
 * first heading, or null for a line past the end.
 *
 * This is what stops a link being filed by document order alone. A repository
 * URL is that project's repository because of the block it is IN, and the
 * candidate's own GitHub profile is theirs because it is in the contact block;
 * without the section a line belongs to, every link would have to be attached by
 * proximity, and proximity puts the last project's demo link on the first
 * project of the next page.
 */
export function sectionIdAt(sectioned: SectionedCv, lineIndex: number): CvSectionId | 'head' | null {
  const firstHeading = sectioned.sections[0]?.headingLine;
  // Everything above the first heading is the contact block, blank lines included.
  if (firstHeading === undefined || lineIndex < firstHeading) return 'head';
  let current: CvSectionId | 'head' = 'head';
  for (const section of sectioned.sections) {
    if (section.headingLine <= lineIndex) current = section.id;
    else break;
  }
  return current;
}

/** The line index of the first recognised heading, or null when there is none. */
export function firstHeadingLine(sectioned: SectionedCv): number | null {
  return sectioned.sections[0]?.headingLine ?? null;
}

/** The heading a line index falls under, for provenance. */
export function headingAt(sectioned: SectionedCv, lineIndex: number): string | undefined {
  let heading: string | undefined;
  for (const section of sectioned.sections) {
    if (section.headingLine <= lineIndex) heading = section.heading;
    else break;
  }
  return heading;
}
