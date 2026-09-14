// Deterministic filename audit.
//
// Real ATS parsers key off file *contents*, not the filename, so this check is
// deliberately modest: it flags only the two things a recruiter actually reacts
// to when a CV lands in their downloads folder — a name that identifies nobody,
// and spaces that break some older download handlers. It never claims to verify
// anything it can't see (we don't know the candidate's name), so it makes
// suggestions rather than inventing a pass/fail grade out of thin air.

export interface FileNameCheck {
  /** The filename as uploaded, extension included. Empty when not captured. */
  fileName: string;
  status: 'excellent' | 'good' | 'needs-improvement';
  /** Short label for the card badge. */
  scoreLabel: string;
  /** Human-readable suggestions; empty when the name is already clean. */
  issues: string[];
  isPassed: boolean;
}

// Names that identify no one — a recruiter can't tell whose CV it is.
const GENERIC_NAMES = new Set([
  'cv', 'resume', 'résumé', 'curriculum vitae', 'curriculumvitae',
  'document', 'untitled', 'new', 'final', 'draft', 'doc', 'mycv', 'my cv',
]);

export function checkFileName(rawName: string | undefined): FileNameCheck {
  const fileName = (rawName ?? '').trim();

  if (!fileName) {
    return {
      fileName: '',
      status: 'good',
      scoreLabel: 'Not captured',
      issues: ['The filename wasn’t captured for this upload, so it couldn’t be checked.'],
      isPassed: true,
    };
  }

  // Strip a single trailing extension for the name checks.
  const base = fileName.replace(/\.[^.]+$/, '');
  const lower = base.toLowerCase();
  const issues: string[] = [];

  const isGeneric =
    GENERIC_NAMES.has(lower) ||
    /^(document|untitled|scan|image|doc|file|new)[-_ ]?\d*$/i.test(base);

  if (isGeneric) {
    issues.push(
      'The filename is generic — a recruiter who downloads it can’t tell whose CV it is. Use your name, e.g. "Jane_Smith_CV.pdf".'
    );
  }

  if (/\s/.test(fileName)) {
    issues.push(
      'Replace spaces with underscores or hyphens (e.g. "Jane_Smith_CV.pdf") — some older download handlers mangle spaced filenames.'
    );
  }

  // A generic name is the only thing serious enough to fail on; spaces are a
  // tidy-up, not a blocker.
  if (isGeneric) {
    return { fileName, status: 'needs-improvement', scoreLabel: 'Rename', issues, isPassed: false };
  }
  if (issues.length > 0) {
    return { fileName, status: 'good', scoreLabel: 'Minor tidy-up', issues, isPassed: true };
  }
  return { fileName, status: 'excellent', scoreLabel: 'Good', issues, isPassed: true };
}
