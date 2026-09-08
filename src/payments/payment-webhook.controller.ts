import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Logger,
  Param,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import type { Request, Response } from 'express';
import { PaymentWebhookService } from './payment-webhook.service';

@Controller('payments')
export class PaymentWebhookController {
  private readonly logger = new Logger(PaymentWebhookController.name);

  constructor(
    private readonly webhookService: PaymentWebhookService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Browser lands here after paying on a hosted page (e.g. PayGateGlobal
   * Méthode 2's `url` param). Purely cosmetic — the actual confirmation is
   * the POST below, which PayGateGlobal sends to this same path.
   */
  @Get('webhooks/:provider')
  landOnReturnPage(@Param('provider') provider: string, @Res() res: Response): void {
    this.logger.log(`[return] browser landed on return page for provider=${provider}`);
    res
      .type('html')
      .send(
        '<!doctype html><html><body style="font-family:sans-serif;text-align:center;padding:48px 24px"><h2>Paiement reçu</h2><p>Vous pouvez fermer cette page et retourner à l\'application Ikigai.</p></body></html>',
      );
  }

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
    this.logger.log(`[webhook] received provider=${provider} body=${JSON.stringify(body)}`);

    this.assertSignatureIfConfigured(provider, body, signature, req);

    const event = this.webhookService.parseAndNormalize(provider, body);
    this.logger.log(
      `[webhook] normalized provider=${provider}: status=${event.status} ref=${event.transactionRef ?? '(none)'} externalId=${event.externalPaymentId ?? '(none)'}`,
    );
    await this.webhookService.applyPaymentEvent(event);
    this.logger.log(`[webhook] applied provider=${provider} ref=${event.transactionRef ?? '(none)'}`);
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

    // PayGateGlobal doesn't sign its webhook calls with anything we control —
    // there is no shared secret or header to verify per their docs, so this
    // generic HMAC-of-our-own-secret check can never pass for it. Skipping
    // it here; correctness instead relies on the `identifier` matching a
    // real pending transaction (see PaymentWebhookService.applyPaymentEvent).
    if (provider === 'paygate') {
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
