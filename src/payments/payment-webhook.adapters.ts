import { BadRequestException } from '@nestjs/common';

export type WebhookPaymentStatus = 'succeeded' | 'failed' | 'pending';

export interface NormalizedPaymentEvent {
  status: WebhookPaymentStatus;
  transactionRef?: string;
  externalPaymentId?: string;
}

function asRecord(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== 'object') {
    throw new BadRequestException('Invalid webhook body');
  }
  return body as Record<string, unknown>;
}

function mapGenericStatus(raw: string): WebhookPaymentStatus {
  const s = raw.toLowerCase();
  if (
    ['success', 'succeeded', 'successful', 'completed', 'paid', 'ok'].includes(
      s,
    )
  ) {
    return 'succeeded';
  }
  if (
    ['failed', 'failure', 'error', 'declined', 'cancelled', 'canceled'].includes(
      s,
    )
  ) {
    return 'failed';
  }
  if (['pending', 'processing', 'initialized'].includes(s)) {
    return 'pending';
  }
  return 'pending';
}

/**
 * Normalizes provider-specific webhook JSON into a single shape.
 * Extend with real signature verification in the controller / guard per provider.
 */
export function normalizePaymentWebhook(
  provider: string,
  body: unknown,
): NormalizedPaymentEvent {
  const o = asRecord(body);

  if (provider === 'stripe') {
    const type = String(o.type ?? '');
    const data = asRecord(o.data ?? {});
    const obj = asRecord(data.object ?? {});
    const metadata = asRecord(obj.metadata ?? {});
    const transactionRef =
      (metadata.transactionRef as string) ||
      (metadata.transaction_ref as string);
    const externalPaymentId = (obj.id as string) || undefined;
    if (type === 'payment_intent.succeeded') {
      return {
        status: 'succeeded',
        transactionRef,
        externalPaymentId,
      };
    }
    if (
      type === 'payment_intent.payment_failed' ||
      type === 'payment_intent.canceled'
    ) {
      return {
        status: 'failed',
        transactionRef,
        externalPaymentId,
      };
    }
    return { status: 'pending', transactionRef, externalPaymentId };
  }

  const transactionRef =
    (o.transactionRef as string) ||
    (o.transaction_ref as string) ||
    (o.merchant_reference as string) ||
    (o.reference as string);
  const externalPaymentId =
    (o.externalPaymentId as string) ||
    (o.payment_id as string) ||
    (o.providerPaymentId as string) ||
    (o.transaction_id as string);

  const rawStatus = String(
    o.status ?? o.state ?? o.result ?? '',
  ).toLowerCase();

  if (!transactionRef && !externalPaymentId) {
    throw new BadRequestException(
      'Webhook must include transactionRef or externalPaymentId',
    );
  }

  return {
    status: mapGenericStatus(rawStatus),
    transactionRef,
    externalPaymentId,
  };
}
