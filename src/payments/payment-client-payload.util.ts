import { ConfigService } from '@nestjs/config';

export interface CheckoutClientPayloadContext {
  transactionRef: string;
  amount: number;
  currency: string;
  bookingId: number;
  paymentChannel: string;
  paymentProvider: string;
}

/**
 * Data the mobile app or web client needs next (SDK session, redirect URL, etc.).
 * Integrate real Stripe / Kkiapay / Paygate APIs in a dedicated provider service when keys are available.
 */
export function buildPaymentClientPayload(
  config: ConfigService,
  ctx: CheckoutClientPayloadContext,
): Record<string, unknown> {
  const publicUrl =
    config.get<string>('PUBLIC_APP_URL') ?? 'http://localhost:3000';

  switch (ctx.paymentProvider) {
    case 'stripe':
      return {
        provider: 'stripe',
        hint:
          'Create a PaymentIntent on your server with stripe-node; put transactionRef in metadata.transactionRef for webhooks.',
        metadata: {
          transactionRef: ctx.transactionRef,
          bookingId: String(ctx.bookingId),
        },
        amount: ctx.amount,
        currency: ctx.currency.toLowerCase(),
        payment_method_types: ['card'],
        payment_channel_hint: ctx.paymentChannel,
      };
    case 'kkiapay':
      return {
        provider: 'kkiapay',
        hint: 'Open Kkiapay widget with amount and data referencing transactionRef.',
        callbackUrl: `${publicUrl}/payments/kkiapay/callback`,
        webhookUrl: `${publicUrl}/api/payments/webhooks/kkiapay`,
        transactionRef: ctx.transactionRef,
        amount: ctx.amount,
      };
    case 'paygate':
      return {
        provider: 'paygate',
        hint: 'Initialize Paygate session with reference = transactionRef.',
        reference: ctx.transactionRef,
        amount: ctx.amount,
        currency: ctx.currency,
      };
    default:
      return {
        provider: 'sandbox',
        hint: 'POST the sandbox webhook to flip this transaction to succeeded (dev only).',
        simulateWebhook: {
          method: 'POST',
          path: '/payments/webhooks/sandbox',
          body: {
            transactionRef: ctx.transactionRef,
            status: 'succeeded',
            externalPaymentId: `sandbox-${ctx.transactionRef}`,
          },
        },
      };
  }
}
