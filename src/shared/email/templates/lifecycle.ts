import { renderEmailShell, type LifecycleTemplate } from './shell';

interface NamedRecipient {
  name: string;
}

interface LinkedLifecycleAction extends NamedRecipient {
  url: string;
}

export function verificationEmail(input: LinkedLifecycleAction): LifecycleTemplate {
  return renderEmailShell({
    subject: 'Verify your Align email',
    heading: 'Verify your email',
    name: input.name,
    paragraphs: ['Confirm your email address to finish setting up your Align account.'],
    action: { label: 'Verify email', url: input.url },
    securityNote: 'If you did not create an Align account, you can safely ignore this email.',
  });
}

export function welcomeEmail(input: LinkedLifecycleAction): LifecycleTemplate {
  return renderEmailShell({
    subject: 'Welcome to Align',
    heading: 'Welcome to Align',
    name: input.name,
    paragraphs: [
      'Your account is ready. Align helps you understand your experience, compare opportunities, and make clearer career decisions.',
    ],
    action: { label: 'Go to your workspace', url: input.url },
  });
}

export function passwordResetEmail(input: LinkedLifecycleAction): LifecycleTemplate {
  return renderEmailShell({
    subject: 'Reset your Align password',
    heading: 'Reset your password',
    name: input.name,
    paragraphs: ['We received a request to reset the password for your Align account.'],
    action: { label: 'Reset password', url: input.url },
    securityNote: 'If you did not request a password reset, you can safely ignore this email.',
  });
}

export function passwordChangedEmail(input: NamedRecipient): LifecycleTemplate {
  return renderEmailShell({
    subject: 'Your Align password was changed',
    heading: 'Your password was changed',
    name: input.name,
    paragraphs: ['The password for your Align account was changed successfully.'],
    securityNote: 'If you did not make this change, contact Align support immediately.',
  });
}

export function accountDeletedEmail(input: NamedRecipient): LifecycleTemplate {
  return renderEmailShell({
    subject: 'Your Align account has been deleted',
    heading: 'Your account has been deleted',
    name: input.name,
    paragraphs: [
      'Your Align account and the associated personal data covered by our deletion process have been deleted.',
      'Thank you for using Align.',
    ],
    securityNote: 'If you did not request this deletion, contact Align support immediately.',
  });
}
