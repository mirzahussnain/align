import { describe, it, expect } from 'vitest';
import { checkFileName } from '../filename-check';

describe('checkFileName', () => {
  it('passes a clean, identifying filename', () => {
    const r = checkFileName('Jane_Smith_CV.pdf');
    expect(r.isPassed).toBe(true);
    expect(r.status).toBe('excellent');
    expect(r.issues).toHaveLength(0);
  });

  it('fails a generic name that identifies no one', () => {
    for (const name of ['cv.pdf', 'resume.pdf', 'Document.pdf', 'untitled.pdf', 'document1.pdf']) {
      const r = checkFileName(name);
      expect(r.isPassed, name).toBe(false);
      expect(r.status, name).toBe('needs-improvement');
    }
  });

  it('flags spaces but still passes', () => {
    const r = checkFileName('Jane Smith CV.pdf');
    expect(r.isPassed).toBe(true);
    expect(r.status).toBe('good');
    expect(r.issues.some((i) => i.toLowerCase().includes('space'))).toBe(true);
  });

  it('does not fabricate a grade when the name was not captured', () => {
    const r = checkFileName(undefined);
    expect(r.fileName).toBe('');
    expect(r.isPassed).toBe(true);
    expect(r.scoreLabel).toBe('Not captured');
  });

  it('preserves the original filename for display', () => {
    expect(checkFileName('Ade-Okafor-Resume.pdf').fileName).toBe('Ade-Okafor-Resume.pdf');
  });
});
