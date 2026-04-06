import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);
  private stripe: ReturnType<typeof Stripe> | null = null;

  constructor(private readonly config: ConfigService) {
    const secretKey = this.config.get<string>('STRIPE_SECRET_KEY');
    if (secretKey) {
      this.stripe = Stripe(secretKey, { apiVersion: '2024-06-20' as any });
      this.logger.log('Stripe initialized');
    } else {
      this.logger.warn(
        'STRIPE_SECRET_KEY not set – Stripe payments will fall back to sandbox',
      );
    }
  }

  get isConfigured(): boolean {
    return !!this.stripe;
  }

  get publishableKey(): string {
    return this.config.get<string>('STRIPE_PUBLISHABLE_KEY') ?? '';
  }

  /**
   * Creates a Stripe PaymentIntent for wallet top-up or direct booking payment.
   * Returns the clientSecret the mobile app needs to confirm payment via Stripe SDK.
   */
  async createPaymentIntent(params: {
    amount: number;
    currency: string;
    metadata: Record<string, string>;
  }): Promise<{
    clientSecret: string;
    paymentIntentId: string;
  }> {
    if (!this.stripe) {
      throw new Error('Stripe is not configured');
    }

    const intent = await this.stripe.paymentIntents.create({
      amount: params.amount,
      currency: params.currency.toLowerCase(),
      payment_method_types: ['card'],
      metadata: params.metadata,
    });

    return {
      clientSecret: intent.client_secret!,
      paymentIntentId: intent.id,
    };
  }
}
