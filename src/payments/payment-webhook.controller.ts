import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import type { Request } from 'express';
import { PaymentWebhookService } from './payment-webhook.service';

@Controller('payments')
export class PaymentWebhookController {
  constructor(
    private readonly webhookService: PaymentWebhookService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Aggregators should call this route (configure URL in each dashboard).
   * For Stripe signature verification you typically need the raw body on a dedicated middleware route.
   */
  @Post('webhooks/:provider')
  @HttpCode(200)
  async handleWebhook(
    @Param('provider') provider: string,
    @Body() body: unknown,
    @Headers('x-payment-signature') signature: string | undefined,
    @Req() req: Request,
  ): Promise<{ received: boolean }> {
    this.assertSignatureIfConfigured(provider, body, signature, req);

    const event = this.webhookService.parseAndNormalize(provider, body);
    await this.webhookService.applyPaymentEvent(event);
    return { received: true };
  }

  private assertSignatureIfConfigured(
    provider: string,
    body: unknown,
    signature: string | undefined,
    req: Request,
  ): void {
    if (provider === 'sandbox' && process.env.NODE_ENV !== 'production') {
      return;
    }

    const secret = this.config.get<string>('PAYMENT_WEBHOOK_SECRET');
    const isProd = process.env.NODE_ENV === 'production';

    if (!secret) {
      if (isProd) {
        throw new BadRequestException(
          'PAYMENT_WEBHOOK_SECRET must be set in production',
        );
      }
      return;
    }

    const payload =
      typeof body === 'string'
        ? body
        : Buffer.from(JSON.stringify(body ?? {}), 'utf8');
    const expected = createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    const header =
      signature ??
      (req.headers['x-ikigai-signature'] as string | undefined) ??
      '';

    const ok =
      header.length === expected.length &&
      timingSafeEqual(Buffer.from(header, 'utf8'), Buffer.from(expected, 'utf8'));

    if (!ok) {
      throw new BadRequestException('Invalid webhook signature');
    }
  }
}
