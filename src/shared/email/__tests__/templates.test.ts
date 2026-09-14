import { describe, expect, it } from 'vitest';

import {
  accountDeletedEmail,
  passwordChangedEmail,
  passwordResetEmail,
  verificationEmail,
  welcomeEmail,
} from '../templates/lifecycle';

describe('lifecycle email templates', () => {
  it('renders the verification subject, action, and fallback URL', () => {
    const email = verificationEmail({ name: 'Ada', url: 'https://align.test/verify' });

    expect(email.subject).toBe('Verify your Align email');
    expect(email.html).toContain('Verify email');
    expect(email.text).toContain('https://align.test/verify');
    expect(email.html).not.toContain('<script');
  });

  it('renders every lifecycle message through the branded table shell', () => {
    const templates = [
      verificationEmail({ name: 'Ada', url: 'https://align.test/verify' }),
      welcomeEmail({ name: 'Ada', url: 'https://align.test/workspace' }),
      passwordResetEmail({ name: 'Ada', url: 'https://align.test/reset' }),
      passwordChangedEmail({ name: 'Ada' }),
      accountDeletedEmail({ name: 'Ada' }),
    ];

    expect(templates.map(({ subject }) => subject)).toEqual([
      'Verify your Align email',
      'Welcome to Align',
      'Reset your Align password',
      'Your Align password was changed',
      'Your Align account has been deleted',
    ]);

    for (const template of templates) {
      expect(template.html).toContain('role="presentation"');
      expect(template.html).toContain('>Align<');
      expect(template.html).toContain('This is an automated message. Replies to this email are not monitored.');
      expect(template.text).toContain('This is an automated message. Replies to this email are not monitored.');
      expect(template.html).not.toContain('Reply to this email');
      expect(template.text).not.toContain('Reply to this email');
      expect(template.html).not.toContain('<script');
      expect(template.text.length).toBeGreaterThan(0);
    }
  });

  it('renders the approved CTA labels and plain-text fallback URLs', () => {
    const welcome = welcomeEmail({ name: 'Ada', url: 'https://align.test/workspace' });
    const reset = passwordResetEmail({ name: 'Ada', url: 'https://align.test/reset' });

    expect(welcome.html).toContain('Go to your workspace');
    expect(welcome.text).toContain('https://align.test/workspace');
    expect(reset.html).toContain('Reset password');
    expect(reset.text).toContain('https://align.test/reset');
  });

  it('gives self-service guidance without an unconfigured support channel', () => {
    const changed = passwordChangedEmail({ name: 'Ada' });
    const deleted = accountDeletedEmail({ name: 'Ada' });

    for (const format of [changed.html, changed.text]) {
      expect(format).toContain(
        'If you did not make this change, reset your password and review your account security.'
      );
      expect(format).not.toContain('contact Align support');
    }

    for (const format of [deleted.html, deleted.text]) {
      expect(format).toContain(
        'If you did not request this deletion, change the password for the email account you used with Align.'
      );
      expect(format).not.toContain('contact Align support');
    }
  });

  it('escapes user-controlled names and lifecycle URLs in HTML', () => {
    const email = verificationEmail({
      name: '<script>alert("name")</script>',
      url: 'https://align.test/verify?next="/><script>alert(1)</script>&user=ada',
    });

    expect(email.html).not.toContain('<script');
    expect(email.html).not.toContain('href="https://align.test/verify?next="/>');
    expect(email.html).toContain('&lt;script&gt;alert(&quot;name&quot;)&lt;/script&gt;');
    expect(email.html).toContain('&amp;user=ada');
  });
});
