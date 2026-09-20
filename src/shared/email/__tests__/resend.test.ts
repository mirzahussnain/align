import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const resendSdk = vi.hoisted(() => ({
  construct: vi.fn(),
  send: vi.fn(),
}));

vi.mock('server-only', () => ({}));

vi.mock('resend', () => ({
  Resend: class Resend {
    emails = { send: resendSdk.send };

    constructor(apiKey: string) {
      resendSdk.construct(apiKey);
    }
  },
}));

import { EmailDeliveryError, sendLifecycleEmail } from '../resend';
import { verificationEmail } from '../templates/lifecycle';

const originalEnv = {
  resendApiKey: process.env.RESEND_API_KEY,
  authEmailFrom: process.env.AUTH_EMAIL_FROM,
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.RESEND_API_KEY = 're_test_key';
  process.env.AUTH_EMAIL_FROM = 'Align <noreply@align.vyndra.tech>';
  resendSdk.send.mockResolvedValue({ data: { id: 'email_1' }, error: null });
});

afterEach(() => {
  if (originalEnv.resendApiKey === undefined) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = originalEnv.resendApiKey;

  if (originalEnv.authEmailFrom === undefined) delete process.env.AUTH_EMAIL_FROM;
  else process.env.AUTH_EMAIL_FROM = originalEnv.authEmailFrom;
});

describe('sendLifecycleEmail', () => {
  it('sends both rendered formats from the configured Align address with idempotency', async () => {
    const email = verificationEmail({ name: 'Ada', url: 'https://align.test/verify' });

    await sendLifecycleEmail({
      to: 'ada@example.com',
      template: email,
      idempotencyKey: 'verify/u1',
    });

    expect(resendSdk.construct).toHaveBeenCalledWith('re_test_key');
    expect(resendSdk.send).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'Align <noreply@align.vyndra.tech>',
        to: 'ada@example.com',
        subject: 'Verify your Align email',
        html: email.html,
        text: email.text,
      }),
      { idempotencyKey: 'verify/u1' }
    );
  });

  it('omits idempotency options when no key is supplied', async () => {
    const email = verificationEmail({ name: 'Ada', url: 'https://align.test/verify' });

    await sendLifecycleEmail({ to: 'ada@example.com', template: email });

    expect(resendSdk.send).toHaveBeenCalledWith(expect.any(Object), undefined);
  });

  it('maps a provider response error to an opaque internal error without logging secrets', async () => {
    const providerMessage = 'provider rejected https://align.test/verify?token=secret-token';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    resendSdk.send.mockResolvedValue({ data: null, error: { message: providerMessage } });

    const delivery = sendLifecycleEmail({
      to: 'ada@example.com',
      template: verificationEmail({
        name: 'Ada',
        url: 'https://align.test/verify?token=secret-token',
      }),
    });

    await expect(delivery).rejects.toBeInstanceOf(EmailDeliveryError);
    await expect(delivery).rejects.toThrow('Email delivery failed.');
    await expect(delivery).rejects.not.toThrow(providerMessage);
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it('maps thrown provider failures to the same opaque internal error', async () => {
    resendSdk.send.mockRejectedValue(new Error('socket failed with provider detail'));

    await expect(
      sendLifecycleEmail({
        to: 'ada@example.com',
        template: verificationEmail({ name: 'Ada', url: 'https://align.test/verify' }),
      })
    ).rejects.toMatchObject({ name: 'EmailDeliveryError', message: 'Email delivery failed.' });
  });

  it('fails safely when the sender configuration is absent', async () => {
    delete process.env.AUTH_EMAIL_FROM;

    await expect(
      sendLifecycleEmail({
        to: 'ada@example.com',
        template: verificationEmail({ name: 'Ada', url: 'https://align.test/verify' }),
      })
    ).rejects.toMatchObject({ name: 'EmailDeliveryError', message: 'Email delivery failed.' });
    expect(resendSdk.send).not.toHaveBeenCalled();
  });
});
