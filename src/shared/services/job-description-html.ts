/** Server-side conversion of provider HTML into readable plain text. */
const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
function decode(value: string) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (token, code: string) => {
    if (code[0] === '#') { const point = code[1]?.toLowerCase() === 'x' ? Number.parseInt(code.slice(2), 16) : Number.parseInt(code.slice(1), 10); return Number.isFinite(point) ? String.fromCodePoint(point) : token; }
    return named[code.toLowerCase()] ?? token;
  });
}
/** This output is text only; no untrusted HTML or attributes escape this boundary. */
export function htmlToReadableText(html: string | null | undefined): string {
  if (!html) return '';
  return decode(html)
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|template|noscript|svg)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\s*li\b[^>]*>/gi, '\n• ')
    .replace(/<\s*\/?(?:p|div|section|article|header|footer|h[1-6]|ul|ol|table|tr|blockquote)\b[^>]*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n').replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n').trim();
}