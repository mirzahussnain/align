import { ExternalHyperlink, TextRun } from 'docx';

export function formatLinkUrl(url: string): string {
  if (!url) return '';
  if (url.includes('@') && !url.startsWith('mailto:')) return `mailto:${url}`;
  if (!url.startsWith('http') && !url.startsWith('mailto:')) return `https://${url}`;
  return url;
}

export function formatLinkLabel(url: string, type: 'mail' | 'github' | 'linkedin' | 'portfolio'): string {
  if (!url) return '';
  if (type === 'mail') {
    const user = url.replace('mailto:', '').split('@')[0];
    return `mail/${user}`;
  }
  let cleanUrl = url.replace(/https?:\/\/(www\.)?/, '').replace(/\/$/, '');
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
  const validLinks = links.filter(l => Boolean(l.url)) as Array<{ url: string, type: 'mail' | 'github' | 'linkedin' | 'portfolio' }>;
  const children: any[] = [];
  
  for (let i = 0; i < validLinks.length; i++) {
    children.push(createContactHyperlink(validLinks[i].url, validLinks[i].type, font, size, color));
    if (i < validLinks.length - 1) {
      children.push(new TextRun({ text: separator, size, font, color: separatorColor || color }));
    }
  }
  
  return children.length > 0 ? children : [new TextRun({ text: "" })];
}
