import { BadRequestException } from '@nestjs/common';
import { createHmac } from 'crypto';
import { PaymentWebhookController } from './payment-webhook.controller';
import { PaymentWebhookService } from './payment-webhook.service';

describe('PaymentWebhookController', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  let webhookService: jest.Mocked<PaymentWebhookService>;
  let config: { get: jest.Mock };
  let controller: PaymentWebhookController;

  const req = (headers: Record<string, string> = {}) => ({ headers }) as never;

  beforeEach(() => {
    webhookService = {
      parseAndNormalize: jest.fn().mockReturnValue({ status: 'succeeded', transactionRef: 'REF-1' }),
      applyPaymentEvent: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<PaymentWebhookService>;
    config = { get: jest.fn() };
    controller = new PaymentWebhookController(webhookService, config as never);
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('skips signature verification for the sandbox provider outside production', async () => {
    process.env.NODE_ENV = 'test';
    config.get.mockReturnValue('some-secret');
    const result = await controller.handleWebhook('sandbox', { transactionRef: 'REF-1' }, undefined, req());
    expect(result).toEqual({ received: true });
  });

  it('never verifies a signature for paygate (no header they control exists)', async () => {
    process.env.NODE_ENV = 'production';
    config.get.mockReturnValue('some-secret');
    const result = await controller.handleWebhook(
      'paygate',
      { identifier: 'REF-1' },
      undefined,
      req(),
    );
    expect(result).toEqual({ received: true });
  });

  it('rejects any provider in production when PAYMENT_WEBHOOK_SECRET is unset', async () => {
    process.env.NODE_ENV = 'production';
    config.get.mockReturnValue(undefined);
    await expect(
      controller.handleWebhook('stripe', { transactionRef: 'REF-1' }, 'whatever', req()),
    ).rejects.toThrow(BadRequestException);
    expect(webhookService.applyPaymentEvent).not.toHaveBeenCalled();
  });

  it('allows an unsigned request outside production when the secret is unset', async () => {
    process.env.NODE_ENV = 'test';
    config.get.mockReturnValue(undefined);
    const result = await controller.handleWebhook(
      'stripe',
      { transactionRef: 'REF-1' },
      undefined,
      req(),
    );
    expect(result).toEqual({ received: true });
  });

  it('accepts a request whose HMAC-SHA256 signature matches the configured secret', async () => {
    const secret = 'shh';
    config.get.mockReturnValue(secret);
    const body = { transactionRef: 'REF-1', status: 'succeeded' };
    const signature = createHmac('sha256', secret)
      .update(Buffer.from(JSON.stringify(body), 'utf8'))
      .digest('hex');

    const result = await controller.handleWebhook('stripe', body, signature, req());
    expect(result).toEqual({ received: true });
    expect(webhookService.applyPaymentEvent).toHaveBeenCalled();
  });

  it('accepts the signature via the x-ikigai-signature fallback header', async () => {
    const secret = 'shh';
    config.get.mockReturnValue(secret);
    const body = { transactionRef: 'REF-1' };
    const signature = createHmac('sha256', secret)
      .update(Buffer.from(JSON.stringify(body), 'utf8'))
      .digest('hex');

    const result = await controller.handleWebhook(
      'stripe',
      body,
      undefined,
      req({ 'x-ikigai-signature': signature }),
    );
    expect(result).toEqual({ received: true });
  });

  it('rejects a request with a wrong or missing signature when a secret is configured', async () => {
    config.get.mockReturnValue('shh');
    await expect(
      controller.handleWebhook('stripe', { transactionRef: 'REF-1' }, 'not-the-right-signature', req()),
    ).rejects.toThrow(BadRequestException);
    expect(webhookService.applyPaymentEvent).not.toHaveBeenCalled();
  });

  it('rejects a signature computed over a different payload', async () => {
    const secret = 'shh';
    config.get.mockReturnValue(secret);
    const signatureForOtherBody = createHmac('sha256', secret)
      .update(Buffer.from(JSON.stringify({ transactionRef: 'SOMETHING-ELSE' }), 'utf8'))
      .digest('hex');

    await expect(
      controller.handleWebhook('stripe', { transactionRef: 'REF-1' }, signatureForOtherBody, req()),
    ).rejects.toThrow(BadRequestException);
  });
});
