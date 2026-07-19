// Guards the `analysis.jobTitle` / `jobCompany` columns.
//
// The backfill migration learned this the hard way: the first line of a pasted
// job description is usually a section heading, not the role. "About the job"
// rendered as a title in the history table is worse than a blank, because the
// UI can fall back from null but cannot tell that a non-empty string is junk.
//
// The model is now told not to return headings, but a prompt instruction is a
// request, not a guarantee, so the same check runs on the way into the database.

/**
 * Headings that routinely open a job description. Anchored, so a genuine title
 * that merely contains one of these words ("Overview Systems Engineer") passes.
 */
const GENERIC_HEADING =
  /^(about( the)?( job| role| us| company| position)?|job description|the role|role description|overview|summary|position|vacancy|description|introduction|responsibilities|who we are|what you.?ll be doing|job title|company)[\s\p{P}]*$/iu;

/** Longest a plausible role title runs before it is certainly a sentence. */
const MAX_TITLE_LENGTH = 120;

/**
 * Normalise an extracted job title, or return null when it is unusable.
 *
 * Null is a first-class answer here: plenty of job descriptions genuinely never
 * state a title, and storing nothing lets the UI fall back to the filename
 * rather than displaying something misleading.
 */
export function cleanJobTitle(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;

  // Collapse internal whitespace so a title split across lines in the source
  // does not arrive with a newline embedded in it.
  const value = raw.replace(/\s+/g, ' ').trim();

  if (value.length === 0) return null;
  if (value.length > MAX_TITLE_LENGTH) return null;
  if (GENERIC_HEADING.test(value)) return null;

  return value;
}

/** Same rules for the employer name. */
export function cleanJobCompany(raw: unknown): string | null {
  return cleanJobTitle(raw);
}

/**
 * Best-effort job title read straight from the job description text.
 *
 * A fallback for when the model returns nothing usable — not a replacement for
 * it. Real pasted listings very often open with a heading ("About the job")
 * followed by the actual role on the next line, which is the case this recovers.
 *
 * Returns null rather than guessing when the opening lines are prose. Some job
 * descriptions genuinely never state a title, and a truncated sentence
 * masquerading as one is the exact failure this module exists to prevent.
 */
export function deriveJobTitleFromJd(jobDescription: string | null | undefined): string | null {
  if (!jobDescription) return null;

  const lines = jobDescription.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  // Only the opening of the document. Deeper in, a line that looks like a title
  // is far more likely to be a section heading or a bullet.
  for (const line of lines.slice(0, 6)) {
    if (GENERIC_HEADING.test(line)) continue;

    // "Job title: Senior Data Engineer" — take what follows the label.
    const labelled = line.match(/^(?:job|post|position|role)\s*title\s*[:\-–]\s*(.+)$/i);
    if (labelled) {
      const cleaned = cleanJobTitle(labelled[1]);
      if (cleaned) return cleaned;
    }

    if (looksLikeTitle(line)) return cleanJobTitle(line);

    // The first non-heading line was prose, so this document leads with a
    // paragraph. Stop rather than scanning on and finding a stray short line.
    return null;
  }

  return null;
}

/**
 * Whether a line reads as a job title rather than a sentence.
 *
 * Titles are short, carry few words, and don't end in sentence punctuation.
 * "Full-Stack Engineer (AI-enabled)" passes; "An exciting opportunity has
 * become available for a graduate…" does not.
 */
function looksLikeTitle(line: string): boolean {
  if (line.length > 70) return false;
  if (/[.!?;]$/.test(line)) return false;
  if (line.split(/\s+/).length > 9) return false;

  // A sentence usually contains a verb or article early on. Titles rarely do.
  if (/\b(we|you|our|the|a|an|is|are|has|have|will|to be|looking for)\b/i.test(line)) {
    // Unless it also names a role, e.g. "The Senior Data Engineer role".
    return /\b(engineer|developer|scientist|analyst|manager|designer|consultant|architect|administrator|operative|assistant|officer|lead|director|specialist|technician|nurse|teacher|accountant)\b/i.test(
      line
    );
  }

  return true;
}

/**
 * How a job-match analysis should be labelled in history.
 *
 * Falls back through title → filename → a generic label, so a row always says
 * something, and never says something untrue.
 */
export function describeAnalysis(analysis: {
  mode: string;
  jobTitle?: string | null;
  jobCompany?: string | null;
  sourceFileName?: string | null;
}): string {
  if (analysis.mode === 'job_match' && analysis.jobTitle) {
    return analysis.jobCompany
      ? `${analysis.jobTitle} at ${analysis.jobCompany}`
      : analysis.jobTitle;
  }
  return analysis.sourceFileName || (analysis.mode === 'job_match' ? 'Job match' : 'ATS check');
}
