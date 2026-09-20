import 'server-only';

import { Resend } from 'resend';

import type { LifecycleTemplate } from './templates/shell';

export type { LifecycleTemplate } from './templates/shell';

export interface SendLifecycleEmailInput {
  to: string;
  template: LifecycleTemplate;
  idempotencyKey?: string;
}

export class EmailDeliveryError extends Error {
  constructor() {
    super('Email delivery failed.');
    this.name = 'EmailDeliveryError';
  }
}

let resendClient: Resend | undefined;

function required(name: 'RESEND_API_KEY' | 'AUTH_EMAIL_FROM'): string {
  const value = process.env[name]?.trim();
  if (!value) throw new EmailDeliveryError();
  return value;
}

function client(): Resend {
  if (!resendClient) resendClient = new Resend(required('RESEND_API_KEY'));
  return resendClient;
}

function fromAddress(): string {
  return required('AUTH_EMAIL_FROM');
}

export async function sendLifecycleEmail(input: SendLifecycleEmailInput): Promise<void> {
  try {
    const result = await client().emails.send(
      {
        from: fromAddress(),
        to: input.to,
        subject: input.template.subject,
        html: input.template.html,
        text: input.template.text,
      },
      input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : undefined
    );

    if (result.error) throw new EmailDeliveryError();
  } catch {
    throw new EmailDeliveryError();
  }
}
