import { ExternalHyperlink, TextRun } from 'docx';

export function formatLinkUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed || /\s/u.test(trimmed)) return '';
  const mail = trimmed.replace(/^mailto:/iu, '');
  if (trimmed.startsWith('mailto:') || trimmed.includes('@')) {
    return /^[^@\s]+@[^@\s]+\.[^@\s]+$/u.test(mail) ? `mailto:${mail}` : '';
  }
  try {
    const parsed = new URL(/^https?:\/\//iu.test(trimmed) ? trimmed : `https://${trimmed}`);
    return ['http:', 'https:'].includes(parsed.protocol) && parsed.hostname.includes('.')
      ? parsed.toString().replace(/\/$/u, '')
      : '';
  } catch {
    return '';
  }
}

export function formatLinkLabel(url: string, type: 'mail' | 'github' | 'linkedin' | 'portfolio'): string {
  if (!url) return '';
  if (type === 'mail') {
    // The full address is the accessible, unambiguous link text — the old
    // `mail/${local-part}` dropped the domain and read as a broken path.
    return url.replace(/^mailto:/i, '').trim();
  }
  const cleanUrl = url.replace(/https?:\/\/(www\.)?/, '').replace(/\/$/, '');
  if (type === 'github') {
    const parts = cleanUrl.split('github.com/');
    return parts.length > 1 ? `github/${parts[1]}` : cleanUrl;
  }
  if (type === 'linkedin') {
    const parts = cleanUrl.split('linkedin.com/in/');
    return parts.length > 1 ? `LinkedIn/${parts[1]}` : cleanUrl;
  }
  if (type === 'portfolio') {
    return `portfolio/${cleanUrl.split('/')[0]}`;
  }
  return cleanUrl;
}

export function formatPhone(phone: string): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('44') && digits.length >= 11) {
    const area = digits.slice(2, 4);
    const mid = digits.slice(4, 7);
    const end = digits.slice(7);
    return `+44(${area}) ${mid}-${end}`;
  }
  return phone;
}

export function createContactHyperlink(url: string, type: 'mail' | 'github' | 'linkedin' | 'portfolio', font: string, size: number, color: string) {
  return new ExternalHyperlink({
    link: formatLinkUrl(url),
    children: [
      new TextRun({
        text: formatLinkLabel(url, type),
        size, font, color
      })
    ]
  });
}

export function buildLinkArray(
  links: Array<{ url: string | undefined, type: 'mail' | 'github' | 'linkedin' | 'portfolio' }>,
  separator: string,
  font: string,
  size: number,
  color: string,
  separatorColor?: string
) {
  // Drop blanks, then de-duplicate by resolved href so a website that equals the
  // portfolio/LinkedIn value never renders twice with two labels.
  const seen = new Set<string>();
  const validLinks: Array<{ url: string, type: 'mail' | 'github' | 'linkedin' | 'portfolio' }> = [];
  for (const link of links) {
    if (!link.url) continue;
    const resolved = formatLinkUrl(link.url);
    if (!resolved) continue;
    const href = resolved.toLowerCase();
    if (seen.has(href)) continue;
    seen.add(href);
    validLinks.push({ url: link.url, type: link.type });
  }

  const children: (ExternalHyperlink | TextRun)[] = [];
  for (let i = 0; i < validLinks.length; i++) {
    children.push(createContactHyperlink(validLinks[i].url, validLinks[i].type, font, size, color));
    if (i < validLinks.length - 1) {
      children.push(new TextRun({ text: separator, size, font, color: separatorColor || color }));
    }
  }

  return children.length > 0 ? children : [new TextRun({ text: "" })];
}

/**
 * The shared contact detail line — phone, location, and (optionally) work
 * authorisation — as an ordered, blank-stripped parts list. Every template
 * renders the same model and only chooses its own separator, so the contact
 * block is consistent across templates. Phone is normalised once, here.
 */
export function contactDetailParts(
  contact: { phone?: string; location?: string; visaStatus?: string },
  includeVisa = true
): string[] {
  return [
    formatPhone(contact.phone ?? ''),
    contact.location ?? '',
    includeVisa ? (contact.visaStatus ?? '') : '',
  ].filter((part): part is string => Boolean(part && part.trim()));
}

/**
 * Flatten grouped skills into a single de-duplicated, comma-separated line for
 * flat-layout templates. Case-insensitive de-duplication keeps the first
 * spelling; §8 forbids a flat layout from listing the same skill twice.
 */
export function flattenSkills(groups: Array<{ skills: string }>): string {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const group of groups) {
    for (const raw of group.skills.split(',')) {
      const skill = raw.trim();
      if (!skill) continue;
      const key = skill.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      ordered.push(skill);
    }
  }
  return ordered.join(', ');
}
