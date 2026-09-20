export interface LifecycleTemplate {
  subject: string;
  html: string;
  text: string;
}

interface EmailAction {
  label: string;
  url: string;
}

interface EmailShellInput {
  subject: string;
  heading: string;
  name: string;
  paragraphs: readonly string[];
  action?: EmailAction;
  securityNote?: string;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function renderEmailShell(input: EmailShellInput): LifecycleTemplate {
  const greeting = `Hi ${input.name || 'there'},`;
  const paragraphs = input.paragraphs
    .map(
      (paragraph) =>
        `<p style="margin:0 0 16px;color:#333333;font-size:16px;line-height:24px;">${escapeHtml(paragraph)}</p>`
    )
    .join('');
  const action = input.action
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0;">
        <tr><td style="border-radius:6px;background:#111111;">
          <a href="${escapeHtml(input.action.url)}" style="display:inline-block;padding:13px 20px;color:#ffffff;font-size:16px;font-weight:600;text-decoration:none;">${escapeHtml(input.action.label)}</a>
        </td></tr>
      </table>
      <p style="margin:0 0 16px;color:#666666;font-size:13px;line-height:20px;">If the button does not work, copy and paste this URL into your browser:<br><a href="${escapeHtml(input.action.url)}" style="color:#333333;word-break:break-all;">${escapeHtml(input.action.url)}</a></p>`
    : '';
  const securityNote = input.securityNote
    ? `<p style="margin:24px 0 0;padding-top:20px;border-top:1px solid #e5e5e5;color:#666666;font-size:13px;line-height:20px;">${escapeHtml(input.securityNote)}</p>`
    : '';

  const text = [
    'Align',
    '',
    greeting,
    '',
    ...input.paragraphs.flatMap((paragraph) => [paragraph, '']),
    ...(input.action ? [input.action.label, input.action.url, ''] : []),
    ...(input.securityNote ? [input.securityNote, ''] : []),
    'This is an automated message. Replies to this email are not monitored.',
    '',
    'Align — clearer career decisions.',
  ].join('\n');

  return {
    subject: input.subject,
    html: `<!doctype html>
<html lang="en">
<body style="margin:0;padding:0;background:#f5f5f3;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background:#f5f5f3;">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #e5e5e5;border-radius:10px;">
        <tr><td style="padding:28px 32px 20px;border-bottom:1px solid #e5e5e5;color:#111111;font-size:22px;font-weight:700;letter-spacing:-0.4px;">Align</td></tr>
        <tr><td style="padding:32px;">
          <h1 style="margin:0 0 24px;color:#111111;font-size:26px;line-height:34px;letter-spacing:-0.5px;">${escapeHtml(input.heading)}</h1>
          <p style="margin:0 0 16px;color:#333333;font-size:16px;line-height:24px;">${escapeHtml(greeting)}</p>
          ${paragraphs}${action}${securityNote}
        </td></tr>
        <tr><td style="padding:20px 32px;border-top:1px solid #e5e5e5;color:#777777;font-size:12px;line-height:18px;">
          This is an automated message. Replies to this email are not monitored.<br>Align &mdash; clearer career decisions.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
    text,
  };
}
