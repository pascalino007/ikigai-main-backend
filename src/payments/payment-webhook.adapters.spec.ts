import { BadRequestException } from '@nestjs/common';
import { normalizePaymentWebhook } from './payment-webhook.adapters';

describe('normalizePaymentWebhook', () => {
  describe('invalid body', () => {
    it.each([null, undefined, 'a string', 42])('rejects non-object body %p', (body) => {
      expect(() => normalizePaymentWebhook('stripe', body)).toThrow(BadRequestException);
    });
  });

  describe('stripe', () => {
    const baseObject = (overrides: Record<string, unknown> = {}) => ({
      id: 'pi_123',
      metadata: { transactionRef: 'BKG-1-999' },
      ...overrides,
    });

    it('maps payment_intent.succeeded to succeeded, reading ref + external id', () => {
      const event = normalizePaymentWebhook('stripe', {
        type: 'payment_intent.succeeded',
        data: { object: baseObject() },
      });
      expect(event).toEqual({
        status: 'succeeded',
        transactionRef: 'BKG-1-999',
        externalPaymentId: 'pi_123',
      });
    });

    it('falls back to metadata.transaction_ref (snake_case) when transactionRef is absent', () => {
      const event = normalizePaymentWebhook('stripe', {
        type: 'payment_intent.succeeded',
        data: { object: baseObject({ metadata: { transaction_ref: 'BKG-2-000' } }) },
      });
      expect(event.transactionRef).toBe('BKG-2-000');
    });

    it.each(['payment_intent.payment_failed', 'payment_intent.canceled'])(
      'maps %s to failed',
      (type) => {
        const event = normalizePaymentWebhook('stripe', {
          type,
          data: { object: baseObject() },
        });
        expect(event.status).toBe('failed');
      },
    );

    it('maps any other event type to pending', () => {
      const event = normalizePaymentWebhook('stripe', {
        type: 'payment_intent.created',
        data: { object: baseObject() },
      });
      expect(event.status).toBe('pending');
    });
  });

  describe('paygate', () => {
    it('always reports succeeded for a well-formed callback (no failure notifications exist)', () => {
      const event = normalizePaymentWebhook('paygate', {
        identifier: 'BULK-1-123',
        tx_reference: 'PG-ABC',
      });
      expect(event).toEqual({
        status: 'succeeded',
        transactionRef: 'BULK-1-123',
        externalPaymentId: 'PG-ABC',
      });
    });

    it('falls back to payment_reference when tx_reference is absent', () => {
      const event = normalizePaymentWebhook('paygate', {
        identifier: 'BULK-1-123',
        payment_reference: 'PG-REF',
      });
      expect(event.externalPaymentId).toBe('PG-REF');
    });

    it('throws when identifier is missing', () => {
      expect(() => normalizePaymentWebhook('paygate', { tx_reference: 'PG-ABC' })).toThrow(
        BadRequestException,
      );
    });
  });

  describe('generic (kkiapay / sandbox / unknown providers)', () => {
    it.each([
      ['transactionRef', 'transactionRef'],
      ['transaction_ref', 'transactionRef'],
      ['merchant_reference', 'transactionRef'],
      ['identifier', 'transactionRef'],
      ['reference', 'transactionRef'],
    ])('reads the ref from body.%s', (field) => {
      const event = normalizePaymentWebhook('kkiapay', { [field]: 'REF-1', status: 'success' });
      expect(event.transactionRef).toBe('REF-1');
    });

    it.each([
      'externalPaymentId',
      'payment_id',
      'providerPaymentId',
      'tx_reference',
      'transaction_id',
    ])('reads the external id from body.%s', (field) => {
      const event = normalizePaymentWebhook('kkiapay', {
        transactionRef: 'REF-1',
        [field]: 'EXT-1',
        status: 'success',
      });
      expect(event.externalPaymentId).toBe('EXT-1');
    });

    it.each([
      ['success', 'succeeded'],
      ['succeeded', 'succeeded'],
      ['successful', 'succeeded'],
      ['completed', 'succeeded'],
      ['paid', 'succeeded'],
      ['ok', 'succeeded'],
      ['failed', 'failed'],
      ['failure', 'failed'],
      ['error', 'failed'],
      ['declined', 'failed'],
      ['cancelled', 'failed'],
      ['canceled', 'failed'],
      ['pending', 'pending'],
      ['processing', 'pending'],
      ['initialized', 'pending'],
      ['some-unknown-status', 'pending'],
    ])('maps status "%s" to "%s"', (raw, expected) => {
      const event = normalizePaymentWebhook('sandbox', { transactionRef: 'REF-1', status: raw });
      expect(event.status).toBe(expected);
    });

    it('status matching is case-insensitive', () => {
      const event = normalizePaymentWebhook('sandbox', {
        transactionRef: 'REF-1',
        status: 'SUCCEEDED',
      });
      expect(event.status).toBe('succeeded');
    });

    it('reads status from `state` or `result` when `status` is absent', () => {
      expect(
        normalizePaymentWebhook('kkiapay', { transactionRef: 'REF-1', state: 'success' }).status,
      ).toBe('succeeded');
      expect(
        normalizePaymentWebhook('kkiapay', { transactionRef: 'REF-1', result: 'failed' }).status,
      ).toBe('failed');
    });

    it('throws when neither transactionRef nor externalPaymentId is present', () => {
      expect(() => normalizePaymentWebhook('kkiapay', { status: 'success' })).toThrow(
        BadRequestException,
      );
    });
  });
});
