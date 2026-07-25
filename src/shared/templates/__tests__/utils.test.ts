import { describe, expect, it } from 'vitest';
import { ExternalHyperlink } from 'docx';
import {
  buildLinkArray,
  contactDetailParts,
  flattenSkills,
  formatLinkLabel,
  formatPhone,
} from '@/shared/templates/utils';

describe('contact link presentation (§9)', () => {
  it('shows the full email address as link text, not a truncated local part', () => {
    expect(formatLinkLabel('alex.smith@example.co.uk', 'mail')).toBe('alex.smith@example.co.uk');
    // A stray mailto: prefix must never leak into the display text.
    expect(formatLinkLabel('mailto:alex@example.com', 'mail')).toBe('alex@example.com');
  });

  it('renders readable labels for profile links', () => {
    expect(formatLinkLabel('https://github.com/alex', 'github')).toBe('github/alex');
    expect(formatLinkLabel('https://www.linkedin.com/in/alex', 'linkedin')).toBe('LinkedIn/alex');
  });

  const linkCount = (children: unknown[]) =>
    children.filter((child) => child instanceof ExternalHyperlink).length;

  it('de-duplicates links that resolve to the same href', () => {
    const children = buildLinkArray(
      [
        { url: 'alex@example.com', type: 'mail' },
        { url: 'linkedin.com/in/alex', type: 'linkedin' },
        { url: 'linkedin.com/in/alex', type: 'portfolio' }, // same href as above
      ],
      ' • ', 'Calibri', 20, '000000'
    );
    expect(linkCount(children)).toBe(2);
  });

  it('drops blank links without emitting dangling separators', () => {
    const children = buildLinkArray(
      [
        { url: 'alex@example.com', type: 'mail' },
        { url: undefined, type: 'github' },
        { url: '', type: 'linkedin' },
      ],
      ' • ', 'Calibri', 20, '000000'
    );
    expect(linkCount(children)).toBe(1);
  });
});

describe('contact detail line (§9)', () => {
  it('builds a blank-stripped parts list and honours the visa toggle', () => {
    const contact = { phone: '+44 7000 000000', location: 'London, UK', visaStatus: 'British citizen' };
    expect(contactDetailParts(contact)).toEqual([formatPhone('+44 7000 000000'), 'London, UK', 'British citizen']);
    expect(contactDetailParts(contact, false)).toEqual([formatPhone('+44 7000 000000'), 'London, UK']);
    expect(contactDetailParts({ location: 'Leeds' })).toEqual(['Leeds']);
    expect(contactDetailParts({})).toEqual([]);
  });
});

describe('flat skills (§8)', () => {
  it('flattens grouped skills into a single de-duplicated, order-preserving line', () => {
    const groups = [
      { skills: 'Python, SQL' },
      { skills: 'sql, AWS, Python' }, // sql/Python duplicate earlier entries
    ];
    expect(flattenSkills(groups)).toBe('Python, SQL, AWS');
  });

  it('ignores empty fragments', () => {
    expect(flattenSkills([{ skills: 'A, , B' }, { skills: '' }])).toBe('A, B');
  });
});
