import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentWebhookController } from './payment-webhook.controller';
import { PaymentWebhookService } from './payment-webhook.service';
import { StripeService } from './stripe.service';
import { KkiapayService } from './kkiapay.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { MailModule } from '../mail/mail.module';
import { Shops } from '../shops/shop.entity';
import { Services } from '../services/services.entity';
import { Users } from '../users/user.entity';
import { Notification } from '../notifications/notification.entity';
import { Subscription } from '../subscriptions/subscription.entity';
import { SubscriptionPlan } from '../subscriptions/subscription-plan.entity';
import { MiServiceOrder } from '../mi-services/mi-service-order.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Shops, Services, Users, Notification, Subscription, SubscriptionPlan, MiServiceOrder]),
    NotificationsModule,
    MailModule,
  ],
  controllers: [PaymentWebhookController],
  providers: [PaymentWebhookService, StripeService, KkiapayService],
  exports: [StripeService, KkiapayService],
})
export class PaymentsModule {}
