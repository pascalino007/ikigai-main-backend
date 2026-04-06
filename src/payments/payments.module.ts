import { Module } from '@nestjs/common';
import { PaymentWebhookController } from './payment-webhook.controller';
import { PaymentWebhookService } from './payment-webhook.service';
import { StripeService } from './stripe.service';
import { KkiapayService } from './kkiapay.service';

@Module({
  controllers: [PaymentWebhookController],
  providers: [PaymentWebhookService, StripeService, KkiapayService],
  exports: [StripeService, KkiapayService],
})
export class PaymentsModule {}
